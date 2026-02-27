/**
 * storage.test.ts
 *
 * Unit tests for storage helpers.
 * Tests the current multi-account Tab API (addTab, removeTab, updateTab, etc.)
 * Mocks chrome.storage.sync.
 */

import { addTab, removeTab, updateTab, updateTabOrder, getSettings, saveSettings, getAllAccounts, migrateLegacySettingsIfNeeded, Settings, Tab } from '../src/utils/storage';

// In-memory mock storage
let mockStorage: Record<string, any> = {};

// Mock chrome.storage.sync + chrome.runtime
beforeAll(() => {
  (global as any).chrome = {
    storage: {
      sync: {
        get: jest.fn((keys: string | string[] | null, callback: (items: Record<string, any>) => void) => {
          if (keys === null) {
            callback({ ...mockStorage });
          } else {
            const keyArr = typeof keys === 'string' ? [keys] : keys;
            const result: Record<string, any> = {};
            keyArr.forEach(k => {
              if (mockStorage[k] !== undefined) {
                result[k] = mockStorage[k];
              }
            });
            callback(result);
          }
        }),
        set: jest.fn((items: Record<string, any>, callback: () => void) => {
          Object.assign(mockStorage, items);
          callback();
        })
      }
    },
    runtime: {
      lastError: null
    }
  };

  // Polyfill crypto.randomUUID for test environment
  if (!globalThis.crypto?.randomUUID) {
    Object.defineProperty(globalThis, 'crypto', {
      value: {
        randomUUID: () => Math.random().toString(36).substring(2) + Date.now().toString(36)
      },
      writable: true
    });
  }
});

beforeEach(() => {
  // Clear in-place so mock closures always reference the same object
  Object.keys(mockStorage).forEach(k => delete mockStorage[k]);
  jest.clearAllMocks();
  (global as any).chrome.runtime.lastError = null;
});

// ------ getSettings ------

describe('getSettings', () => {
  test('returns default settings for new account', async () => {
    const settings = await getSettings('user@gmail.com');
    expect(settings.tabs).toHaveLength(2); // Inbox + Sent defaults
    expect(settings.theme).toBe('system');
    expect(settings.showUnreadCount).toBe(true);
  });

  test('returns stored settings when present', async () => {
    const stored: Settings = {
      tabs: [{ id: 'tab1', title: 'Work', type: 'label', value: 'Work' }],
      theme: 'dark',
      showUnreadCount: false
    };
    mockStorage['account_user@gmail.com'] = stored;

    const settings = await getSettings('user@gmail.com');
    expect(settings.tabs).toHaveLength(1);
    expect(settings.tabs[0].title).toBe('Work');
    expect(settings.theme).toBe('dark');
    expect(settings.showUnreadCount).toBe(false);
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
    const workTabs = settings.tabs.filter(t => t.value === '#label/Work');
    expect(workTabs).toHaveLength(1);
  });

  test('trims title and value', async () => {
    await addTab('user@gmail.com', '  Padded  ', '  #starred  ', 'hash');
    const settings = await getSettings('user@gmail.com');
    const added = settings.tabs.find(t => t.title === 'Padded');
    expect(added).toBeDefined();
    expect(added!.value).toBe('#starred');
  });
});

// ------ removeTab ------

describe('removeTab', () => {
  test('removes a tab by ID', async () => {
    await addTab('user@gmail.com', 'ToRemove', 'remove-me', 'label');
    let settings = await getSettings('user@gmail.com');
    const tabId = settings.tabs.find(t => t.value === 'remove-me')!.id;

    await removeTab('user@gmail.com', tabId);
    settings = await getSettings('user@gmail.com');
    expect(settings.tabs.find(t => t.value === 'remove-me')).toBeUndefined();
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
    const tabId = settings.tabs.find(t => t.value === 'val1')!.id;

    await updateTab('user@gmail.com', tabId, { title: 'NewName' });
    settings = await getSettings('user@gmail.com');
    expect(settings.tabs.find(t => t.id === tabId)!.title).toBe('NewName');
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
    mockStorage['account_a@gmail.com'] = { tabs: [], theme: 'system', showUnreadCount: true };
    mockStorage['account_b@gmail.com'] = { tabs: [], theme: 'dark', showUnreadCount: false };
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
    mockStorage['account_user@gmail.com'] = { tabs: [{ id: '1', title: 'Test', type: 'label', value: 'Test' }], theme: 'dark', showUnreadCount: true };
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
      if (typeof t.title !== 'string' || !t.title.trim()) return `Invalid tab at index ${i}: missing or empty "title".`;
      if (t.type !== 'label' && t.type !== 'hash') return `Invalid tab at index ${i}: "type" must be "label" or "hash".`;
      if (typeof t.value !== 'string' || !t.value.trim()) return `Invalid tab at index ${i}: missing or empty "value".`;
    }
    return null;
  }

  test('accepts valid import data', () => {
    const data = {
      version: 1,
      tabs: [
        { id: 'tab1', title: 'Inbox', type: 'hash', value: '#inbox' },
        { id: 'tab2', title: 'Work', type: 'label', value: 'Work' }
      ]
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
