/**
 * storage.ts
 *
 * Helper functions for interacting with chrome.storage.sync.
 * Provides typed access to the extension's settings.
 * Now supports multi-account storage.
 */

import { TabColor } from './colors';

export interface Tab {
    id: string;
    title: string; // Display Name
    type: 'label' | 'hash'; // 'label' for legacy/simple, 'hash' for custom views
    value: string; // The label name or full hash string
    color?: TabColor; // Optional palette token; absent = default styling
}

// Legacy interface for migration
interface LegacyTabLabel {
    name: string;
    id: string;
    displayName?: string;
}

export type Theme = 'system' | 'light' | 'dark';

export type RuleAction = 'trash' | 'archive' | 'markRead' | 'moveToLabel';

export interface Rule {
    tabId: string; // Links to Tab.id
    action: RuleAction;
    daysOld: number; // Threshold in days
    enabled: boolean;
    targetLabel?: string; // Only for 'moveToLabel' action
}

export interface Settings {
    tabs: Tab[];
    rules: Rule[];
    // Legacy support for migration
    labels?: LegacyTabLabel[];
    theme: Theme;
    showUnreadCount: boolean;
}

// Theme is a browser-wide (per-window, all-accounts) preference, stored in
// chrome.storage.local so it applies to every Gmail account in the profile
// and does NOT sync across devices. The per-account Settings.theme field is
// retained only for backward compatibility and one-time migration seeding.
const GLOBAL_THEME_KEY = 'globalTheme';

const DEFAULT_SETTINGS: Settings = {
    tabs: [
        {
            id: 'default-inbox',
            title: 'Inbox',
            type: 'hash',
            value: '#inbox',
        },
        {
            id: 'default-sent',
            title: 'Sent',
            type: 'hash',
            value: '#sent',
        },
    ],
    rules: [],
    theme: 'light',
    showUnreadCount: true,
};

function getAccountKey(accountId: string): string {
    return `account_${accountId}`;
}

/**
 * Helper to safely check for runtime errors (like context invalidation)
 */
function checkRuntimeError(reject: (reason?: any) => void): boolean {
    if (chrome.runtime.lastError) {
        const msg = chrome.runtime.lastError.message;
        console.warn('Gmail Tabs: Storage Error:', msg);
        if (msg && msg.includes('Extension context invalidated')) {
            console.error('Gmail Tabs: Extension context invalidated. Please refresh the page.');
            // Rejecting might still cause unhandled promise rejections in some chains,
            // but it's better than a hard crash.
            // Alternatively, we could resolve with default values to keep the UI alive but non-functional.
            // Let's reject so the caller knows something went wrong.
            reject(new Error('Extension context invalidated'));
        } else {
            reject(new Error(msg));
        }
        return true;
    }
    return false;
}

/**
 * Retrieves the current settings for a specific account.
 */
export async function getSettings(accountId: string): Promise<Settings> {
    return new Promise((resolve, reject) => {
        const key = getAccountKey(accountId);
        try {
            chrome.storage.sync.get([key], (items) => {
                if (checkRuntimeError(reject)) return;
                const stored = items[key];
                // Deep-clone defaults to avoid shared reference mutation
                // (e.g., pushing to rules[] would mutate DEFAULT_SETTINGS)
                const defaults: Settings = {
                    tabs: [...DEFAULT_SETTINGS.tabs.map((t) => ({ ...t }))],
                    rules: [...DEFAULT_SETTINGS.rules.map((r) => ({ ...r }))],
                    theme: DEFAULT_SETTINGS.theme,
                    showUnreadCount: DEFAULT_SETTINGS.showUnreadCount,
                };
                const settings = { ...defaults, ...stored } as Settings;
                resolve(settings);
            });
        } catch (e) {
            // Catch synchronous errors (e.g. context invalidated before call)
            console.warn('Gmail Tabs: Storage call failed', e);
            reject(e);
        }
    });
}

/**
 * Retrieves all stored accounts (keys starting with account_).
 */
export async function getAllAccounts(): Promise<string[]> {
    return new Promise((resolve, reject) => {
        try {
            chrome.storage.sync.get(null, (items) => {
                if (checkRuntimeError(reject)) return;
                const accounts = Object.keys(items)
                    .filter((k) => k.startsWith('account_'))
                    .map((k) => k.replace('account_', ''));
                resolve(accounts);
            });
        } catch (e) {
            reject(e);
        }
    });
}

/**
 * Saves the settings for a specific account.
 */
export async function saveSettings(accountId: string, newSettings: Partial<Settings>): Promise<void> {
    try {
        const currentSettings = await getSettings(accountId);
        const mergedSettings = { ...currentSettings, ...newSettings };
        const key = getAccountKey(accountId);

        return new Promise((resolve, reject) => {
            try {
                chrome.storage.sync.set({ [key]: mergedSettings }, () => {
                    if (checkRuntimeError(reject)) return;
                    resolve();
                });
            } catch (e) {
                reject(e);
            }
        });
    } catch (e) {
        console.warn('Gmail Tabs: Save settings failed', e);
        throw e;
    }
}

/**
 * Adds a new tab to the list for a specific account.
 */
export async function addTab(
    accountId: string,
    title: string,
    value: string,
    type: 'label' | 'hash' = 'label'
): Promise<void> {
    const settings = await getSettings(accountId);
    const newTab: Tab = {
        id: crypto.randomUUID(),
        title: title.trim(),
        value: value.trim(),
        type: type,
    };

    // Avoid duplicates based on value
    if (!settings.tabs.some((t) => t.value === newTab.value)) {
        settings.tabs.push(newTab);
        await saveSettings(accountId, settings);
    }
}

/**
 * Removes a tab by ID for a specific account.
 */
export async function removeTab(accountId: string, tabId: string): Promise<void> {
    const settings = await getSettings(accountId);
    console.log(`Gmail Tabs: Removing tab ${tabId} from account ${accountId}`);
    const initialLength = settings.tabs.length;
    settings.tabs = settings.tabs.filter((t) => {
        const match = t.id === tabId;
        if (match) console.log(`Gmail Tabs: Found tab to remove: ${t.title} (${t.id})`);
        return !match;
    });

    if (settings.tabs.length === initialLength) {
        console.warn(
            `Gmail Tabs: Failed to find tab with ID ${tabId} to remove. Available IDs:`,
            settings.tabs.map((t) => t.id)
        );
    } else {
        console.log(`Gmail Tabs: Tab removed. New count: ${settings.tabs.length}`);
    }

    await saveSettings(accountId, settings);
}

/**
 * Updates an existing tab for a specific account.
 */
export async function updateTab(accountId: string, tabId: string, updates: Partial<Tab>): Promise<void> {
    const settings = await getSettings(accountId);
    const index = settings.tabs.findIndex((t) => t.id === tabId);
    if (index !== -1) {
        settings.tabs[index] = { ...settings.tabs[index], ...updates };
        await saveSettings(accountId, settings);
    }
}

/**
 * Updates the order of tabs for a specific account.
 */
export async function updateTabOrder(accountId: string, newTabs: Tab[]): Promise<void> {
    const settings = await getSettings(accountId);
    settings.tabs = newTabs;
    await saveSettings(accountId, settings);
}

// ---------------------------------------------------------------------------
// Rule CRUD
// ---------------------------------------------------------------------------

/**
 * Adds a rule for a tab. Prevents duplicates by tabId.
 */
export async function addRule(accountId: string, rule: Rule): Promise<void> {
    const settings = await getSettings(accountId);
    // Prevent duplicate rule for the same tab
    if (!settings.rules.some((r) => r.tabId === rule.tabId)) {
        settings.rules.push(rule);
        await saveSettings(accountId, settings);
    }
}

/**
 * Updates an existing rule by tabId.
 */
export async function updateRule(accountId: string, tabId: string, updates: Partial<Rule>): Promise<void> {
    const settings = await getSettings(accountId);
    const index = settings.rules.findIndex((r) => r.tabId === tabId);
    if (index !== -1) {
        settings.rules[index] = { ...settings.rules[index], ...updates };
        await saveSettings(accountId, settings);
    }
}

/**
 * Removes a rule by tabId.
 */
export async function removeRule(accountId: string, tabId: string): Promise<void> {
    const settings = await getSettings(accountId);
    settings.rules = settings.rules.filter((r) => r.tabId !== tabId);
    await saveSettings(accountId, settings);
}

/**
 * Returns rules enriched with tab metadata (title, value) for script generation.
 * Only returns enabled rules that have a matching tab.
 */
export async function getRulesForExport(
    accountId: string
): Promise<Array<Rule & { tabTitle: string; tabValue: string }>> {
    const settings = await getSettings(accountId);
    return settings.rules
        .filter((r) => r.enabled)
        .map((r) => {
            const tab = settings.tabs.find((t) => t.id === r.tabId);
            return tab ? { ...r, tabTitle: tab.title, tabValue: tab.value } : null;
        })
        .filter((r): r is Rule & { tabTitle: string; tabValue: string } => r !== null);
}

// ---------------------------------------------------------------------------
// Global Theme (per-window, all accounts — chrome.storage.local)
// ---------------------------------------------------------------------------

/**
 * Reads the browser-wide theme preference. Falls back to 'light' if unset
 * or unavailable. This value is shared by every Gmail account in the profile.
 */
export async function getGlobalTheme(): Promise<Theme> {
    return new Promise((resolve) => {
        try {
            chrome.storage.local.get([GLOBAL_THEME_KEY], (items) => {
                if (chrome.runtime.lastError) {
                    resolve('light');
                    return;
                }
                const t = items[GLOBAL_THEME_KEY];
                resolve(t === 'light' || t === 'dark' || t === 'system' ? t : 'light');
            });
        } catch {
            resolve('light');
        }
    });
}

/**
 * Persists the browser-wide theme preference. Because it lives in
 * chrome.storage.local, every Gmail tab's storage listener fires and
 * re-applies the theme, keeping all accounts in sync within the window.
 */
export async function setGlobalTheme(theme: Theme): Promise<void> {
    return new Promise((resolve, reject) => {
        try {
            chrome.storage.local.set({ [GLOBAL_THEME_KEY]: theme }, () => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                    return;
                }
                resolve();
            });
        } catch (e) {
            reject(e);
        }
    });
}

/** The storage key used for the global theme (exported for listener checks). */
export const GLOBAL_THEME_STORAGE_KEY = GLOBAL_THEME_KEY;

/**
 * Seeds the global theme once, on first run after the per-account → global
 * migration. Priority: existing global value (no-op) > legacy sync 'theme'
 * key (from old welcome page) > the account's own per-account theme.
 * The legacy sync 'theme' key is cleaned up if consumed.
 */
export async function migrateThemeToGlobalIfNeeded(accountId: string): Promise<void> {
    const alreadySet = await new Promise<boolean>((resolve) => {
        try {
            chrome.storage.local.get([GLOBAL_THEME_KEY], (items) => {
                resolve(items[GLOBAL_THEME_KEY] !== undefined);
            });
        } catch {
            resolve(false);
        }
    });
    if (alreadySet) return;

    // Legacy welcome-page theme lived under a global sync 'theme' key.
    const legacyTheme = await new Promise<Theme | null>((resolve) => {
        try {
            chrome.storage.sync.get(['theme'], (items) => {
                const t = items.theme;
                resolve(t === 'light' || t === 'dark' || t === 'system' ? t : null);
            });
        } catch {
            resolve(null);
        }
    });

    if (legacyTheme) {
        await setGlobalTheme(legacyTheme);
        try {
            chrome.storage.sync.remove('theme');
        } catch {
            /* best-effort cleanup */
        }
        return;
    }

    // Otherwise seed from the current account's per-account theme.
    try {
        const settings = await getSettings(accountId);
        await setGlobalTheme(settings.theme);
    } catch {
        await setGlobalTheme('light');
    }
}

// ---------------------------------------------------------------------------
// Legacy Migration
// ---------------------------------------------------------------------------

/**
 * Helper to migrate legacy global settings to a specific account.
 * Should be called once when an account is first detected if no settings exist for it.
 */
export async function migrateLegacySettingsIfNeeded(accountId: string): Promise<void> {
    const key = getAccountKey(accountId);

    // Check if account settings already exist
    const exists = await new Promise<boolean>((resolve) => {
        chrome.storage.sync.get(key, (items) => {
            resolve(!!items[key]);
        });
    });

    if (exists) return;

    // Check for legacy top-level settings
    await new Promise<void>((resolve, reject) => {
        chrome.storage.sync.get(['tabs', 'labels', 'theme', 'showUnreadCount'], async (items) => {
            try {
                // If we have legacy data (tabs or labels)
                if (items.tabs || items.labels) {
                    console.log(`Migrating legacy settings to account: ${accountId}`);

                    let tabs: Tab[] = items.tabs || [];

                    // Handle very old 'labels' format migration if needed
                    if (items.labels && (!tabs || tabs.length === 0)) {
                        tabs = (items.labels as LegacyTabLabel[]).map((l) => ({
                            id: l.id,
                            title: l.displayName || l.name,
                            type: 'label',
                            value: l.name,
                        }));
                    }

                    const newSettings: Settings = {
                        tabs: tabs,
                        rules: [],
                        theme: items.theme || 'light',
                        showUnreadCount: items.showUnreadCount !== undefined ? items.showUnreadCount : true,
                    };

                    await saveSettings(accountId, newSettings);
                }
                resolve();
            } catch (e) {
                reject(e);
            }
        });
    });
}
