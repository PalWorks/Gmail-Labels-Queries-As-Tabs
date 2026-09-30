/**
 * content.ts
 *
 * Main content script coordinator for Gmail Labels as Tabs.
 * Initializes the extension, wires together all modules,
 * and manages the top-level lifecycle.
 *
 * Module structure:
 *   modules/state.ts    – Shared mutable state & constants
 *   modules/theme.ts    – Theme management (force-dark/light)
 *   modules/unread.ts   – Unread count (Atom feed + DOM scraping + XHR updates)
 *   modules/dragdrop.ts – Drag-and-drop for tab bar & modal list
 *   modules/tabs.ts     – Tab rendering, navigation, dropdown menus
 *   modules/senderIcons.ts – Sender chips in the inbox list (opt-in)
 *   modules/modals/  - All modal dialogs (pin, edit, delete, settings, import, uninstall)
 */

import {
    addTab,
    removeTab,
    getSettings,
    ensureAccountRegistered,
    migrateLegacySettingsIfNeeded,
    getGlobalTheme,
    migrateThemeToGlobalIfNeeded,
    GLOBAL_THEME_STORAGE_KEY,
    Theme,
    takePendingOnboarding,
} from './utils/storage';

// Module imports
import { TABS_BAR_ID, TOOLBAR_SELECTORS, setAppSettings, setUserEmail, getUserEmail, getAppSettings } from './modules/state';
import { showOnboarding, SHOW_ONBOARDING_ACTION } from './modules/onboarding/onboardingModal';
import { applyTheme, listenForSystemThemeChanges, watchGmailTheme } from './modules/theme';
import { handleUnreadUpdates, computeKnownLabelTokens } from './modules/unread';
import { renderTabs, createTabsBar, updateActiveTab, setModalCallbacks } from './modules/tabs';
import {
    showPinModal,
    showEditModal,
    showDeleteModal,
    toggleSettingsModal,
    setRenderCallback,
    reportSettingsWriteFailure,
} from './modules/modals';
import { installLabelMenu, uninstallLabelMenu } from './modules/labelMenu';
import { installSenderIcons, refreshSenderIcons, uninstallSenderIcons, SenderIconPrefs } from './modules/senderIcons';
import { claimPage, removeOurPageFurniture } from './modules/handover';
import { PING_ACTION, TOGGLE_SETTINGS_ACTION } from './modules/messages';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Cache of the browser-wide theme so the OS-theme-change listener (which needs
// a synchronous getter) can read it without an async storage round-trip.
let currentGlobalTheme: Theme = 'light';

// Content-script lifecycle primitives (private to this module).
let observer: MutationObserver | null = null;
let initPromise: Promise<void> | null = null;

// Set once another copy of this script has taken the page over. Everything
// that could put something back on screen checks it, because a copy that has
// handed over must not keep re-injecting a bar the live copy does not own.
let standingDown = false;

// What this copy registered on objects it shares with any other copy in the
// page: the extension's own chrome.* events, and the page's document and
// window. Two live copies of the same version share one chrome.runtime, so a
// copy that stands down must take its listeners with it, or both answer every
// message and both re-render on every storage change.
const disposers: Array<() => void> = [];

function listen<T extends EventTarget>(target: T, type: string, handler: EventListener): void {
    target.addEventListener(type, handler);
    disposers.push(() => target.removeEventListener(type, handler));
}

// Account detection runs until Gmail names the account, on a slow link too.
let accountPoller: ReturnType<typeof setInterval> | null = null;
let accountPollerSlowdown: ReturnType<typeof setTimeout> | null = null;

// Set when this copy consumed the first-run tour flag, so that a copy which
// stands down before or after opening the tour can pass it on.
let tourIsMine = false;

/** Fired by a copy that stands down holding the first-run tour, for the next copy to show it. */
const TOUR_HANDOVER_EVENT = 'gmailTabs:tourHandover';

// ---------------------------------------------------------------------------
// Module Wiring (resolve circular deps via callbacks)
// ---------------------------------------------------------------------------

setRenderCallback(renderTabs);
setModalCallbacks({
    showPinModal,
    showEditModal,
    showDeleteModal,
    toggleSettingsModal,
});

// Listen for re-render events from dragdrop smart-drop handler
listen(document, 'gmailTabs:rerender', () => {
    if (!standingDown) renderTabs();
});

// ---------------------------------------------------------------------------
// Observer
// ---------------------------------------------------------------------------

let observerDebounceTimer: ReturnType<typeof setTimeout> | null = null;

function startObserver(): void {
    if (standingDown) return;
    if (observer) observer.disconnect();

    observer = new MutationObserver((_mutations) => {
        if (standingDown) return;
        if (observerDebounceTimer) return;
        observerDebounceTimer = setTimeout(() => {
            observerDebounceTimer = null;
            attemptInjection();
            updateActiveTab();
        }, 100); // ≤10 calls/second
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true,
    });
}

// ---------------------------------------------------------------------------
// Injection
// ---------------------------------------------------------------------------

// Bounded, single-flight retry for the initial injection. Gmail's toolbar may
// not exist yet on first paint; we retry a bounded number of times, then defer
// to the MutationObserver (which re-invokes attemptInjection on DOM changes).
const INJECTION_RETRY_MS = 500;
const MAX_INJECTION_RETRIES = 40; // ~20s of active polling before deferring to the observer
let injectionRetryTimer: ReturnType<typeof setTimeout> | null = null;
let injectionRetries = 0;

function scheduleInjectionRetry(): void {
    if (standingDown) return;
    if (injectionRetryTimer) return; // single-flight: never stack timers
    if (injectionRetries >= MAX_INJECTION_RETRIES) return; // bounded: stop polling, rely on observer
    injectionRetryTimer = setTimeout(() => {
        injectionRetryTimer = null;
        injectionRetries++;
        attemptInjection();
    }, INJECTION_RETRY_MS);
}

/**
 * Attempt to inject the tabs bar.
 * Retries (bounded, single-flight) if the insertion point isn't found yet.
 */
function attemptInjection(): void {
    if (standingDown) return;
    const existingBar = document.getElementById(TABS_BAR_ID);

    let injectionPoint: Element | null = null;
    for (const selector of TOOLBAR_SELECTORS) {
        const candidates = document.querySelectorAll(selector);
        for (const el of candidates) {
            if (el.getBoundingClientRect().height > 0) {
                injectionPoint = el;
                break;
            }
        }
        if (injectionPoint) break;
    }

    if (injectionPoint) {
        if (!existingBar) {
            const tabsBar = createTabsBar();
            injectionPoint.insertAdjacentElement('afterend', tabsBar);
            renderTabs();
        } else if (existingBar.previousElementSibling !== injectionPoint) {
            injectionPoint.insertAdjacentElement('afterend', existingBar);
        }
        updateActiveTab();

        // Injection succeeded: reset the retry budget and cancel any pending
        // timer so a later Gmail re-render can trigger a fresh round if needed.
        injectionRetries = 0;
        if (injectionRetryTimer) {
            clearTimeout(injectionRetryTimer);
            injectionRetryTimer = null;
        }
    } else {
        scheduleInjectionRetry();
    }
}

// ---------------------------------------------------------------------------
// Email Detection
// ---------------------------------------------------------------------------

function extractEmailFromDOM(): string | null {
    console.log('Gmail Tabs: Extracting email from DOM...');

    const title = document.title;
    console.log('Gmail Tabs: Document Title:', title);
    const emailRegex = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/;

    // The account is the last address in the title: Gmail titles a thread
    // "Subject - me@example.com - Gmail", and a subject can hold an address of
    // its own, so the first match could name a stranger's account.
    const titleMatches = title.match(new RegExp(emailRegex.source, 'g'));
    if (titleMatches) {
        const account = titleMatches[titleMatches.length - 1];
        console.log('Gmail Tabs: Found email in title:', account);
        return account;
    }

    const accountElement = document.querySelector(
        '[aria-label*="@"][aria-label*="Google Account"], a[aria-label*="@"]'
    );
    if (accountElement) {
        const label = accountElement.getAttribute('aria-label');
        console.log('Gmail Tabs: Found account element label:', label);
        const emailMatch = label?.match(emailRegex);
        if (emailMatch) {
            console.log('Gmail Tabs: Found email in aria-label:', emailMatch[1]);
            return emailMatch[1];
        }
    }

    console.log('Gmail Tabs: Could not extract email from DOM.');
    return null;
}

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

async function finalizeInit(email: string): Promise<void> {
    console.log('Gmail Tabs: Finalizing init for', email);
    try {
        await migrateLegacySettingsIfNeeded(email);
        console.log('Gmail Tabs: Migration check complete');

        // Seed the browser-wide theme once (from legacy sync key or this
        // account's per-account theme), then apply it. Theme is global across
        // all accounts in the window, not per-account.
        await migrateThemeToGlobalIfNeeded(email);

        // Make this account visible to the options page even if the user never
        // changes a setting.
        await ensureAccountRegistered(email);

        const settings = await getSettings(email);
        // A newer copy may have taken the page over while this one waited on
        // storage; it builds everything below itself.
        if (standingDown) return;
        setAppSettings(settings);
        console.log('Gmail Tabs: Settings loaded for', email, getAppSettings());

        // Theme before the first paint, not after. Until `force-light` or
        // `force-dark` is on <body>, toolbar.css falls back to its
        // `prefers-color-scheme` block — so a user with a dark desktop and a
        // light Gmail saw the bar flash dark for a frame, which is the exact
        // mismatch that whole mechanism exists to avoid.
        currentGlobalTheme = await getGlobalTheme();
        if (standingDown) return;
        applyTheme(currentGlobalTheme);

        renderTabs();
        broadcastKnownLabels();

        // Listen for OS theme changes to auto-update 'system' mode
        disposers.push(listenForSystemThemeChanges(() => currentGlobalTheme));

        // Gmail paints its own background late and the user can switch Gmail's
        // theme without reloading, so keep 'system' mode following Gmail itself
        // rather than the OS.
        disposers.push(watchGmailTheme(() => currentGlobalTheme));

        // Only now: the item reads "Show as Tabs" or "Remove from Tabs"
        // depending on the tab list, so installing it before settings are
        // loaded would let it offer to add a tab that already exists.
        installLabelMenuItem();

        // Also only now, for a stronger reason: whether it may fetch icons at
        // all is a setting, and until settings are loaded the answer is no.
        installSenderIcons({ getAccountId: () => getUserEmail(), getPrefs: senderIconPrefs });
    } catch (e) {
        console.error('Gmail Tabs: Error in finalizeInit', e);
    }
}

async function initializeFromDOM(): Promise<void> {
    console.log('Gmail Tabs: Starting DOM-based initialization...');
    let email = extractEmailFromDOM();
    if (email) {
        console.log('Gmail Tabs: Email found immediately:', email);
        if (!getUserEmail()) {
            setUserEmail(email);
            initPromise = initPromise || finalizeInit(email);
            await initPromise;
        }
    } else {
        console.log('Gmail Tabs: Email not found yet, polling DOM...');
        // An async interval callback has nowhere to reject to, so it catches
        // its own failure. Without this, a storage error during the polling
        // path lost the tab bar in silence while the immediate path above
        // reported the identical failure.
        const poll = (): void => {
            if (standingDown) return stopAccountPolling();
            email = extractEmailFromDOM();
            if (!email) return;
            console.log('Gmail Tabs: Account detected via polling:', email);
            stopAccountPolling();
            if (getUserEmail()) return;
            setUserEmail(email);
            initPromise = initPromise || finalizeInit(email);
            initPromise.catch((err) => {
                console.error('Gmail Tabs: account initialization failed after polling', err);
            });
        };
        accountPoller = setInterval(poll, 1000);

        // A minute of polling every second, then every five seconds for as
        // long as it takes. Stopping outright used to leave a Gmail that took
        // over a minute to name the account (a slow link, a login
        // interstitial) with an empty bar until the tab was reloaded.
        accountPollerSlowdown = setTimeout(() => {
            accountPollerSlowdown = null;
            if (accountPoller) clearInterval(accountPoller);
            accountPoller = standingDown ? null : setInterval(poll, 5000);
        }, 60000);
    }
}

function stopAccountPolling(): void {
    if (accountPoller) clearInterval(accountPoller);
    if (accountPollerSlowdown) clearTimeout(accountPollerSlowdown);
    accountPoller = null;
    accountPollerSlowdown = null;
}

/**
 * Wire the "Show as Tabs" item in Gmail's own label menu.
 *
 * Everything the module needs is passed in rather than imported by it, for
 * the same reason the modals are wired this way: it keeps the module testable
 * without a Gmail page, and it keeps the storage write path in one place.
 *
 * `getTabs` reads the live settings on every call rather than closing over a
 * snapshot. The menu can be opened minutes after this runs, and by then the
 * user may have added or removed tabs from the options page or another Gmail
 * tab, either of which would make a captured list wrong.
 */
function installLabelMenuItem(): void {
    installLabelMenu({
        getAccountId: () => getUserEmail(),
        getTabs: () => getAppSettings()?.tabs ?? [],
        addLabelTab: async (title, labelName) => {
            const account = getUserEmail();
            if (!account) return;
            setAppSettings(await addTab(account, title, labelName, 'label'));
        },
        removeLabelTab: async (tabId) => {
            const account = getUserEmail();
            if (!account) return;
            setAppSettings(await removeTab(account, tabId));
        },
        onChanged: () => {
            renderTabs();
            broadcastKnownLabels();
        },
        onError: (error) => {
            // Visible, because production builds drop the console: a full
            // sync item used to make "Show as Tabs" do nothing, silently.
            console.error('Gmail Tabs: the label menu action failed', error);
            reportSettingsWriteFailure(error);
        },
    });
}

/**
 * The sender icon preferences, read fresh on every scan so a change made on
 * the options page applies without a reload. Null until settings are loaded,
 * which the module reads as "off".
 */
function senderIconPrefs(): SenderIconPrefs | null {
    const settings = getAppSettings();
    if (!settings) return null;
    return {
        enabled: settings.senderIcons,
        favicons: settings.senderIconsFavicons,
        domainText: settings.senderIconsDomain,
        mailboxStyle: settings.senderIconsMailbox,
    };
}

function injectPageWorld(): void {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('js/xhrInterceptor.js');
    script.onload = () => script.remove();
    (document.head || document.documentElement).appendChild(script);
}

/**
 * Tell the page-world XHR interceptor which labels the user has tabs for, so it
 * can ignore unrelated [string, number] tuples from Gmail's sync protocol.
 */
function broadcastKnownLabels(): void {
    const settings = getAppSettings();
    if (!settings) return;
    try {
        document.dispatchEvent(
            new CustomEvent('gmailTabs:setKnownLabels', { detail: computeKnownLabelTokens(settings.tabs) })
        );
    } catch {
        /* non-fatal */
    }
}

function handleUrlChange(): void {
    updateActiveTab();
}

// ---------------------------------------------------------------------------
// Main Init
// ---------------------------------------------------------------------------

/**
 * Stop, because another copy of this script has taken the page over.
 *
 * Called when the extension is updated or reloaded and the worker injects a
 * fresh copy into this already-open tab. This copy's `chrome.*` calls are
 * dead by then, so everything it still does is either useless or in the live
 * copy's way: the observer would re-position a bar it no longer owns, and the
 * label menu would keep offering an item whose click cannot reach storage.
 *
 * The page furniture goes too. The live copy clears it on arrival as well,
 * and both are idempotent, so it does not matter which of them gets there
 * first.
 */
function standDown(): void {
    standingDown = true;
    if (observer) {
        observer.disconnect();
        observer = null;
    }
    if (observerDebounceTimer) {
        clearTimeout(observerDebounceTimer);
        observerDebounceTimer = null;
    }
    if (injectionRetryTimer) {
        clearTimeout(injectionRetryTimer);
        injectionRetryTimer = null;
    }
    stopAccountPolling();
    while (disposers.length) {
        try {
            disposers.pop()!();
        } catch {
            // An orphan's chrome.* removeListener can throw; the page-side
            // listeners around it still come off.
        }
    }
    uninstallLabelMenu();
    uninstallSenderIcons();
    // The tour this copy opened is about to be cleared with the rest of the
    // furniture. The flag that asked for it is already spent, so hand it on
    // rather than lose the first-run tour.
    if (tourIsMine && document.querySelector('.glt-ob-scrim')) {
        document.dispatchEvent(new CustomEvent(TOUR_HANDOVER_EVENT));
    }
    removeOurPageFurniture();
    console.log('Gmail Tabs: a newer copy has taken this tab over; standing down');
}

async function init(): Promise<void> {
    console.log('Gmail Tabs: Initializing...');

    // Before the claim below, so that a copy handing the page over while its
    // tour is open can pass the tour to this one. Deferred a turn because the
    // claim clears the page right after the old copy answers.
    listen(document, TOUR_HANDOVER_EVENT, () => {
        setTimeout(() => {
            if (standingDown) return;
            tourIsMine = true;
            showOnboarding();
        }, 0);
    });

    // First, before anything is built: this page may already hold a copy of
    // this script, orphaned by the update that injected this one.
    claimPage(standDown);

    injectPageWorld();

    // Deliberately not awaited: injection and the observer must start while
    // account detection is still polling. Not awaited is not unwatched,
    // though. A rejection here means no tab bar ever appears, which was
    // previously indistinguishable from Gmail simply being slow.
    initializeFromDOM().catch((err) => {
        console.error('Gmail Tabs: account initialization failed; the tab bar will not appear', err);
    });
    attemptInjection();
    startObserver();

    listen(window, 'popstate', handleUrlChange);

    // Storage change listener
    const onStorageChanged = (changes: { [key: string]: chrome.storage.StorageChange }, area: string): void => {
        if (standingDown) return;
        // Global theme lives in storage.local so a change in any account's tab
        // propagates to every Gmail tab in the window.
        if (area === 'local' && changes[GLOBAL_THEME_STORAGE_KEY]) {
            const newTheme = changes[GLOBAL_THEME_STORAGE_KEY].newValue;
            if (newTheme === 'light' || newTheme === 'dark' || newTheme === 'system') {
                currentGlobalTheme = newTheme;
                applyTheme(currentGlobalTheme);
            }
            return;
        }

        if (area === 'sync') {
            console.log('Gmail Tabs: Storage changed', changes);

            if (getUserEmail()) {
                const accountKey = `account_${getUserEmail()}`;
                const relevantKeys = [accountKey, 'tabs', 'labels'];
                const hasRelevantChange = Object.keys(changes).some((k) => relevantKeys.includes(k));

                if (hasRelevantChange) {
                    getSettings(getUserEmail()!).then((settings) => {
                        setAppSettings(settings);
                        console.log('Gmail Tabs: Reloaded settings for', getUserEmail(), getAppSettings());
                        renderTabs();
                        broadcastKnownLabels();
                        refreshSenderIcons();
                    }).catch((err) => {
                        console.error('Gmail Tabs: Failed to reload settings', err);
                    });
                }
            }
        }
    };
    chrome.storage.onChanged.addListener(onStorageChanged);
    disposers.push(() => chrome.storage.onChanged.removeListener(onStorageChanged));

    // Message listener
    const onMessage = (
        message: { action?: string },
        _sender: chrome.runtime.MessageSender,
        sendResponse: (response?: unknown) => void
    ): boolean => {
        if (standingDown) return false;
        if (message.action === TOGGLE_SETTINGS_ACTION) {
            toggleSettingsModal();
            // Answered, so a promise-form sender settles instead of reporting
            // a closed port as a failure to reach this tab.
            sendResponse({ ok: true });
            return false;
        }
        if (message.action === SHOW_ONBOARDING_ACTION) {
            showOnboarding();
            sendResponse({ ok: true });
            return false;
        }
        if (message.action === PING_ACTION) {
            // The worker asks before injecting. Answering at all is the
            // answer: a tab that replies has a live content script and must
            // not be given a second one.
            sendResponse({ ok: true });
            return false;
        }
        // Returning true for a message we do not answer holds the sender's
        // channel open forever, so a promise-form sendMessage never settles.
        return false;
    };
    chrome.runtime.onMessage.addListener(onMessage);
    disposers.push(() => chrome.runtime.onMessage.removeListener(onMessage));

    // Unread updates from pageWorld.js
    listen(document, 'gmailTabs:unreadUpdate', (e: Event) => {
        if (standingDown) return;
        const updates = (e as CustomEvent).detail;
        if (updates && Array.isArray(updates)) {
            handleUnreadUpdates(updates);
        }
    });

    // Last, deliberately. This is the first run after install, and the tour is
    // the least important thing this function does: every listener above it
    // must be registered whether or not onboarding works at all.
    takePendingOnboarding()
        .then((pending) => {
            // The flag is cleared as it is read, so the tour opens in one tab
            // rather than in every Gmail tab the user happens to have open.
            if (!pending) return;
            if (standingDown) {
                // Taken over while the read was in flight: the flag is spent,
                // so the tour goes to the copy that now owns the page.
                document.dispatchEvent(new CustomEvent(TOUR_HANDOVER_EVENT));
                return;
            }
            tourIsMine = true;
            showOnboarding();
        })
        .catch((err) => {
            console.warn('Gmail Tabs: could not check for a pending tour', err);
        });
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

function bootstrap(): void {
    init().catch((err) => {
        console.error('Gmail Tabs: initialization failed', err);
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
} else {
    bootstrap();
}
