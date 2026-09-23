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
 *   modules/modals/  - All modal dialogs (pin, edit, delete, settings, import, uninstall)
 */

import {
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
import { showPinModal, showEditModal, showDeleteModal, toggleSettingsModal, setRenderCallback } from './modules/modals';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Cache of the browser-wide theme so the OS-theme-change listener (which needs
// a synchronous getter) can read it without an async storage round-trip.
let currentGlobalTheme: Theme = 'light';

// Content-script lifecycle primitives (private to this module).
let observer: MutationObserver | null = null;
let initPromise: Promise<void> | null = null;

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
document.addEventListener('gmailTabs:rerender', () => renderTabs());

// ---------------------------------------------------------------------------
// Observer
// ---------------------------------------------------------------------------

let observerDebounceTimer: ReturnType<typeof setTimeout> | null = null;

function startObserver(): void {
    if (observer) observer.disconnect();

    observer = new MutationObserver((_mutations) => {
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

    const titleMatch = title.match(emailRegex);
    if (titleMatch) {
        console.log('Gmail Tabs: Found email in title:', titleMatch[1]);
        return titleMatch[1];
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

        setAppSettings(await getSettings(email));
        console.log('Gmail Tabs: Settings loaded for', email, getAppSettings());

        // Theme before the first paint, not after. Until `force-light` or
        // `force-dark` is on <body>, toolbar.css falls back to its
        // `prefers-color-scheme` block — so a user with a dark desktop and a
        // light Gmail saw the bar flash dark for a frame, which is the exact
        // mismatch that whole mechanism exists to avoid.
        currentGlobalTheme = await getGlobalTheme();
        applyTheme(currentGlobalTheme);

        renderTabs();
        broadcastKnownLabels();

        // Listen for OS theme changes to auto-update 'system' mode
        listenForSystemThemeChanges(() => currentGlobalTheme);

        // Gmail paints its own background late and the user can switch Gmail's
        // theme without reloading, so keep 'system' mode following Gmail itself
        // rather than the OS.
        watchGmailTheme(() => currentGlobalTheme);
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
        const accountPoller = setInterval(() => {
            email = extractEmailFromDOM();
            if (!email) return;
            console.log('Gmail Tabs: Account detected via polling:', email);
            clearInterval(accountPoller);
            if (getUserEmail()) return;
            setUserEmail(email);
            initPromise = initPromise || finalizeInit(email);
            initPromise.catch((err) => {
                console.error('Gmail Tabs: account initialization failed after polling', err);
            });
        }, 1000);

        setTimeout(() => clearInterval(accountPoller), 60000);
    }
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

async function init(): Promise<void> {
    console.log('Gmail Tabs: Initializing...');
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

    window.addEventListener('popstate', handleUrlChange);

    // Storage change listener
    chrome.storage.onChanged.addListener((changes, area) => {
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
                    }).catch((err) => {
                        console.error('Gmail Tabs: Failed to reload settings', err);
                    });
                }
            }
        }
    });

    // Message listener
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
        if (message.action === 'TOGGLE_SETTINGS') {
            toggleSettingsModal();
            return false;
        }
        if (message.action === SHOW_ONBOARDING_ACTION) {
            showOnboarding();
            sendResponse({ ok: true });
            return false;
        }
        if (message.action === 'GET_ACCOUNT_INFO') {
            sendResponse({ account: getUserEmail() });
            return false;
        }
        // Returning true for a message we do not answer holds the sender's
        // channel open forever, so a promise-form sendMessage never settles.
        return false;
    });

    // Unread updates from pageWorld.js
    document.addEventListener('gmailTabs:unreadUpdate', (e: any) => {
        const updates = e.detail;
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
            if (pending) showOnboarding();
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
