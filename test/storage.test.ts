export {};
/**
 * storage.test.ts
 *
 * Unit tests for storage helpers.
 * Tests the current multi-account Tab API (addTab, removeTab, updateTab, etc.)
 * Mocks chrome.storage.sync.
 */

import {
    addTab,
    removeTab,
    updateTab,
    updateTabOrder,
    getSettings,
    getAllAccounts,
    ensureAccountRegistered,
    migrateLegacySettingsIfNeeded,
    getGlobalTheme,
    setGlobalTheme,
    migrateThemeToGlobalIfNeeded,
    saveSettings,
    addRule,
    updateRule,
    removeRule,
    getRulesForExport,
    Settings,
    Rule,
} from '../src/utils/storage';

// In-memory mock storage (sync) + separate store for storage.local (theme).
const mockStorage: Record<string, any> = {};
const mockLocalStorage: Record<string, any> = {};

function makeArea(store: Record<string, any>) {
    return {
        get: jest.fn((keys: string | string[] | null, callback: (items: Record<string, any>) => void) => {
            if (keys === null) {
                callback({ ...store });
            } else {
                const keyArr = typeof keys === 'string' ? [keys] : keys;
                const result: Record<string, any> = {};
                keyArr.forEach((k) => {
                    if (store[k] !== undefined) {
                        result[k] = store[k];
                    }
                });
                callback(result);
            }
        }),
        set: jest.fn((items: Record<string, any>, callback: () => void) => {
            Object.assign(store, items);
            callback();
        }),
        remove: jest.fn((key: string, callback?: () => void) => {
            delete store[key];
            if (callback) callback();
        }),
    };
}

// Mock chrome.storage.sync + chrome.storage.local + chrome.runtime
beforeAll(() => {
    (global as any).chrome = {
        storage: {
            sync: makeArea(mockStorage),
            local: makeArea(mockLocalStorage),
        },
        runtime: {
            lastError: null,
        },
    };

    // Polyfill crypto.randomUUID for test environment
    if (!globalThis.crypto?.randomUUID) {
        Object.defineProperty(globalThis, 'crypto', {
            value: {
                randomUUID: () => Math.random().toString(36).substring(2) + Date.now().toString(36),
            },
            writable: true,
        });
    }
});

beforeEach(() => {
    // Clear in-place so mock closures always reference the same object
    Object.keys(mockStorage).forEach((k) => delete mockStorage[k]);
    Object.keys(mockLocalStorage).forEach((k) => delete mockLocalStorage[k]);
    jest.clearAllMocks();
    (global as any).chrome.runtime.lastError = null;
});

// ------ getSettings ------

describe('getSettings', () => {
    test('returns default settings for new account', async () => {
        const settings = await getSettings('user@gmail.com');
        expect(settings.tabs).toHaveLength(2); // Inbox + Sent defaults
        expect(settings.theme).toBe('light');
        expect(settings.showUnreadCount).toBe(true);
    });

    test('returns stored settings when present', async () => {
        const stored: Settings = {
            tabs: [{ id: 'tab1', title: 'Work', type: 'label', value: 'Work' }],
            rules: [],
            theme: 'dark',
            showUnreadCount: false,
        };
        mockStorage['account_user@gmail.com'] = stored;

        const settings = await getSettings('user@gmail.com');
        expect(settings.tabs).toHaveLength(1);
        expect(settings.tabs[0].title).toBe('Work');
        expect(settings.theme).toBe('dark');
        expect(settings.showUnreadCount).toBe(false);
    });

    test('keeps a valid color token', async () => {
        mockStorage['account_user@gmail.com'] = {
            tabs: [{ id: 'tab1', title: 'Work', type: 'label', value: 'Work', color: 'teal' }],
            rules: [],
            theme: 'light',
            showUnreadCount: true,
        };

        const settings = await getSettings('user@gmail.com');
        expect(settings.tabs[0].color).toBe('teal');
    });

    test('strips an unknown color token on read', async () => {
        mockStorage['account_user@gmail.com'] = {
            tabs: [
                { id: 'tab1', title: 'Work', type: 'label', value: 'Work', color: 'not-a-color' },
                { id: 'tab2', title: 'Hack', type: 'label', value: 'Hack', color: 'x" onload="evil()' },
            ],
            rules: [],
            theme: 'light',
            showUnreadCount: true,
        };

        const settings = await getSettings('user@gmail.com');
        expect(settings.tabs[0]).not.toHaveProperty('color');
        expect(settings.tabs[1]).not.toHaveProperty('color');
        // The rest of the tab survives untouched.
        expect(settings.tabs[0].title).toBe('Work');
    });
});

// ------ ensureAccountRegistered ------

describe('ensureAccountRegistered', () => {
    test('writes defaults so a never-customised account is discoverable', async () => {
        expect(await getAllAccounts()).toEqual([]);

        await ensureAccountRegistered('fresh@gmail.com');

        expect(await getAllAccounts()).toEqual(['fresh@gmail.com']);
        const settings = await getSettings('fresh@gmail.com');
        expect(settings.tabs).toHaveLength(2); // Inbox + Sent defaults
    });

    test('two concurrent registrations write once, not twice', async () => {
        const setSpy = jest.spyOn(chrome.storage.sync, 'set');
        const before = setSpy.mock.calls.length;

        await Promise.all([
            ensureAccountRegistered('same@gmail.com'),
            ensureAccountRegistered('same@gmail.com'),
            ensureAccountRegistered('same@gmail.com'),
        ]);

        expect(setSpy.mock.calls.length - before).toBe(1);
        expect(await getAllAccounts()).toContain('same@gmail.com');
    });

    test('leaves an existing account untouched', async () => {
        mockStorage['account_user@gmail.com'] = {
            tabs: [{ id: 'tab1', title: 'Work', type: 'label', value: 'Work' }],
            rules: [],
            theme: 'dark',
            showUnreadCount: false,
        };

        await ensureAccountRegistered('user@gmail.com');

        const settings = await getSettings('user@gmail.com');
        expect(settings.tabs).toHaveLength(1);
        expect(settings.theme).toBe('dark');
    });
});

// ------ addTab ------

describe('addTab', () => {
    test('adds a new tab to the account', async () => {
        await addTab('user@gmail.com', 'Work', 'Work', 'label');
        const settings = await getSettings('user@gmail.com');
        // 2 defaults + 1 new
        expect(settings.tabs).toHaveLength(3);
        expect(settings.tabs[2].title).toBe('Work');
        expect(settings.tabs[2].type).toBe('label');
        expect(settings.tabs[2].value).toBe('Work');
    });

    test('does not add duplicate by value', async () => {
        await addTab('user@gmail.com', 'Work', '#label/Work', 'hash');
        await addTab('user@gmail.com', 'Work Again', '#label/Work', 'hash');
        const settings = await getSettings('user@gmail.com');
        const workTabs = settings.tabs.filter((t) => t.value === '#label/Work');
        expect(workTabs).toHaveLength(1);
    });

    test('trims title and value', async () => {
        await addTab('user@gmail.com', '  Padded  ', '  #starred  ', 'hash');
        const settings = await getSettings('user@gmail.com');
        const added = settings.tabs.find((t) => t.title === 'Padded');
        expect(added).toBeDefined();
        expect(added!.value).toBe('#starred');
    });
});

// ------ removeTab ------

describe('removeTab', () => {
    test('removes a tab by ID', async () => {
        await addTab('user@gmail.com', 'ToRemove', 'remove-me', 'label');
        let settings = await getSettings('user@gmail.com');
        const tabId = settings.tabs.find((t) => t.value === 'remove-me')!.id;

        await removeTab('user@gmail.com', tabId);
        settings = await getSettings('user@gmail.com');
        expect(settings.tabs.find((t) => t.value === 'remove-me')).toBeUndefined();
    });

    test('does not crash when removing non-existent tab', async () => {
        await expect(removeTab('user@gmail.com', 'nonexistent-id')).resolves.toBeUndefined();
    });
});

// ------ updateTab ------

describe('updateTab', () => {
    test('updates tab title', async () => {
        await addTab('user@gmail.com', 'OldName', 'val1', 'label');
        let settings = await getSettings('user@gmail.com');
        const tabId = settings.tabs.find((t) => t.value === 'val1')!.id;

        await updateTab('user@gmail.com', tabId, { title: 'NewName' });
        settings = await getSettings('user@gmail.com');
        expect(settings.tabs.find((t) => t.id === tabId)!.title).toBe('NewName');
    });
});

// ------ updateTabOrder ------

describe('updateTabOrder', () => {
    test('reorders tabs', async () => {
        await addTab('user@gmail.com', 'A', 'a', 'label');
        await addTab('user@gmail.com', 'B', 'b', 'label');
        let settings = await getSettings('user@gmail.com');

        // Reverse order
        const reversed = [...settings.tabs].reverse();
        await updateTabOrder('user@gmail.com', reversed);
        settings = await getSettings('user@gmail.com');
        expect(settings.tabs[0].value).toBe('b');
        expect(settings.tabs[settings.tabs.length - 1].value).toBe('#inbox');
    });
});

// ------ getAllAccounts ------

describe('getAllAccounts', () => {
    test('returns empty array when no accounts', async () => {
        const accounts = await getAllAccounts();
        expect(accounts).toEqual([]);
    });

    test('returns account emails', async () => {
        mockStorage['account_a@gmail.com'] = { tabs: [], rules: [], theme: 'system', showUnreadCount: true };
        mockStorage['account_b@gmail.com'] = { tabs: [], rules: [], theme: 'dark', showUnreadCount: false };
        mockStorage['unrelated_key'] = 'ignored';

        const accounts = await getAllAccounts();
        expect(accounts).toHaveLength(2);
        expect(accounts).toContain('a@gmail.com');
        expect(accounts).toContain('b@gmail.com');
    });
});

// ------ migrateLegacySettingsIfNeeded ------

describe('migrateLegacySettingsIfNeeded', () => {
    test('skips migration when account already exists', async () => {
        mockStorage['account_user@gmail.com'] = {
            tabs: [{ id: '1', title: 'Test', type: 'label', value: 'Test' }],
            theme: 'dark',
            showUnreadCount: true,
        };
        await migrateLegacySettingsIfNeeded('user@gmail.com');
        // Should NOT overwrite existing settings
        const settings = await getSettings('user@gmail.com');
        expect(settings.theme).toBe('dark');
    });

    test('migrates legacy tabs format', async () => {
        mockStorage['tabs'] = [{ id: 'old1', title: 'OldTab', type: 'label', value: 'OldTab' }];
        mockStorage['theme'] = 'light';
        mockStorage['showUnreadCount'] = false;

        await migrateLegacySettingsIfNeeded('user@gmail.com');
        const settings = await getSettings('user@gmail.com');
        expect(settings.tabs).toHaveLength(1);
        expect(settings.tabs[0].title).toBe('OldTab');
        expect(settings.theme).toBe('light');
        expect(settings.showUnreadCount).toBe(false);
    });

    test('migrates very old labels format', async () => {
        mockStorage['labels'] = [{ name: 'Work', id: 'lbl1', displayName: 'Work Label' }];

        await migrateLegacySettingsIfNeeded('user@gmail.com');
        const settings = await getSettings('user@gmail.com');
        expect(settings.tabs).toHaveLength(1);
        expect(settings.tabs[0].title).toBe('Work Label');
        expect(settings.tabs[0].type).toBe('label');
        expect(settings.tabs[0].value).toBe('Work');
    });

    test('does nothing when no legacy data exists', async () => {
        // Call migration on a completely new account with no global legacy keys
        await migrateLegacySettingsIfNeeded('isolated@gmail.com');
        // No account key should have been created since there's no legacy data
        expect(mockStorage['account_isolated@gmail.com']).toBeUndefined();
    });
});

// ------ Import Schema Validation (tested via pure function logic) ------

describe('Import Schema Validation', () => {
    // These test the validation logic that exists in content.ts import handler
    // We test the same schema rules here as a unit test

    function validateImportTabs(data: any): string | null {
        if (!data.tabs || !Array.isArray(data.tabs)) {
            return 'Invalid format: Missing "tabs" array.';
        }
        for (let i = 0; i < data.tabs.length; i++) {
            const t = data.tabs[i];
            if (!t || typeof t !== 'object') return `Invalid tab at index ${i}: not an object.`;
            if (typeof t.id !== 'string' || !t.id.trim()) return `Invalid tab at index ${i}: missing or empty "id".`;
            if (typeof t.title !== 'string' || !t.title.trim())
                return `Invalid tab at index ${i}: missing or empty "title".`;
            if (t.type !== 'label' && t.type !== 'hash')
                return `Invalid tab at index ${i}: "type" must be "label" or "hash".`;
            if (typeof t.value !== 'string' || !t.value.trim())
                return `Invalid tab at index ${i}: missing or empty "value".`;
        }
        return null;
    }

    test('accepts valid import data', () => {
        const data = {
            version: 1,
            tabs: [
                { id: 'tab1', title: 'Inbox', type: 'hash', value: '#inbox' },
                { id: 'tab2', title: 'Work', type: 'label', value: 'Work' },
            ],
        };
        expect(validateImportTabs(data)).toBeNull();
    });

    test('rejects missing tabs array', () => {
        expect(validateImportTabs({})).toContain('Missing "tabs" array');
    });

    test('rejects tab without id', () => {
        const data = { tabs: [{ title: 'X', type: 'hash', value: '#x' }] };
        expect(validateImportTabs(data)).toContain('missing or empty "id"');
    });

    test('rejects tab without title', () => {
        const data = { tabs: [{ id: '1', type: 'hash', value: '#x' }] };
        expect(validateImportTabs(data)).toContain('missing or empty "title"');
    });

    test('rejects tab with invalid type', () => {
        const data = { tabs: [{ id: '1', title: 'X', type: 'invalid', value: '#x' }] };
        expect(validateImportTabs(data)).toContain('"type" must be "label" or "hash"');
    });

    test('rejects tab without value', () => {
        const data = { tabs: [{ id: '1', title: 'X', type: 'hash' }] };
        expect(validateImportTabs(data)).toContain('missing or empty "value"');
    });

    test('rejects non-object tab entries', () => {
        const data = { tabs: ['not-an-object'] };
        expect(validateImportTabs(data)).toContain('not an object');
    });
});

// ------ Rule CRUD ------

describe('Rule CRUD operations', () => {
    // Each test in this block uses a unique account to avoid cross-test leakage
    const acct = (suffix: string) => `rule-test-${suffix}@gmail.com`;

    test('addRule adds a rule linked to a tab', async () => {
        const a = acct('add1');
        await addTab(a, 'Newsletters', 'newsletters', 'label');
        const settings = await getSettings(a);
        const tabId = settings.tabs.find((t) => t.value === 'newsletters')!.id;

        const rule: Rule = { tabId, action: 'trash', daysOld: 30, enabled: true };
        await addRule(a, rule);

        const updated = await getSettings(a);
        expect(updated.rules).toHaveLength(1);
        expect(updated.rules[0].tabId).toBe(tabId);
        expect(updated.rules[0].action).toBe('trash');
        expect(updated.rules[0].daysOld).toBe(30);
    });

    test('addRule prevents duplicate rule for same tabId', async () => {
        const a = acct('add2');
        await addTab(a, 'Work', 'work', 'label');
        const settings = await getSettings(a);
        const tabId = settings.tabs.find((t) => t.value === 'work')!.id;

        await addRule(a, { tabId, action: 'trash', daysOld: 30, enabled: true });
        await addRule(a, { tabId, action: 'archive', daysOld: 60, enabled: true });

        const updated = await getSettings(a);
        const tabRules = updated.rules.filter((r) => r.tabId === tabId);
        expect(tabRules).toHaveLength(1);
        expect(tabRules[0].action).toBe('trash');
    });

    test('updateRule updates action and daysOld', async () => {
        const a = acct('update1');
        await addTab(a, 'Test', 'test-label', 'label');
        const settings = await getSettings(a);
        const tabId = settings.tabs.find((t) => t.value === 'test-label')!.id;

        await addRule(a, { tabId, action: 'trash', daysOld: 30, enabled: true });
        await updateRule(a, tabId, { action: 'archive', daysOld: 60 });

        const updated = await getSettings(a);
        const rule = updated.rules.find((r) => r.tabId === tabId);
        expect(rule!.action).toBe('archive');
        expect(rule!.daysOld).toBe(60);
    });

    test('updateRule no-op for non-existent tabId', async () => {
        const a = acct('update2');
        await expect(updateRule(a, 'nonexistent', { daysOld: 99 })).resolves.toBeUndefined();
    });

    test('removeRule removes by tabId', async () => {
        const a = acct('remove1');
        await addTab(a, 'ToRemove', 'remove-rule', 'label');
        const settings = await getSettings(a);
        const tabId = settings.tabs.find((t) => t.value === 'remove-rule')!.id;

        await addRule(a, { tabId, action: 'trash', daysOld: 7, enabled: true });
        await removeRule(a, tabId);

        const updated = await getSettings(a);
        expect(updated.rules.find((r) => r.tabId === tabId)).toBeUndefined();
    });

    test('removeRule no-op for non-existent tabId', async () => {
        const a = acct('remove2');
        await expect(removeRule(a, 'nonexistent')).resolves.toBeUndefined();
    });

    test('getRulesForExport returns enriched rules with tab metadata', async () => {
        const a = acct('export1');
        await addTab(a, 'Export Test', 'export-label', 'label');
        const settings = await getSettings(a);
        const tabId = settings.tabs.find((t) => t.value === 'export-label')!.id;

        await addRule(a, { tabId, action: 'trash', daysOld: 14, enabled: true });
        const exported = await getRulesForExport(a);

        expect(exported).toHaveLength(1);
        expect(exported[0].tabTitle).toBe('Export Test');
        expect(exported[0].tabValue).toBe('export-label');
        expect(exported[0].action).toBe('trash');
    });

    test('getRulesForExport excludes disabled rules', async () => {
        const a = acct('export2');
        await addTab(a, 'Disabled', 'disabled-label', 'label');
        const settings = await getSettings(a);
        const tabId = settings.tabs.find((t) => t.value === 'disabled-label')!.id;

        await addRule(a, { tabId, action: 'trash', daysOld: 30, enabled: false });
        const exported = await getRulesForExport(a);

        expect(exported.find((r) => r.tabId === tabId)).toBeUndefined();
    });
});

describe('settings backward compatibility', () => {
    test('default settings include empty rules array', async () => {
        const settings = await getSettings('compat-default@gmail.com');
        expect(settings.rules).toEqual([]);
    });

    test('existing settings without rules field default to empty array', async () => {
        mockStorage['account_compat-old@gmail.com'] = {
            tabs: [{ id: 'old1', title: 'Inbox', type: 'hash', value: '#inbox' }],
            theme: 'light',
            showUnreadCount: true,
        };

        const settings = await getSettings('compat-old@gmail.com');
        expect(settings.rules).toEqual([]);
    });
});

// ------ Global Theme (per-window, chrome.storage.local) ------

describe('global theme', () => {
    test('defaults to light when unset', async () => {
        expect(await getGlobalTheme()).toBe('light');
    });

    test('round-trips a set value', async () => {
        await setGlobalTheme('dark');
        expect(mockLocalStorage.globalTheme).toBe('dark');
        expect(await getGlobalTheme()).toBe('dark');
    });

    test('ignores an invalid stored value and falls back to light', async () => {
        mockLocalStorage.globalTheme = 'neon';
        expect(await getGlobalTheme()).toBe('light');
    });
});

describe('migrateThemeToGlobalIfNeeded', () => {
    test('is a no-op when the global theme already exists', async () => {
        mockLocalStorage.globalTheme = 'light';
        await migrateThemeToGlobalIfNeeded('user@gmail.com');
        expect(mockLocalStorage.globalTheme).toBe('light');
    });

    test('adopts the legacy sync "theme" key and cleans it up', async () => {
        mockStorage.theme = 'dark';
        await migrateThemeToGlobalIfNeeded('user@gmail.com');
        expect(mockLocalStorage.globalTheme).toBe('dark');
        expect(mockStorage.theme).toBeUndefined();
    });

    test('seeds from the account per-account theme when no legacy key', async () => {
        await saveSettings('user@gmail.com', { theme: 'light' });
        await migrateThemeToGlobalIfNeeded('user@gmail.com');
        expect(mockLocalStorage.globalTheme).toBe('light');
    });
});
