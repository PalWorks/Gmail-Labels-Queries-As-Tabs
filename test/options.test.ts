/**
 * options.test.ts
 *
 * Unit tests for the Options page entry point.
 * Tests navigation/routing, theme rendering, add tab smart detection,
 * preferences (unread toggle), export/import/uninstall wiring,
 * rules rendering, and initialization flow.
 *
 * Since options.ts does not export any functions and runs everything
 * inside a DOMContentLoaded handler, we use jest.isolateModules and
 * manually dispatch DOMContentLoaded after setting up the DOM.
 */

export {};
import { flush } from './helpers/async';

// ---------------------------------------------------------------------------
// Mock dependencies
// ---------------------------------------------------------------------------

const mockGetSettings = jest.fn();
const mockSaveSettings = jest.fn().mockResolvedValue(undefined);
const mockSavePreferences = jest.fn().mockResolvedValue({ tabs: [], rules: [], theme: 'light', showUnreadCount: true, rev: 1 });
const mockPatchRule = jest.fn().mockResolvedValue({ tabs: [], rules: [], theme: 'light', showUnreadCount: true, rev: 1 });
const mockGetAllAccounts = jest.fn();
const mockGetGlobalTheme = jest.fn().mockResolvedValue('system');
const mockSetGlobalTheme = jest.fn().mockResolvedValue(undefined);
const mockAddTab = jest.fn().mockResolvedValue(undefined);
const mockRemoveTab = jest.fn().mockResolvedValue(undefined);
const mockUpdateTabOrder = jest.fn().mockResolvedValue(undefined);
const mockRenderTabListItems = jest.fn();
const mockBuildExportPayload = jest.fn().mockReturnValue({ tabs: [] });
const mockGenerateExportFilename = jest.fn().mockReturnValue('export.json');
const mockValidateImportData = jest.fn();
const mockTriggerDownload = jest.fn().mockResolvedValue({ success: true });
const mockGenerateAppsScript = jest.fn().mockReturnValue('// generated script');

/** What `chrome.storage.local.get` hands back. Set per test. */
let localStore: Record<string, unknown> = {};

jest.mock('../src/utils/storage', () => ({
    getSettings: (...args: any[]) => mockGetSettings(...args),
    saveSettings: (...args: any[]) => mockSaveSettings(...args),
    savePreferences: (...args: any[]) => mockSavePreferences(...args),
    patchRule: (...args: any[]) => mockPatchRule(...args),
    describeWriteFailure: (e: unknown) =>
        /QUOTA_BYTES/.test(String((e as Error)?.message ?? e))
            ? 'Settings are full: Chrome sync allows about 8 KB per account. Remove some tabs or rules.'
            : 'That change could not be saved. Please try again.',
    isQuotaError: (e: unknown) => /QUOTA_BYTES/.test(String((e as Error)?.message ?? e)),
    clampDaysOld: (v: unknown, fallback = 30) => {
        const n = typeof v === 'number' ? v : Number(v);
        return Number.isFinite(n) ? Math.min(3650, Math.max(1, Math.round(n))) : fallback;
    },
    MIN_DAYS_OLD: 1,
    MAX_DAYS_OLD: 3650,
    accountStorageKey: (id: string) => `account_${id}`,
    getAllAccounts: (...args: any[]) => mockGetAllAccounts(...args),
    addTab: (...args: any[]) => mockAddTab(...args),
    removeTab: (...args: any[]) => mockRemoveTab(...args),
    updateTabOrder: (...args: any[]) => mockUpdateTabOrder(...args),
    getGlobalTheme: (...args: any[]) => mockGetGlobalTheme(...args),
    setGlobalTheme: (...args: any[]) => mockSetGlobalTheme(...args),
    GLOBAL_THEME_STORAGE_KEY: 'globalTheme',
}));

jest.mock('../src/utils/importExport', () => ({
    buildExportPayload: (...args: any[]) => mockBuildExportPayload(...args),
    generateExportFilename: (...args: any[]) => mockGenerateExportFilename(...args),
    validateImportData: (...args: any[]) => mockValidateImportData(...args),
    triggerDownload: (...args: any[]) => mockTriggerDownload(...args),
    sameAccount: (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase(),
    MAX_IMPORT_BYTES: 256 * 1024,
}));

jest.mock('../src/utils/tabListRenderer', () => ({
    renderTabListItems: (...args: any[]) => mockRenderTabListItems(...args),
    escapeHtml: (str: string) => str,
}));

jest.mock('../src/modules/rules', () => {
    const actual = jest.requireActual('../src/modules/rules');
    return {
        ...actual,
        generateAppsScript: (...args: any[]) => mockGenerateAppsScript(...args),
    };
});

jest.mock('../src/modules/state', () => {
    const s = { currentUserEmail: null as string | null, currentSettings: null as any };
    return {
        state: s,
        getAppSettings: () => s.currentSettings,
        setAppSettings: (v: any) => { s.currentSettings = v; },
        getUserEmail: () => s.currentUserEmail,
        setUserEmail: (v: any) => { s.currentUserEmail = v; },
    };
});

const mockCreateModalDragHandlers = jest.fn().mockReturnValue({
    handleModalDragStart: jest.fn(),
    handleModalDragOver: jest.fn(),
    handleModalDragEnter: jest.fn(),
    handleModalDragLeave: jest.fn(),
    handleModalDrop: jest.fn(),
    handleModalDragEnd: jest.fn(),
});

jest.mock('../src/modules/dragdrop', () => ({
    createModalDragHandlers: (...args: any[]) => mockCreateModalDragHandlers(...args),
}));

// ---------------------------------------------------------------------------
// Chrome API mocks
// ---------------------------------------------------------------------------

beforeAll(() => {
    (global as any).chrome = {
        storage: {
            sync: { get: jest.fn(), set: jest.fn() },
            // The integration-health row reads this. Its absence used to be
            // invisible because nothing on the page read local storage.
            local: {
                get: jest.fn((_keys: string[], cb: (v: Record<string, unknown>) => void) => cb(localStore)),
                set: jest.fn(),
            },
            onChanged: { addListener: jest.fn() },
        },
        runtime: { sendMessage: jest.fn(), getManifest: () => ({ version: '1.7.0' }) },
    };

    // Mock window.matchMedia (not available in jsdom)
    Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: jest.fn().mockImplementation((query: string) => ({
            matches: query.includes('dark') ? false : false,
            media: query,
            onchange: null,
            addListener: jest.fn(),
            removeListener: jest.fn(),
            addEventListener: jest.fn(),
            removeEventListener: jest.fn(),
            dispatchEvent: jest.fn(),
        })),
    });
});

// ---------------------------------------------------------------------------
// DOM Factory
// ---------------------------------------------------------------------------

const DEFAULT_SETTINGS = {
    tabs: [
        { id: '1', title: 'Inbox', value: '#inbox', type: 'hash' as const },
        { id: '2', title: 'Starred', value: '#starred', type: 'hash' as const },
    ],
    showUnreadCount: false,
    theme: 'system' as const,
    rules: [] as any[],
};

function buildOptionsDOM(): void {
    document.body.innerHTML = `
        <nav>
            <a class="nav-item active" data-section="settings" href="#">Settings</a>
            <a class="nav-item" data-section="rules" href="#">Rules</a>
            <a class="nav-item" data-section="guide" href="#">Guide</a>
            <a class="nav-item" data-section="privacy" href="#">Privacy</a>
            <a class="nav-item" data-section="contact" href="#">Contact</a>
            <a class="nav-item" data-section="logs" href="#">Logs</a>
        </nav>

        <div class="account-selector-bar" id="account-selector-bar">
            <select id="account-select"></select>
        </div>

        <section id="section-settings">
            <div id="settings-theme-group">
                <button class="theme-btn" data-theme="system">System</button>
                <button class="theme-btn" data-theme="light">Light</button>
                <button class="theme-btn" data-theme="dark">Dark</button>
            </div>

            <input  id="settings-add-input"       type="text" placeholder="Label or URL">
            <div    id="settings-add-title-group"  class="hidden">
                <input id="settings-add-title" type="text" placeholder="Tab Title">
            </div>
            <button id="settings-add-btn" disabled>Add Tab</button>
            <div    id="settings-add-error" class="hidden"></div>

            <ul id="settings-tab-list"></ul>

            <input type="checkbox" id="pref-unread">
            <label for="pref-unread">Show Unread Count</label>

            <span id="health-label-menu-name">Label menu item</span>
            <span class="health-pill" id="health-label-menu">-</span>
            <button id="health-copy-btn">Copy diagnostics</button>

            <button id="settings-export-btn">Export Config</button>
            <button id="settings-import-btn">Import Config</button>
            <button id="settings-uninstall-btn">Uninstall Extension</button>

            <button id="sidebar-theme-toggle">Toggle Theme</button>
            <span id="theme-icon-moon"></span>
            <span id="theme-icon-sun" class="hidden"></span>
        </section>

        <section id="section-rules" class="hidden">
            <div id="rules-list"></div>
            <button id="generate-script-btn">Generate & Copy Script</button>
            <input id="sheet-url" type="text" placeholder="Sheet URL">
            <a id="view-guide-link" href="#">View Guide</a>
        </section>

        <section id="section-guide" class="hidden"></section>
        <section id="section-privacy" class="hidden"></section>
        <section id="section-contact" class="hidden"></section>
        <section id="section-logs" class="hidden"></section>
    `;
}

/**
 * Flush pending microtasks and macro-tasks.
 *
 * Turn-based rather than time-based: loadSettings() awaits mocked storage that
 * resolves immediately, so what it needs is event-loop turns. Sleeping a fixed
 * 50ms instead made the suite fail under coverage instrumentation and on a
 * loaded machine.
 */
function flushAsync(): Promise<void> {
    return flush();
}

/**
 * Import options.ts inside jest.isolateModules, then fire DOMContentLoaded.
 * Returns after flushing all async operations from loadSettings().
 */
async function loadOptionsPage(): Promise<void> {
    jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require('../src/options');
    });
    document.dispatchEvent(new Event('DOMContentLoaded'));
    // Flush microtasks (awaits in loadSettings: getAllAccounts, getSettings, etc.)
    await flushAsync();
    await flushAsync();
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

// Pay the ts-jest compile cost for the whole options module graph once, here,
// rather than inside whichever test happens to run first.
beforeAll(() => {
    jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require('../src/options');
    });
});

beforeEach(() => {
    jest.clearAllMocks();
    document.body.innerHTML = '';
    document.body.className = '';
    window.location.hash = '';

    mockGetAllAccounts.mockResolvedValue(['user@gmail.com']);
    mockGetSettings.mockResolvedValue({ ...DEFAULT_SETTINGS });
    mockGetGlobalTheme.mockResolvedValue('system');
});

// ---------------------------------------------------------------------------
// Navigation & Routing
// ---------------------------------------------------------------------------

describe('navigation and routing', () => {
    test('defaults to settings section on empty hash', async () => {
        buildOptionsDOM();
        await loadOptionsPage();

        const settingsSection = document.getElementById('section-settings');
        expect(settingsSection?.classList.contains('hidden')).toBe(false);
    });

    test('shows rules section when hash is #rules', async () => {
        buildOptionsDOM();
        window.location.hash = '#rules';
        await loadOptionsPage();

        const rulesSection = document.getElementById('section-rules');
        expect(rulesSection?.classList.contains('hidden')).toBe(false);

        const settingsSection = document.getElementById('section-settings');
        expect(settingsSection?.classList.contains('hidden')).toBe(true);
    });

    test('updates active nav item to match section', async () => {
        buildOptionsDOM();
        window.location.hash = '#rules';
        await loadOptionsPage();

        const rulesNav = document.querySelector('[data-section="rules"]');
        const settingsNav = document.querySelector('[data-section="settings"]');
        expect(rulesNav?.classList.contains('active')).toBe(true);
        expect(settingsNav?.classList.contains('active')).toBe(false);
    });

    test('falls back to settings for unknown hash', async () => {
        buildOptionsDOM();
        window.location.hash = '#nonexistent';
        await loadOptionsPage();

        const settingsSection = document.getElementById('section-settings');
        expect(settingsSection?.classList.contains('hidden')).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// Settings Loading
// ---------------------------------------------------------------------------

describe('loadSettings', () => {
    test('populates account selector with detected account', async () => {
        buildOptionsDOM();
        await loadOptionsPage();

        const select = document.getElementById('account-select') as HTMLSelectElement;
        expect(select.options.length).toBe(1);
        expect(select.options[0].value).toBe('user@gmail.com');
        expect(select.value).toBe('user@gmail.com');
    });

    test('calls renderTabListItems after loading settings', async () => {
        buildOptionsDOM();
        await loadOptionsPage();

        expect(mockRenderTabListItems).toHaveBeenCalled();
        const callArgs = mockRenderTabListItems.mock.calls[0];
        expect(callArgs[0]).toBeInstanceOf(HTMLElement);
        expect(callArgs[1]).toEqual(DEFAULT_SETTINGS.tabs);
    });

    test('shows empty state when no accounts are found', async () => {
        mockGetAllAccounts.mockResolvedValue([]);
        buildOptionsDOM();
        await loadOptionsPage();

        const list = document.getElementById('settings-tab-list');
        // The copy tells the user what to do, since the extension registers the
        // account itself the moment Gmail is opened.
        expect(list?.innerHTML).toContain('No account yet');
        expect(list?.innerHTML).toContain('Open Gmail');
    });

    test('marks the account chip empty and disables it when there is no account', async () => {
        mockGetAllAccounts.mockResolvedValue([]);
        buildOptionsDOM();
        await loadOptionsPage();

        const select = document.getElementById('account-select') as HTMLSelectElement;
        const bar = document.getElementById('account-selector-bar') as HTMLElement;
        expect(bar.classList.contains('is-empty')).toBe(true);
        expect(select.disabled).toBe(true);
        expect(select.options[0].textContent).toMatch(/no account yet/i);
    });

    test('marks the chip single when exactly one account exists', async () => {
        buildOptionsDOM();
        await loadOptionsPage();

        const bar = document.getElementById('account-selector-bar') as HTMLElement;
        expect(bar.classList.contains('is-single')).toBe(true);
        expect(bar.classList.contains('is-empty')).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// Account Switching
// ---------------------------------------------------------------------------

describe('account switching', () => {
    test('populates account selector with all accounts', async () => {
        mockGetAllAccounts.mockResolvedValue(['work@gmail.com', 'personal@gmail.com']);
        buildOptionsDOM();
        await loadOptionsPage();

        const select = document.getElementById('account-select') as HTMLSelectElement;
        expect(select.options.length).toBe(2);
        expect(select.options[0].value).toBe('work@gmail.com');
        expect(select.options[1].value).toBe('personal@gmail.com');
    });

    test('reloads settings when account is switched', async () => {
        mockGetAllAccounts.mockResolvedValue(['work@gmail.com', 'personal@gmail.com']);
        const personalSettings = {
            ...DEFAULT_SETTINGS,
            theme: 'dark' as const,
            tabs: [{ id: '3', title: 'Projects', value: 'Projects', type: 'label' as const }],
        };
        mockGetSettings
            .mockResolvedValueOnce({ ...DEFAULT_SETTINGS })
            .mockResolvedValueOnce(personalSettings);

        buildOptionsDOM();
        await loadOptionsPage();

        const select = document.getElementById('account-select') as HTMLSelectElement;
        select.value = 'personal@gmail.com';
        select.dispatchEvent(new Event('change'));
        await flushAsync();

        expect(mockGetSettings).toHaveBeenCalledWith('personal@gmail.com');
    });

    test('does not reload when same account is selected', async () => {
        mockGetAllAccounts.mockResolvedValue(['work@gmail.com']);
        buildOptionsDOM();
        await loadOptionsPage();

        mockGetSettings.mockClear();

        const select = document.getElementById('account-select') as HTMLSelectElement;
        select.value = 'work@gmail.com';
        select.dispatchEvent(new Event('change'));
        await flushAsync();

        expect(mockGetSettings).not.toHaveBeenCalled();
    });

    test('shows single account without issues', async () => {
        mockGetAllAccounts.mockResolvedValue(['only@gmail.com']);
        buildOptionsDOM();
        await loadOptionsPage();

        const select = document.getElementById('account-select') as HTMLSelectElement;
        expect(select.options.length).toBe(1);
        expect(select.value).toBe('only@gmail.com');
    });
});

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------

describe('theme rendering', () => {
    test('marks the active theme button', async () => {
        // Theme is a browser-wide preference read from getGlobalTheme.
        mockGetGlobalTheme.mockResolvedValue('dark');
        buildOptionsDOM();
        await loadOptionsPage();

        const darkBtn = document.querySelector('[data-theme="dark"]');
        expect(darkBtn?.classList.contains('active')).toBe(true);

        const lightBtn = document.querySelector('[data-theme="light"]');
        expect(lightBtn?.classList.contains('active')).toBe(false);
    });

    test('applies theme-dark class to body for dark theme', async () => {
        mockGetGlobalTheme.mockResolvedValue('dark');
        buildOptionsDOM();
        await loadOptionsPage();

        expect(document.body.classList.contains('theme-dark')).toBe(true);
    });

    test('applies theme-light class to body for light theme', async () => {
        mockGetGlobalTheme.mockResolvedValue('light');
        buildOptionsDOM();
        await loadOptionsPage();

        expect(document.body.classList.contains('theme-light')).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// Add Tab (Smart Detection)
// ---------------------------------------------------------------------------

describe('add tab smart detection', () => {
    test('enables add button when label input has content', async () => {
        buildOptionsDOM();
        await loadOptionsPage();

        const input = document.getElementById('settings-add-input') as HTMLInputElement;
        const addBtn = document.getElementById('settings-add-btn') as HTMLButtonElement;

        input.value = 'Work';
        input.dispatchEvent(new Event('input'));

        expect(addBtn.disabled).toBe(false);
    });

    test('disables add button when label input is empty', async () => {
        buildOptionsDOM();
        await loadOptionsPage();

        const input = document.getElementById('settings-add-input') as HTMLInputElement;
        const addBtn = document.getElementById('settings-add-btn') as HTMLButtonElement;

        input.value = '';
        input.dispatchEvent(new Event('input'));

        expect(addBtn.disabled).toBe(true);
    });

    test('shows title group for URL inputs', async () => {
        buildOptionsDOM();
        await loadOptionsPage();

        const input = document.getElementById('settings-add-input') as HTMLInputElement;
        const titleGroup = document.getElementById('settings-add-title-group')!;

        input.value = '#search/from:boss';
        input.dispatchEvent(new Event('input'));

        expect(titleGroup.classList.contains('hidden')).toBe(false);
    });

    test('auto-fills title from #search/ URL', async () => {
        buildOptionsDOM();
        await loadOptionsPage();

        const input = document.getElementById('settings-add-input') as HTMLInputElement;
        const titleInput = document.getElementById('settings-add-title') as HTMLInputElement;

        input.value = '#search/from:boss';
        input.dispatchEvent(new Event('input'));

        expect(titleInput.value).toBe('from:boss');
    });

    test('auto-fills title from #label/ URL', async () => {
        buildOptionsDOM();
        await loadOptionsPage();

        const input = document.getElementById('settings-add-input') as HTMLInputElement;
        const titleInput = document.getElementById('settings-add-title') as HTMLInputElement;

        input.value = '#label/Work';
        input.dispatchEvent(new Event('input'));

        expect(titleInput.value).toBe('Work');
    });

    test('hides title group for plain label inputs', async () => {
        buildOptionsDOM();
        await loadOptionsPage();

        const input = document.getElementById('settings-add-input') as HTMLInputElement;
        const titleGroup = document.getElementById('settings-add-title-group')!;

        input.value = 'MyLabel';
        input.dispatchEvent(new Event('input'));

        expect(titleGroup.classList.contains('hidden')).toBe(true);
    });

    test('calls addTab with label type for plain text', async () => {
        buildOptionsDOM();
        await loadOptionsPage();

        const input = document.getElementById('settings-add-input') as HTMLInputElement;
        const addBtn = document.getElementById('settings-add-btn') as HTMLButtonElement;

        input.value = 'Newsletters';
        input.dispatchEvent(new Event('input'));
        addBtn.click();

        await flush(30);

        expect(mockAddTab).toHaveBeenCalledWith('user@gmail.com', 'Newsletters', 'Newsletters', 'label');
    });

    test('calls addTab with hash type for URL', async () => {
        buildOptionsDOM();
        await loadOptionsPage();

        const input = document.getElementById('settings-add-input') as HTMLInputElement;
        const titleInput = document.getElementById('settings-add-title') as HTMLInputElement;
        const addBtn = document.getElementById('settings-add-btn') as HTMLButtonElement;

        input.value = '#search/is:unread';
        input.dispatchEvent(new Event('input'));
        titleInput.value = 'Unread';
        addBtn.click();

        await flush(30);

        expect(mockAddTab).toHaveBeenCalledWith('user@gmail.com', 'Unread', '#search/is:unread', 'hash');
    });

    test('clears inputs after successful add', async () => {
        buildOptionsDOM();
        await loadOptionsPage();

        const input = document.getElementById('settings-add-input') as HTMLInputElement;
        const addBtn = document.getElementById('settings-add-btn') as HTMLButtonElement;

        input.value = 'Work';
        input.dispatchEvent(new Event('input'));
        addBtn.click();

        await flush(30);

        expect(input.value).toBe('');
        expect(addBtn.disabled).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// Preferences
// ---------------------------------------------------------------------------

describe('preferences', () => {
    test('sets unread checkbox from loaded settings', async () => {
        mockGetSettings.mockResolvedValue({
            ...DEFAULT_SETTINGS,
            showUnreadCount: true,
        });
        buildOptionsDOM();
        await loadOptionsPage();

        const checkbox = document.getElementById('pref-unread') as HTMLInputElement;
        expect(checkbox.checked).toBe(true);
    });

    test('saves unread toggle change to storage', async () => {
        buildOptionsDOM();
        await loadOptionsPage();

        const checkbox = document.getElementById('pref-unread') as HTMLInputElement;
        checkbox.checked = true;
        checkbox.dispatchEvent(new Event('change'));

        await flush(30);

        expect(mockSavePreferences).toHaveBeenCalledWith(
            'user@gmail.com',
            expect.objectContaining({ showUnreadCount: true })
        );
    });
});

// ---------------------------------------------------------------------------
// Rules Rendering
// ---------------------------------------------------------------------------

describe('rules rendering', () => {
    test('renders rules list with tabs', async () => {
        buildOptionsDOM();
        await loadOptionsPage();

        const container = document.getElementById('rules-list');
        expect(container).not.toBeNull();
        // renderRulesList is called directly from loadSettings,
        // which populates the container with rule rows
        expect(container!.querySelectorAll('.rule-row').length).toBeGreaterThanOrEqual(0);
    });

    test('shows empty state when no tabs are configured', async () => {
        mockGetSettings.mockResolvedValue({
            ...DEFAULT_SETTINGS,
            tabs: [],
        });
        buildOptionsDOM();
        await loadOptionsPage();

        const container = document.getElementById('rules-list');
        // Source renders: "No tabs configured yet. Go to Settings and add tabs first."
        expect(container?.innerHTML).toContain('No tabs configured yet');
    });
});

// ---------------------------------------------------------------------------
// Data Controls
// ---------------------------------------------------------------------------

describe('data controls', () => {
    test('export button is present and wired', async () => {
        buildOptionsDOM();
        await loadOptionsPage();

        const exportBtn = document.getElementById('settings-export-btn');
        expect(exportBtn).not.toBeNull();
    });

    test('import button is present and wired', async () => {
        buildOptionsDOM();
        await loadOptionsPage();

        const importBtn = document.getElementById('settings-import-btn');
        expect(importBtn).not.toBeNull();
    });

    test('uninstall button sends UNINSTALL_SELF message', async () => {
        buildOptionsDOM();
        await loadOptionsPage();

        // Mock window.confirm to return true
        const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);

        const btn = document.getElementById('settings-uninstall-btn')!;
        btn.click();

        expect((global as any).chrome.runtime.sendMessage).toHaveBeenCalledWith({
            action: 'UNINSTALL_SELF',
        });

        confirmSpy.mockRestore();
    });

    test('uninstall button does nothing when confirm is cancelled', async () => {
        buildOptionsDOM();
        await loadOptionsPage();

        const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(false);

        const btn = document.getElementById('settings-uninstall-btn')!;
        btn.click();

        expect((global as any).chrome.runtime.sendMessage).not.toHaveBeenCalled();

        confirmSpy.mockRestore();
    });
});

// ---------------------------------------------------------------------------
// Sidebar Theme Toggle
// ---------------------------------------------------------------------------

describe('sidebar theme toggle', () => {
    test('sidebar toggle button is present', async () => {
        buildOptionsDOM();
        await loadOptionsPage();

        const toggleBtn = document.getElementById('sidebar-theme-toggle');
        expect(toggleBtn).not.toBeNull();
    });
});

// ---------------------------------------------------------------------------
// Gmail integration health
// ---------------------------------------------------------------------------

describe('Gmail integration health', () => {
    beforeEach(() => {
        localStore = {};
    });

    afterEach(() => {
        localStore = {};
    });

    test('with nothing recorded, the row says so rather than claiming a failure', async () => {
        buildOptionsDOM();
        await loadOptionsPage();
        await flushAsync();
        expect(document.getElementById('health-label-menu')?.textContent).toBe('Not used yet');
        expect(document.getElementById('health-label-menu')?.classList.contains('is-unavailable')).toBe(false);
    });

    test('a working integration reads as working', async () => {
        localStore = { integrationHealth: { labelMenu: { status: 'active', at: Date.now() } } };
        buildOptionsDOM();
        await loadOptionsPage();
        await flushAsync();
        const pill = document.getElementById('health-label-menu');
        expect(pill?.textContent).toBe('Working');
        expect(pill?.classList.contains('is-active')).toBe(true);
    });

    test('a broken integration says which check gave up', async () => {
        localStore = {
            integrationHealth: { labelMenu: { status: 'unavailable', reason: 'no-menu', at: Date.now() } },
        };
        buildOptionsDOM();
        await loadOptionsPage();
        await flushAsync();
        const pill = document.getElementById('health-label-menu');
        expect(pill?.textContent).toContain('Unavailable');
        expect(pill?.textContent).toContain('menu');
        expect(pill?.classList.contains('is-unavailable')).toBe(true);
    });

    test('the copy button puts a diagnostic on the clipboard and says it did', async () => {
        const writeText = jest.fn().mockResolvedValue(undefined);
        Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
        localStore = {
            integrationHealth: { labelMenu: { status: 'unavailable', reason: 'no-model', at: Date.now() } },
        };

        buildOptionsDOM();
        await loadOptionsPage();
        await flushAsync();

        const button = document.getElementById('health-copy-btn') as HTMLButtonElement;
        button.click();
        await flushAsync();
        await flushAsync();

        // Not a call count: every loadOptionsPage() in this file leaves another
        // DOMContentLoaded handler on the shared document, so each page load
        // wires the button once more. What matters is what was written.
        expect(writeText).toHaveBeenCalled();
        const copied = writeText.mock.calls[0][0] as string;
        expect(copied).toContain('1.7.0');
        expect(copied).toContain('labelMenu: unavailable (no-model)');
        // The diagnostic is a support message, not a data disclosure.
        expect(copied).not.toMatch(/@/);
        expect(button.textContent).toBe('Copied');
    });

    test('a refused clipboard reports itself instead of doing nothing', async () => {
        // A button that silently does nothing is the defect this codebase has
        // fixed most often. See ADR-017.
        const writeText = jest.fn().mockRejectedValue(new Error('denied'));
        Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

        buildOptionsDOM();
        await loadOptionsPage();
        await flushAsync();

        const button = document.getElementById('health-copy-btn') as HTMLButtonElement;
        button.click();
        await flushAsync();
        await flushAsync();

        expect(button.textContent).toBe('Could not copy');
        expect(warn).toHaveBeenCalled();
        warn.mockRestore();
    });
});

// ---------------------------------------------------------------------------
// Rule edits: deltas, debounce, account capture, clamping, failures
// ---------------------------------------------------------------------------

describe('rule edits', () => {
    const LABEL_SETTINGS = {
        ...DEFAULT_SETTINGS,
        tabs: [{ id: 'news', title: 'Newsletters', value: 'Newsletters', type: 'label' as const }],
        rules: [{ tabId: 'news', action: 'moveToLabel', daysOld: 30, enabled: true, targetLabel: '' }],
        rev: 4,
    };

    let alertSpy: jest.SpyInstance;
    beforeEach(() => {
        alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {});
        mockGetSettings.mockResolvedValue({ ...LABEL_SETTINGS });
        mockPatchRule.mockResolvedValue({ ...LABEL_SETTINGS, rev: 5 });
    });
    afterEach(() => alertSpy.mockRestore());

    function field<T extends HTMLElement>(selector: string): T {
        return document.querySelector(selector) as T;
    }

    function edit(selector: string, value: string): void {
        const input = field<HTMLInputElement>(selector);
        input.value = value;
        input.dispatchEvent(new Event('change', { bubbles: true }));
    }

    test('only the changed field is sent, so two debounced edits cannot undo each other', async () => {
        buildOptionsDOM();
        await loadOptionsPage();

        edit('.rule-days[data-tab-id="news"]', '14');
        edit('.rule-target-label[data-tab-id="news"]', 'Archive/Old');
        await flush(30);
        await new Promise((r) => setTimeout(r, 300));
        await flush();

        const calls = mockPatchRule.mock.calls;
        expect(calls).toContainEqual(['user@gmail.com', 'news', { daysOld: 14 }, expect.objectContaining({ tabId: 'news' })]);
        expect(calls).toContainEqual([
            'user@gmail.com',
            'news',
            { targetLabel: 'Archive/Old' },
            expect.objectContaining({ tabId: 'news' }),
        ]);
    });

    test('days are clamped to a whole number from 1 to 3650, in the field as well as in storage', async () => {
        buildOptionsDOM();
        await loadOptionsPage();

        edit('.rule-days[data-tab-id="news"]', '99999');
        expect(field<HTMLInputElement>('.rule-days[data-tab-id="news"]').value).toBe('3650');
        edit('.rule-days[data-tab-id="news"]', '0');
        expect(field<HTMLInputElement>('.rule-days[data-tab-id="news"]').value).toBe('1');
        await new Promise((r) => setTimeout(r, 300));
        await flush();

        expect(mockPatchRule).toHaveBeenCalledWith('user@gmail.com', 'news', { daysOld: 1 }, expect.anything());
        expect(field<HTMLInputElement>('.rule-days[data-tab-id="news"]').max).toBe('3650');
    });

    test('Generate commits a pending edit and re-reads storage before building the script', async () => {
        buildOptionsDOM();
        await loadOptionsPage();
        const fresh = {
            ...LABEL_SETTINGS,
            rules: [{ ...LABEL_SETTINGS.rules[0], daysOld: 21 }],
            rev: 5,
        };

        edit('.rule-days[data-tab-id="news"]', '21');
        // The edit is still inside the debounce window when the button is pressed.
        mockGetSettings.mockResolvedValue(fresh);
        document.getElementById('generate-script-btn')!.click();
        await flush(30);

        expect(mockPatchRule).toHaveBeenCalledWith('user@gmail.com', 'news', { daysOld: 21 }, expect.anything());
        expect(mockGenerateAppsScript).toHaveBeenCalled();
        const firstPatch = Math.min(...mockPatchRule.mock.invocationCallOrder);
        const firstGenerate = Math.min(...mockGenerateAppsScript.mock.invocationCallOrder);
        expect(firstPatch).toBeLessThan(firstGenerate);
        expect(mockGenerateAppsScript.mock.calls[0][1]).toEqual(fresh.rules);
    });

    test('an edit is saved to the account it was made on, even after switching account', async () => {
        mockGetAllAccounts.mockResolvedValue(['work@gmail.com', 'personal@gmail.com']);
        buildOptionsDOM();
        await loadOptionsPage();

        edit('.rule-days[data-tab-id="news"]', '9');
        const select = document.getElementById('account-select') as HTMLSelectElement;
        select.value = 'personal@gmail.com';
        select.dispatchEvent(new Event('change'));
        await flush(30);
        await new Promise((r) => setTimeout(r, 300));
        await flush();

        const accounts = mockPatchRule.mock.calls.filter((c) => c[2].daysOld === 9).map((c) => c[0]);
        expect(accounts.length).toBeGreaterThan(0);
        expect(new Set(accounts)).toEqual(new Set(['work@gmail.com']));
        // Flushed before the switch, not left to a timer.
        const firstPatch = Math.min(...mockPatchRule.mock.invocationCallOrder);
        const personalRead = mockGetSettings.mock.calls.findIndex((c) => c[0] === 'personal@gmail.com');
        expect(firstPatch).toBeLessThan(mockGetSettings.mock.invocationCallOrder[personalRead]);
    });

    test('a failed rule write is reported and the page redraws from storage', async () => {
        buildOptionsDOM();
        await loadOptionsPage();
        mockPatchRule.mockRejectedValue(new Error('Settings changed while saving'));
        const error = jest.spyOn(console, 'error').mockImplementation(() => {});
        const readsBefore = mockGetSettings.mock.calls.length;

        const toggle = field<HTMLInputElement>('.rule-enabled[data-tab-id="news"]');
        toggle.checked = false;
        toggle.dispatchEvent(new Event('change', { bubbles: true }));
        await flush(30);

        expect(alertSpy).toHaveBeenCalledWith('That change could not be saved. Please try again.');
        expect(mockGetSettings.mock.calls.length).toBeGreaterThan(readsBefore);
        error.mockRestore();
    });

    test('a full sync quota says so, and what to do', async () => {
        buildOptionsDOM();
        await loadOptionsPage();
        mockPatchRule.mockRejectedValue(new Error('QUOTA_BYTES_PER_ITEM quota exceeded'));
        const error = jest.spyOn(console, 'error').mockImplementation(() => {});

        const select = field<HTMLSelectElement>('.rule-action[data-tab-id="news"]');
        select.value = 'archive';
        select.dispatchEvent(new Event('change', { bubbles: true }));
        await flush(30);

        expect(alertSpy).toHaveBeenCalledWith(
            'Settings are full: Chrome sync allows about 8 KB per account. Remove some tabs or rules.'
        );
        error.mockRestore();
    });

    test('a category tab can carry a rule, and the row says it searches the category', async () => {
        mockGetSettings.mockResolvedValue({
            ...DEFAULT_SETTINGS,
            tabs: [{ id: 'promo', title: 'Promotions', value: '#category/promotions', type: 'hash' as const }],
            rules: [],
        });
        buildOptionsDOM();
        await loadOptionsPage();

        const row = document.querySelector('.rule-row[data-tab-id="promo"]');
        expect(row).not.toBeNull();
        expect(row!.querySelector('.rule-tab-scope')?.textContent).toBe('category:promotions');
    });
});

describe('preference write failures', () => {
    test('a failed unread toggle is reported and the toggle shows what storage holds', async () => {
        const alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {});
        const error = jest.spyOn(console, 'error').mockImplementation(() => {});
        mockGetSettings.mockResolvedValue({ ...DEFAULT_SETTINGS, showUnreadCount: false });
        buildOptionsDOM();
        await loadOptionsPage();
        mockSavePreferences.mockRejectedValueOnce(new Error('boom'));

        const checkbox = document.getElementById('pref-unread') as HTMLInputElement;
        checkbox.checked = true;
        checkbox.dispatchEvent(new Event('change'));
        await flush(30);

        expect(alertSpy).toHaveBeenCalledWith('That change could not be saved. Please try again.');
        expect(checkbox.checked).toBe(false);
        alertSpy.mockRestore();
        error.mockRestore();
    });
});

describe('following storage changes', () => {
    type Listener = (changes: Record<string, { newValue?: unknown }>, area: string) => void;
    function listeners(): Listener[] {
        return ((global as any).chrome.storage.onChanged.addListener as jest.Mock).mock.calls.map((c) => c[0]);
    }
    function emit(changes: Record<string, { newValue?: unknown }>, area = 'sync'): void {
        for (const l of listeners()) l(changes, area);
    }

    test('the first account to appear replaces "No account yet" without a reload', async () => {
        mockGetAllAccounts.mockResolvedValue([]);
        buildOptionsDOM();
        await loadOptionsPage();
        expect((document.getElementById('account-select') as HTMLSelectElement).disabled).toBe(true);

        mockGetAllAccounts.mockResolvedValue(['new@gmail.com']);
        emit({ 'account_new@gmail.com': { newValue: { ...DEFAULT_SETTINGS, rev: 1 } } });
        await flush(30);

        const select = document.getElementById('account-select') as HTMLSelectElement;
        expect(select.disabled).toBe(false);
        expect(select.value).toBe('new@gmail.com');
        expect(mockGetSettings).toHaveBeenCalledWith('new@gmail.com');
    });

    test('a change with the rev this page holds but different content still redraws', async () => {
        // Two devices offline can each bump the same rev with different edits.
        mockGetSettings.mockResolvedValue({ ...DEFAULT_SETTINGS, rev: 7 });
        buildOptionsDOM();
        await loadOptionsPage();
        const readsBefore = mockGetSettings.mock.calls.length;

        emit({
            'account_user@gmail.com': {
                newValue: {
                    ...DEFAULT_SETTINGS,
                    tabs: [...DEFAULT_SETTINGS.tabs, { id: 'x', title: 'X', type: 'label', value: 'X' }],
                    rev: 7,
                },
            },
        });
        await flush(30);

        expect(mockGetSettings.mock.calls.length).toBeGreaterThan(readsBefore);
    });

    test('an identical change, such as this page\'s own write, does not redraw', async () => {
        mockGetSettings.mockResolvedValue({ ...DEFAULT_SETTINGS, rev: 7 });
        buildOptionsDOM();
        await loadOptionsPage();
        const readsBefore = mockGetSettings.mock.calls.length;

        emit({ 'account_user@gmail.com': { newValue: { ...DEFAULT_SETTINGS, rev: 7 } } });
        await flush(30);

        expect(mockGetSettings.mock.calls.length).toBe(readsBefore);
    });
});

describe('import file checks', () => {
    test('a file over 256 KB is refused before it is read', async () => {
        const alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {});
        buildOptionsDOM();
        await loadOptionsPage();

        const realCreate = document.createElement.bind(document);
        let picker: HTMLInputElement | null = null;
        const createSpy = jest.spyOn(document, 'createElement').mockImplementation((tag: string, opts?: any) => {
            const el = realCreate(tag, opts);
            if (tag === 'input') {
                picker = el as HTMLInputElement;
                (el as HTMLInputElement).click = () => {};
            }
            return el;
        });
        const readSpy = jest.spyOn(FileReader.prototype, 'readAsText');

        document.getElementById('settings-import-btn')!.click();
        createSpy.mockRestore();
        expect(picker).not.toBeNull();
        Object.defineProperty(picker!, 'files', { value: [{ size: 300 * 1024, name: 'big.json' }] });
        picker!.dispatchEvent(new Event('change'));

        expect(alertSpy).toHaveBeenCalledWith(expect.stringContaining('File too large'));
        expect(readSpy).not.toHaveBeenCalled();
        readSpy.mockRestore();
        alertSpy.mockRestore();
    });
});
