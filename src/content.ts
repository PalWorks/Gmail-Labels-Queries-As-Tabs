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
 *   modules/modals.ts   – All modal dialogs (pin, edit, delete, settings, import, uninstall)
 */

import * as InboxSDK from '@inboxsdk/core';
import { getSettings, migrateLegacySettingsIfNeeded } from './utils/storage';

// Module imports
import { state, TABS_BAR_ID, TOOLBAR_SELECTORS } from './modules/state';
import { applyTheme, listenForSystemThemeChanges } from './modules/theme';
import { saveSettings } from './utils/storage';
import { handleUnreadUpdates } from './modules/unread';
import { renderTabs, createTabsBar, updateActiveTab, setModalCallbacks } from './modules/tabs';
import {
    showPinModal, showEditModal, showDeleteModal,
    toggleSettingsModal, setRenderCallback,
} from './modules/modals';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const APP_ID = 'sdk_Gmail-Tabs_2488593e74';

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
    if (state.observer) state.observer.disconnect();

    state.observer = new MutationObserver((_mutations) => {
        if (observerDebounceTimer) return;
        observerDebounceTimer = setTimeout(() => {
            observerDebounceTimer = null;
            attemptInjection();
            updateActiveTab();
        }, 100); // ≤10 calls/second
    });

    state.observer.observe(document.body, {
        childList: true,
        subtree: true,
    });
}

// ---------------------------------------------------------------------------
// Injection
// ---------------------------------------------------------------------------

/**
 * Attempt to inject the tabs bar.
 * Retries if the insertion point isn't found yet.
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
    } else {
        setTimeout(attemptInjection, 500);
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

    const accountElement = document.querySelector('[aria-label*="@"][aria-label*="Google Account"], a[aria-label*="@"]');
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

        // Migrate theme from welcome page (global key) if present
        await migrateWelcomeTheme(email);

        state.currentSettings = await getSettings(email);
        console.log('Gmail Tabs: Settings loaded for', email, state.currentSettings);
        renderTabs();
        applyTheme(state.currentSettings.theme);

        // Listen for OS theme changes to auto-update 'system' mode
        listenForSystemThemeChanges(() => state.currentSettings?.theme ?? 'system');
    } catch (e) {
        console.error('Gmail Tabs: Error in finalizeInit', e);
    }
}

/**
 * Migrate the global 'theme' key set by the welcome page into
 * the account-scoped settings, then clean up the global key.
 */
async function migrateWelcomeTheme(email: string): Promise<void> {
    return new Promise((resolve) => {
        try {
            chrome.storage.sync.get(['theme'], async (result) => {
                if (chrome.runtime.lastError) {
                    resolve();
                    return;
                }
                if (result.theme && (result.theme === 'light' || result.theme === 'dark' || result.theme === 'system')) {
                    console.log('Gmail Tabs: Migrating welcome theme:', result.theme);
                    await saveSettings(email, { theme: result.theme });
                    // Clean up the global key
                    chrome.storage.sync.remove('theme', () => {
                        console.log('Gmail Tabs: Welcome theme key cleaned up');
                        resolve();
                    });
                } else {
                    resolve();
                }
            });
        } catch {
            resolve();
        }
    });
}

async function initializeFromDOM(): Promise<void> {
    console.log('Gmail Tabs: Starting DOM-based initialization...');
    let email = extractEmailFromDOM();
    if (email) {
        console.log('Gmail Tabs: Email found immediately:', email);
        if (!state.currentUserEmail) {
            state.currentUserEmail = email;
            state.initPromise = state.initPromise || finalizeInit(email);
            await state.initPromise;
        }
    } else {
        console.log('Gmail Tabs: Email not found yet, polling DOM...');
        const accountPoller = setInterval(async () => {
            email = extractEmailFromDOM();
            if (email) {
                console.log('Gmail Tabs: Account detected via polling:', email);
                clearInterval(accountPoller);
                if (!state.currentUserEmail) {
                    state.currentUserEmail = email;
                    state.initPromise = state.initPromise || finalizeInit(email);
                    await state.initPromise;
                }
            }
        }, 1000);

        setTimeout(() => clearInterval(accountPoller), 60000);
    }
}

async function loadInboxSDK(): Promise<void> {
    try {
        console.log('Gmail Tabs: Attempting to load InboxSDK (Background)...');
        const sdk = await InboxSDK.load(2, APP_ID);
        console.log('Gmail Tabs: InboxSDK loaded.');

        if (!state.currentUserEmail) {
            const sdkEmail = sdk.User.getEmailAddress();
            console.log('Gmail Tabs: Got email from SDK:', sdkEmail);
            state.currentUserEmail = sdkEmail;
            state.initPromise = state.initPromise || finalizeInit(state.currentUserEmail);
            await state.initPromise;
        }

        sdk.Router.handleAllRoutes((_routeView: any) => {
            updateActiveTab();
        });

    } catch (err) {
        console.warn('Gmail Tabs: InboxSDK failed to load (Non-fatal):', err);
    }
}

function injectPageWorld(): void {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('js/xhrInterceptor.js');
    script.onload = () => script.remove();
    (document.head || document.documentElement).appendChild(script);
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

    initializeFromDOM();
    loadInboxSDK();

    attemptInjection();
    startObserver();

    window.addEventListener('popstate', handleUrlChange);

    // Storage change listener
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'sync') {
            console.log('Gmail Tabs: Storage changed', changes);

            if (state.currentUserEmail) {
                const accountKey = `account_${state.currentUserEmail}`;
                const relevantKeys = [accountKey, 'theme', 'tabs', 'labels'];
                const hasRelevantChange = Object.keys(changes).some(k => relevantKeys.includes(k));

                if (hasRelevantChange) {
                    getSettings(state.currentUserEmail).then(settings => {
                        state.currentSettings = settings;
                        console.log('Gmail Tabs: Reloaded settings for', state.currentUserEmail, state.currentSettings);
                        renderTabs();
                        if (changes.theme) {
                            applyTheme(state.currentSettings.theme);
                        }
                    });
                }
            }
        }
    });

    // Message listener
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
        if (message.action === 'TOGGLE_SETTINGS') {
            toggleSettingsModal();
        } else if (message.action === 'GET_ACCOUNT_INFO') {
            sendResponse({ account: state.currentUserEmail });
        }
        return true;
    });

    // Unread updates from pageWorld.js
    document.addEventListener('gmailTabs:unreadUpdate', (e: any) => {
        const updates = e.detail;
        if (updates && Array.isArray(updates)) {
            handleUnreadUpdates(updates);
        }
    });
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        init();
    });
} else {
    init();
}
