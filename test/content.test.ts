export {};
import { flush } from './helpers/async';

/**
 * content.test.ts
 *
 * Unit tests for content.ts initialization logic.
 * Tests extractEmailFromDOM() behavior indirectly, and verifies
 * the storage change listener triggers re-renders for relevant keys.
 *
 * content.ts has heavy side effects on import (MutationObserver, chrome
 * listeners), so we use jest.isolateModules() and careful mocking.
 */

// ---------------------------------------------------------------------------
// Shared mock infrastructure
// ---------------------------------------------------------------------------

// Store references to listeners registered during module import
let storageChangeListeners: Array<(changes: Record<string, any>, area: string) => void> = [];

/** The first-run tour flag. False in every test but the one that covers it. */
const mockTakePendingOnboarding = jest.fn().mockResolvedValue(false);
let messageListeners: Array<(message: any, sender: any, sendResponse: any) => void> = [];

const mockGetSettings = jest.fn();
const mockMigrate = jest.fn().mockResolvedValue(undefined);
const mockSaveSettings = jest.fn().mockResolvedValue(undefined);
const mockGetGlobalTheme = jest.fn().mockResolvedValue('system');
const mockMigrateTheme = jest.fn().mockResolvedValue(undefined);
const mockEnsureAccountRegistered = jest.fn().mockResolvedValue(undefined);
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
    mockGetGlobalTheme.mockReset().mockResolvedValue('system');
    mockMigrateTheme.mockReset().mockResolvedValue(undefined);
    setupGlobalMocks();
});

describe('extractEmailFromDOM (tested via initializeFromDOM)', () => {
    function importContent(): Promise<void> {
        return new Promise<void>((resolve) => {
            jest.isolateModules(() => {
                // Set up all required mocks before the import
                jest.doMock('../src/utils/storage', () => ({
                    getSettings: mockGetSettings,
                    migrateLegacySettingsIfNeeded: mockMigrate,
                    saveSettings: mockSaveSettings,
                    getGlobalTheme: mockGetGlobalTheme,
                    migrateThemeToGlobalIfNeeded: mockMigrateTheme,
                    ensureAccountRegistered: mockEnsureAccountRegistered,
                    GLOBAL_THEME_STORAGE_KEY: 'globalTheme',
                    takePendingOnboarding: mockTakePendingOnboarding,
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
                    computeKnownLabelTokens: jest.fn(() => []),
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

        // Let initialisation settle. Turns, not milliseconds: see helpers/async.
        await flush();

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
        await flush();

        expect(mockState.currentUserEmail).toBe('test@example.com');
    });

    test('no email in the DOM leaves the account undetected and arms the poller', async () => {
        // This used to assert that InboxSDK supplied the address. It
        // never did in a shipped build: the SDK's page world needs a
        // permission this extension does not declare, so `load()` never
        // settled. The mock made the fiction pass. The poller below is what
        // actually recovers this case, so that is what is tested now.
        document.title = 'Gmail';
        const setIntervalSpy = jest.spyOn(global, 'setInterval');
        mockGetSettings.mockResolvedValue({
            tabs: [],
            showUnreadCount: false,
            theme: 'system',
            rules: [],
        });

        await importContent();
        await flush(40);

        expect(mockState.currentUserEmail).toBeNull();

        const pollCall = setIntervalSpy.mock.calls.find(([, ms]) => ms === 1000);
        expect(pollCall).toBeDefined();

        // Gmail finishes painting and the address appears.
        document.title = 'Inbox - late@gmail.com - Gmail';
        (pollCall![0] as () => void)();
        await flush();

        expect(mockState.currentUserEmail).toBe('late@gmail.com');
        setIntervalSpy.mockRestore();
    });
});

describe('storage change listener', () => {
    function importContentAndGetListeners(): Promise<void> {
        return new Promise<void>((resolve) => {
            jest.isolateModules(() => {
                jest.doMock('../src/utils/storage', () => ({
                    getSettings: mockGetSettings,
                    migrateLegacySettingsIfNeeded: mockMigrate,
                    saveSettings: mockSaveSettings,
                    getGlobalTheme: mockGetGlobalTheme,
                    migrateThemeToGlobalIfNeeded: mockMigrateTheme,
                    ensureAccountRegistered: mockEnsureAccountRegistered,
                    GLOBAL_THEME_STORAGE_KEY: 'globalTheme',
                    takePendingOnboarding: mockTakePendingOnboarding,
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
        await flush();

        // Reset call count after init
        mockRenderTabs.mockClear();

        // Simulate storage change for the account key
        mockState.currentUserEmail = 'user@test.com';
        const listener = storageChangeListeners[0];
        if (listener) {
            listener({ 'account_user@test.com': { newValue: settings } }, 'sync');
            await flush();
            expect(mockRenderTabs).toHaveBeenCalled();
        }
    });

    test('ignores changes to irrelevant keys', async () => {
        document.title = 'Inbox - user@test.com - Gmail';
        const settings = { tabs: [], showUnreadCount: false, theme: 'system' as const, rules: [] };
        mockGetSettings.mockResolvedValue(settings);

        await importContentAndGetListeners();
        await flush();

        mockRenderTabs.mockClear();

        mockState.currentUserEmail = 'user@test.com';
        const listener = storageChangeListeners[0];
        if (listener) {
            listener({ 'unrelated_key': { newValue: 'something' } }, 'sync');
            await flush();
            expect(mockRenderTabs).not.toHaveBeenCalled();
        }
    });
});

// ---------------------------------------------------------------------------
// Injection + global theme application
// ---------------------------------------------------------------------------

describe('injection and theme', () => {
    function importContent(): Promise<void> {
        return new Promise<void>((resolve) => {
            jest.isolateModules(() => {
                jest.doMock('../src/utils/storage', () => ({
                    getSettings: mockGetSettings,
                    migrateLegacySettingsIfNeeded: mockMigrate,
                    saveSettings: mockSaveSettings,
                    getGlobalTheme: mockGetGlobalTheme,
                    migrateThemeToGlobalIfNeeded: mockMigrateTheme,
                    ensureAccountRegistered: mockEnsureAccountRegistered,
                    GLOBAL_THEME_STORAGE_KEY: 'globalTheme',
                    takePendingOnboarding: mockTakePendingOnboarding,
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
                    computeKnownLabelTokens: jest.fn(() => []),
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

    /** jsdom returns 0-height rects; force a visible toolbar so injection proceeds. */
    function addVisibleToolbar(): HTMLElement {
        const toolbar = document.createElement('div');
        toolbar.className = 'G-atb';
        toolbar.getBoundingClientRect = () =>
            ({ height: 44, width: 200, top: 0, left: 0, right: 200, bottom: 44, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
        document.body.appendChild(toolbar);
        return toolbar;
    }

    test('injects the tab bar immediately after the Gmail toolbar', async () => {
        const toolbar = addVisibleToolbar();
        document.title = 'Inbox - user@test.com - Gmail';
        mockGetSettings.mockResolvedValue({ tabs: [], showUnreadCount: false, theme: 'system', rules: [] });

        await importContent();
        await flush();

        const bar = document.getElementById('gmail-labels-as-tabs-bar');
        expect(bar).not.toBeNull();
        expect(toolbar.nextElementSibling).toBe(bar);
    });

    test('defers injection when no toolbar exists (no crash, bar not injected)', async () => {
        jest.useFakeTimers();
        try {
            document.title = 'Inbox - user@test.com - Gmail';
            mockGetSettings.mockResolvedValue({ tabs: [], showUnreadCount: false, theme: 'system', rules: [] });

            await importContent();

            // No toolbar in the DOM -> bar must not be injected yet.
            expect(document.getElementById('gmail-labels-as-tabs-bar')).toBeNull();

            // Advancing time must not crash and must not inject (still no toolbar).
            expect(() => jest.advanceTimersByTime(5000)).not.toThrow();
            expect(document.getElementById('gmail-labels-as-tabs-bar')).toBeNull();
        } finally {
            jest.clearAllTimers();
            jest.useRealTimers();
        }
    });

    test('applies the global theme on init', async () => {
        addVisibleToolbar();
        document.title = 'Inbox - user@test.com - Gmail';
        mockGetGlobalTheme.mockResolvedValue('dark');
        mockGetSettings.mockResolvedValue({ tabs: [], showUnreadCount: false, theme: 'system', rules: [] });

        await importContent();
        await flush();

        expect(mockApplyTheme).toHaveBeenCalledWith('dark');
    });

    test('reapplies theme when globalTheme changes in storage.local', async () => {
        document.title = 'Inbox - user@test.com - Gmail';
        mockGetSettings.mockResolvedValue({ tabs: [], showUnreadCount: false, theme: 'system', rules: [] });

        await importContent();
        await flush();
        mockApplyTheme.mockClear();

        const listener = storageChangeListeners[0];
        listener({ globalTheme: { newValue: 'light' } }, 'local');

        expect(mockApplyTheme).toHaveBeenCalledWith('light');
    });

    test('ignores local storage changes to unrelated keys', async () => {
        document.title = 'Inbox - user@test.com - Gmail';
        mockGetSettings.mockResolvedValue({ tabs: [], showUnreadCount: false, theme: 'system', rules: [] });

        await importContent();
        await flush();
        mockApplyTheme.mockClear();

        const listener = storageChangeListeners[0];
        listener({ somethingElse: { newValue: 1 } }, 'local');

        expect(mockApplyTheme).not.toHaveBeenCalled();
    });
});

// ---------------------------------------------------------------------------
// Handover
//
// Chrome does not reload a tab when the extension is updated, so the worker
// injects a fresh content script into the tab instead. That leaves two copies
// in one page for an instant. These cover this copy's side of the exchange:
// it answers the worker's ping, and it gets out of the way when a newer copy
// arrives.
// ---------------------------------------------------------------------------

describe('handover between two copies in one page', () => {
    let observerCallback: (() => void) | null = null;

    function importContent(): Promise<void> {
        return new Promise<void>((resolve) => {
            jest.isolateModules(() => {
                jest.doMock('../src/utils/storage', () => ({
                    getSettings: mockGetSettings,
                    migrateLegacySettingsIfNeeded: mockMigrate,
                    saveSettings: mockSaveSettings,
                    getGlobalTheme: mockGetGlobalTheme,
                    migrateThemeToGlobalIfNeeded: mockMigrateTheme,
                    ensureAccountRegistered: mockEnsureAccountRegistered,
                    GLOBAL_THEME_STORAGE_KEY: 'globalTheme',
                    takePendingOnboarding: mockTakePendingOnboarding,
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
                    computeKnownLabelTokens: jest.fn(() => []),
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

    function addVisibleToolbar(): void {
        const toolbar = document.createElement('div');
        toolbar.className = 'G-atb';
        toolbar.getBoundingClientRect = () =>
            ({ height: 44, width: 200, top: 0, left: 0, right: 200, bottom: 44, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
        document.body.appendChild(toolbar);
    }

    beforeEach(() => {
        observerCallback = null;
        (global as any).MutationObserver = jest.fn().mockImplementation((cb: () => void) => {
            observerCallback = cb;
            return { observe: jest.fn(), disconnect: jest.fn(), takeRecords: jest.fn() };
        });
    });

    test('answers the worker ping, which is how it is counted as alive', async () => {
        await importContent();
        await flush();
        const sendResponse = jest.fn();

        const held = messageListeners[0]({ action: 'PING' }, {}, sendResponse);

        expect(sendResponse).toHaveBeenCalledWith({ ok: true });
        // Answered on the spot: holding the channel open would leave the
        // worker's promise pending and every tab looking unreachable.
        expect(held).toBe(false);
    });

    test('clears a previous copy tab bar off the page as it starts', async () => {
        const stale = document.createElement('div');
        stale.id = 'gmail-labels-as-tabs-bar';
        stale.dataset.fromTheOldCopy = 'yes';
        document.body.appendChild(stale);
        addVisibleToolbar();

        await importContent();
        await flush();

        const bar = document.getElementById('gmail-labels-as-tabs-bar');
        expect(bar).not.toBeNull();
        expect(bar!.dataset.fromTheOldCopy).toBeUndefined();
    });

    test('removes its own tab bar when a newer copy takes the page over', async () => {
        addVisibleToolbar();
        await importContent();
        await flush();
        expect(document.getElementById('gmail-labels-as-tabs-bar')).not.toBeNull();

        document.dispatchEvent(new CustomEvent('gmailTabs:standDown'));

        expect(document.getElementById('gmail-labels-as-tabs-bar')).toBeNull();
    });

    test('does not put the bar back after standing down', async () => {
        // The observer is disconnected on stand-down, but a mutation already
        // queued still arrives. Without the guard, the copy that just handed
        // over re-injects a bar whose buttons can no longer reach storage.
        addVisibleToolbar();
        await importContent();
        await flush();

        document.dispatchEvent(new CustomEvent('gmailTabs:standDown'));
        observerCallback?.();
        await new Promise((r) => setTimeout(r, 150));

        expect(document.getElementById('gmail-labels-as-tabs-bar')).toBeNull();
    });
});
