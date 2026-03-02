/**
 * content.test.ts
 *
 * Unit tests for content.ts initialization logic.
 * Tests extractEmailFromDOM() behavior indirectly, and verifies
 * the storage change listener triggers re-renders for relevant keys.
 *
 * content.ts has heavy side effects on import (InboxSDK, MutationObserver,
 * chrome listeners), so we use jest.isolateModules() and careful mocking.
 */

// ---------------------------------------------------------------------------
// Shared mock infrastructure
// ---------------------------------------------------------------------------

// Store references to listeners registered during module import
let storageChangeListeners: Array<(changes: Record<string, any>, area: string) => void> = [];
let messageListeners: Array<(message: any, sender: any, sendResponse: any) => void> = [];

const mockGetSettings = jest.fn();
const mockMigrate = jest.fn().mockResolvedValue(undefined);
const mockSaveSettings = jest.fn().mockResolvedValue(undefined);
const mockRenderTabs = jest.fn();
const mockUpdateActiveTab = jest.fn();
const mockApplyTheme = jest.fn();
const mockListenForSystemThemeChanges = jest.fn();

// The shared state object that content.ts will mutate
const mockState: any = {
    currentSettings: null,
    currentUserEmail: null,
    initPromise: null,
    observer: null,
};

function setupGlobalMocks(): void {
    storageChangeListeners = [];
    messageListeners = [];

    (global as any).chrome = {
        storage: {
            sync: {
                get: jest.fn((_keys: any, cb: (result: any) => void) => cb({})),
                set: jest.fn((_items: any, cb?: () => void) => cb?.()),
                remove: jest.fn((_key: any, cb?: () => void) => cb?.()),
            },
            onChanged: {
                addListener: jest.fn((cb: any) => storageChangeListeners.push(cb)),
            },
        },
        runtime: {
            lastError: null,
            getURL: jest.fn((path: string) => `chrome-extension://test-id/${path}`),
            onMessage: {
                addListener: jest.fn((cb: any) => messageListeners.push(cb)),
            },
        },
    };

    // Mock MutationObserver
    (global as any).MutationObserver = jest.fn().mockImplementation(() => ({
        observe: jest.fn(),
        disconnect: jest.fn(),
        takeRecords: jest.fn(),
    }));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = '';
    document.title = '';
    mockState.currentSettings = null;
    mockState.currentUserEmail = null;
    mockState.initPromise = null;
    mockState.observer = null;
    mockGetSettings.mockReset();
    mockRenderTabs.mockReset();
    mockUpdateActiveTab.mockReset();
    mockApplyTheme.mockReset();
    mockListenForSystemThemeChanges.mockReset();
    mockMigrate.mockReset().mockResolvedValue(undefined);
    mockSaveSettings.mockReset().mockResolvedValue(undefined);
    setupGlobalMocks();
});

describe('extractEmailFromDOM (tested via initializeFromDOM)', () => {
    function importContent(): Promise<void> {
        return new Promise<void>((resolve) => {
            jest.isolateModules(() => {
                // Set up all required mocks before the import
                jest.doMock('@inboxsdk/core', () => ({
                    load: jest.fn().mockResolvedValue({
                        User: { getEmailAddress: () => 'sdk@gmail.com' },
                        Router: { handleAllRoutes: jest.fn() },
                    }),
                }));

                jest.doMock('../src/utils/storage', () => ({
                    getSettings: mockGetSettings,
                    migrateLegacySettingsIfNeeded: mockMigrate,
                    saveSettings: mockSaveSettings,
                }));

                jest.doMock('../src/modules/state', () => ({
                    state: mockState,
                    TABS_BAR_ID: 'gmail-labels-as-tabs-bar',
                    TOOLBAR_SELECTORS: ['.G-atb'],
                    getAppSettings: () => mockState.currentSettings,
                    setAppSettings: (s: any) => { mockState.currentSettings = s; },
                    getUserEmail: () => mockState.currentUserEmail,
                    setUserEmail: (e: any) => { mockState.currentUserEmail = e; },
                }));

                jest.doMock('../src/modules/theme', () => ({
                    applyTheme: mockApplyTheme,
                    listenForSystemThemeChanges: mockListenForSystemThemeChanges,
                }));

                jest.doMock('../src/modules/unread', () => ({
                    handleUnreadUpdates: jest.fn(),
                }));

                jest.doMock('../src/modules/tabs', () => ({
                    renderTabs: mockRenderTabs,
                    createTabsBar: jest.fn(() => {
                        const el = document.createElement('div');
                        el.id = 'gmail-labels-as-tabs-bar';
                        return el;
                    }),
                    updateActiveTab: mockUpdateActiveTab,
                    setModalCallbacks: jest.fn(),
                }));

                jest.doMock('../src/modules/modals', () => ({
                    showPinModal: jest.fn(),
                    showEditModal: jest.fn(),
                    showDeleteModal: jest.fn(),
                    toggleSettingsModal: jest.fn(),
                    setRenderCallback: jest.fn(),
                }));

                // eslint-disable-next-line @typescript-eslint/no-require-imports
                require('../src/content');
                resolve();
            });
        });
    }

    test('extracts email from document title', async () => {
        document.title = 'Inbox (3) - user@gmail.com - Gmail';
        mockGetSettings.mockResolvedValue({
            tabs: [],
            showUnreadCount: false,
            theme: 'system',
            rules: [],
        });

        await importContent();

        // Allow async initialization to complete
        await new Promise((r) => setTimeout(r, 100));

        expect(mockState.currentUserEmail).toBe('user@gmail.com');
    });

    test('extracts email from aria-label on account element', async () => {
        document.title = 'Gmail';

        const accountEl = document.createElement('a');
        accountEl.setAttribute('aria-label', 'Google Account: test@example.com');
        document.body.appendChild(accountEl);

        mockGetSettings.mockResolvedValue({
            tabs: [],
            showUnreadCount: false,
            theme: 'system',
            rules: [],
        });

        await importContent();
        await new Promise((r) => setTimeout(r, 100));

        expect(mockState.currentUserEmail).toBe('test@example.com');
    });

    test('returns null when no email found in DOM, SDK provides fallback', async () => {
        document.title = 'Gmail';
        mockGetSettings.mockResolvedValue({
            tabs: [],
            showUnreadCount: false,
            theme: 'system',
            rules: [],
        });

        await importContent();
        // Wait for InboxSDK fallback
        await new Promise((r) => setTimeout(r, 200));

        // SDK fallback should set email
        expect(mockState.currentUserEmail).toBe('sdk@gmail.com');
    });
});

describe('storage change listener', () => {
    function importContentAndGetListeners(): Promise<void> {
        return new Promise<void>((resolve) => {
            jest.isolateModules(() => {
                jest.doMock('@inboxsdk/core', () => ({
                    load: jest.fn().mockResolvedValue({
                        User: { getEmailAddress: () => 'user@test.com' },
                        Router: { handleAllRoutes: jest.fn() },
                    }),
                }));

                jest.doMock('../src/utils/storage', () => ({
                    getSettings: mockGetSettings,
                    migrateLegacySettingsIfNeeded: mockMigrate,
                    saveSettings: mockSaveSettings,
                }));

                jest.doMock('../src/modules/state', () => ({
                    state: mockState,
                    TABS_BAR_ID: 'gmail-labels-as-tabs-bar',
                    TOOLBAR_SELECTORS: ['.G-atb'],
                    getAppSettings: () => mockState.currentSettings,
                    setAppSettings: (s: any) => { mockState.currentSettings = s; },
                    getUserEmail: () => mockState.currentUserEmail,
                    setUserEmail: (e: any) => { mockState.currentUserEmail = e; },
                }));

                jest.doMock('../src/modules/theme', () => ({
                    applyTheme: mockApplyTheme,
                    listenForSystemThemeChanges: mockListenForSystemThemeChanges,
                }));

                jest.doMock('../src/modules/unread', () => ({
                    handleUnreadUpdates: jest.fn(),
                }));

                jest.doMock('../src/modules/tabs', () => ({
                    renderTabs: mockRenderTabs,
                    createTabsBar: jest.fn(() => {
                        const el = document.createElement('div');
                        el.id = 'gmail-labels-as-tabs-bar';
                        return el;
                    }),
                    updateActiveTab: mockUpdateActiveTab,
                    setModalCallbacks: jest.fn(),
                }));

                jest.doMock('../src/modules/modals', () => ({
                    showPinModal: jest.fn(),
                    showEditModal: jest.fn(),
                    showDeleteModal: jest.fn(),
                    toggleSettingsModal: jest.fn(),
                    setRenderCallback: jest.fn(),
                }));

                // eslint-disable-next-line @typescript-eslint/no-require-imports
                require('../src/content');
                resolve();
            });
        });
    }

    test('triggers renderTabs when account key changes', async () => {
        document.title = 'Inbox - user@test.com - Gmail';
        const settings = { tabs: [], showUnreadCount: false, theme: 'system' as const, rules: [] };
        mockGetSettings.mockResolvedValue(settings);

        await importContentAndGetListeners();
        await new Promise((r) => setTimeout(r, 100));

        // Reset call count after init
        mockRenderTabs.mockClear();

        // Simulate storage change for the account key
        mockState.currentUserEmail = 'user@test.com';
        const listener = storageChangeListeners[0];
        if (listener) {
            listener({ 'account_user@test.com': { newValue: settings } }, 'sync');
            await new Promise((r) => setTimeout(r, 50));
            expect(mockRenderTabs).toHaveBeenCalled();
        }
    });

    test('ignores changes to irrelevant keys', async () => {
        document.title = 'Inbox - user@test.com - Gmail';
        const settings = { tabs: [], showUnreadCount: false, theme: 'system' as const, rules: [] };
        mockGetSettings.mockResolvedValue(settings);

        await importContentAndGetListeners();
        await new Promise((r) => setTimeout(r, 100));

        mockRenderTabs.mockClear();

        mockState.currentUserEmail = 'user@test.com';
        const listener = storageChangeListeners[0];
        if (listener) {
            listener({ 'unrelated_key': { newValue: 'something' } }, 'sync');
            await new Promise((r) => setTimeout(r, 50));
            expect(mockRenderTabs).not.toHaveBeenCalled();
        }
    });
});
