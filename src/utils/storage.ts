/**
 * storage.ts
 *
 * Helper functions for interacting with chrome.storage.sync.
 * Provides typed access to the extension's settings.
 * Now supports multi-account storage.
 */

export interface Tab {
    id: string;
    title: string;       // Display Name
    type: 'label' | 'hash'; // 'label' for legacy/simple, 'hash' for custom views
    value: string;       // The label name or full hash string
}

// Legacy interface for migration
interface LegacyTabLabel {
    name: string;
    id: string;
    displayName?: string;
}

export interface Settings {
    tabs: Tab[];
    // Legacy support for migration
    labels?: LegacyTabLabel[];
    theme: 'system' | 'light' | 'dark';
    showUnreadCount: boolean;
}

const DEFAULT_SETTINGS: Settings = {
    tabs: [],
    theme: 'system',
    showUnreadCount: false
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
                const settings = { ...DEFAULT_SETTINGS, ...stored } as Settings;
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
                    .filter(k => k.startsWith('account_'))
                    .map(k => k.replace('account_', ''));
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
export async function addTab(accountId: string, title: string, value: string, type: 'label' | 'hash' = 'label'): Promise<void> {
    const settings = await getSettings(accountId);
    const newTab: Tab = {
        id: crypto.randomUUID(),
        title: title.trim(),
        value: value.trim(),
        type: type
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
        console.warn(`Gmail Tabs: Failed to find tab with ID ${tabId} to remove. Available IDs:`, settings.tabs.map(t => t.id));
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
    chrome.storage.sync.get(['tabs', 'labels', 'theme', 'showUnreadCount'], async (items) => {
        // If we have legacy data (tabs or labels)
        if (items.tabs || items.labels) {
            console.log(`Migrating legacy settings to account: ${accountId}`);

            let tabs: Tab[] = items.tabs || [];

            // Handle very old 'labels' format migration if needed
            if (items.labels && (!tabs || tabs.length === 0)) {
                tabs = (items.labels as LegacyTabLabel[]).map(l => ({
                    id: l.id,
                    title: l.displayName || l.name,
                    type: 'label',
                    value: l.name
                }));
            }

            const newSettings: Settings = {
                tabs: tabs,
                theme: items.theme || 'system',
                showUnreadCount: items.showUnreadCount || false
            };

            await saveSettings(accountId, newSettings);
        }
    });
}
