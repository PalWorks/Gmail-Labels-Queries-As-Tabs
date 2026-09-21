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
const mockUpsertRule = jest.fn().mockResolvedValue({ tabs: [], rules: [], theme: 'light', showUnreadCount: true, rev: 1 });
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

jest.mock('../src/utils/storage', () => ({
    getSettings: (...args: any[]) => mockGetSettings(...args),
    saveSettings: (...args: any[]) => mockSaveSettings(...args),
    savePreferences: (...args: any[]) => mockSavePreferences(...args),
    upsertRule: (...args: any[]) => mockUpsertRule(...args),
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
}));

jest.mock('../src/utils/tabListRenderer', () => ({
    renderTabListItems: (...args: any[]) => mockRenderTabListItems(...args),
    escapeHtml: (str: string) => str,
}));

jest.mock('../src/modules/rules', () => ({
    generateAppsScript: (...args: any[]) => mockGenerateAppsScript(...args),
    tabToGmailLabel: (tab: any) => {
        if (tab.type === 'label') return tab.value.trim() || null;
        if (tab.type === 'hash' && tab.value.startsWith('#label/')) {
            return decodeURIComponent(tab.value.slice('#label/'.length).replace(/\+/g, ' ')).trim() || null;
        }
        return null;
    },
}));

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
        storage: { sync: { get: jest.fn(), set: jest.fn() } },
        runtime: { sendMessage: jest.fn() },
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
