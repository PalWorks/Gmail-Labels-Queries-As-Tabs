export {};
/**
 * settingsModal.test.ts
 *
 * Unit tests for the settings modal.
 * Tests toggleSettingsModal, modal structure, close behavior,
 * theme button UI, and account email display.
 */

// ---------------------------------------------------------------------------
// Mock dependencies (paths relative to the test file)
// ---------------------------------------------------------------------------

const mockGetSettings = jest.fn().mockResolvedValue({
    tabs: [{ id: '1', title: 'Inbox', value: '#inbox', type: 'hash' }],
    showUnreadCount: false,
    theme: 'system',
    rules: [],
});
const mockSaveSettings = jest.fn().mockResolvedValue(undefined);
const mockSavePreferences = jest.fn().mockResolvedValue({ tabs: [], rules: [], theme: 'light', showUnreadCount: true, rev: 1 });
const mockAddTab = jest.fn().mockResolvedValue(undefined);
const mockRemoveTab = jest.fn().mockResolvedValue(undefined);
const mockUpdateTabOrder = jest.fn().mockResolvedValue(undefined);
const mockGetGlobalTheme = jest.fn().mockResolvedValue('system');
const mockSetGlobalTheme = jest.fn().mockResolvedValue(undefined);
const mockApplyTheme = jest.fn();

jest.mock('../src/utils/storage', () => ({
    getSettings: (...args: any[]) => mockGetSettings(...args),
    saveSettings: (...args: any[]) => mockSaveSettings(...args),
    savePreferences: (...args: any[]) => mockSavePreferences(...args),
    addTab: (...args: any[]) => mockAddTab(...args),
    removeTab: (...args: any[]) => mockRemoveTab(...args),
    updateTabOrder: (...args: any[]) => mockUpdateTabOrder(...args),
    getGlobalTheme: (...args: any[]) => mockGetGlobalTheme(...args),
    setGlobalTheme: (...args: any[]) => mockSetGlobalTheme(...args),
}));

jest.mock('../src/utils/tabListRenderer', () => ({
    renderTabListItems: jest.fn(),
}));

jest.mock('../src/modules/state', () => {
    const s = {
        currentSettings: {
            tabs: [{ id: '1', title: 'Inbox', value: '#inbox', type: 'hash' }],
            showUnreadCount: false,
            theme: 'system',
            rules: [],
        },
        currentUserEmail: 'user@gmail.com',
    };
    return {
        state: s,
        MODAL_ID: 'gmail-tabs-settings-modal',
        getAppSettings: () => s.currentSettings,
        setAppSettings: (v: any) => { s.currentSettings = v; },
        getUserEmail: () => s.currentUserEmail,
        setUserEmail: (v: any) => { s.currentUserEmail = v; },
    };
});

jest.mock('../src/modules/theme', () => ({
    applyTheme: (...args: any[]) => mockApplyTheme(...args),
}));

jest.mock('../src/modules/dragdrop', () => ({
    createModalDragHandlers: jest.fn(() => ({
        handleModalDragStart: jest.fn(),
        handleModalDragOver: jest.fn(),
        handleModalDragEnter: jest.fn(),
        handleModalDragLeave: jest.fn(),
        handleModalDrop: jest.fn(),
        handleModalDragEnd: jest.fn(),
    })),
}));

jest.mock('../src/modules/modals/index', () => ({
    getRenderCallback: jest.fn(() => jest.fn()),
}));

jest.mock('../src/modules/modals/importModal', () => ({
    exportSettings: jest.fn(),
    showImportModal: jest.fn(),
}));

jest.mock('../src/modules/modals/uninstallModal', () => ({
    showUninstallModal: jest.fn(),
}));

import { toggleSettingsModal } from '../src/modules/modals/settingsModal';

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
    document.body.innerHTML = '';
    jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('toggleSettingsModal', () => {
    test('creates modal when none exists', () => {
        toggleSettingsModal();

        const modal = document.getElementById('gmail-tabs-settings-modal');
        expect(modal).not.toBeNull();
    });

    test('creates modal with expected structure', () => {
        toggleSettingsModal();

        const modal = document.getElementById('gmail-tabs-settings-modal')!;
        expect(modal.querySelector('.modal-header')).not.toBeNull();
        expect(modal.querySelector('.close-btn')).not.toBeNull();
        expect(modal.querySelector('#modal-new-label')).not.toBeNull();
        expect(modal.querySelector('#modal-add-btn')).not.toBeNull();
        expect(modal.querySelector('#modal-labels-list')).not.toBeNull();
        expect(modal.querySelector('#modal-unread-toggle')).not.toBeNull();
    });

    test('removes existing modal when toggled again', () => {
        toggleSettingsModal();
        expect(document.getElementById('gmail-tabs-settings-modal')).not.toBeNull();

        toggleSettingsModal();
        expect(document.getElementById('gmail-tabs-settings-modal')).toBeNull();
    });

    test('displays current user email', () => {
        toggleSettingsModal();

        const emailSpan = document.querySelector('#modal-account-email');
        expect(emailSpan?.textContent).toBe('user@gmail.com');
    });

    test('has three theme selector buttons', () => {
        toggleSettingsModal();

        const themeBtns = document.querySelectorAll('.theme-btn');
        expect(themeBtns.length).toBe(3);

        const themes = Array.from(themeBtns).map((btn) => (btn as HTMLElement).dataset.theme);
        expect(themes).toEqual(['system', 'light', 'dark']);
    });

    test('closes modal on close button click', () => {
        toggleSettingsModal();
        expect(document.getElementById('gmail-tabs-settings-modal')).not.toBeNull();

        const closeBtn = document.querySelector('.close-btn') as HTMLElement;
        closeBtn.click();

        expect(document.getElementById('gmail-tabs-settings-modal')).toBeNull();
    });

    test('closes modal on Escape key', () => {
        toggleSettingsModal();
        expect(document.getElementById('gmail-tabs-settings-modal')).not.toBeNull();

        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

        expect(document.getElementById('gmail-tabs-settings-modal')).toBeNull();
    });

    test('has export, import, and uninstall buttons', () => {
        toggleSettingsModal();

        expect(document.querySelector('#export-btn')).not.toBeNull();
        expect(document.querySelector('#import-btn')).not.toBeNull();
        expect(document.querySelector('#uninstall-btn')).not.toBeNull();
    });

    test('add button is initially disabled', () => {
        toggleSettingsModal();

        const addBtn = document.querySelector('#modal-add-btn') as HTMLButtonElement;
        expect(addBtn.disabled).toBe(true);
    });
});

describe('settings modal behavior', () => {
    test('clicking a theme button persists the browser-wide theme', () => {
        toggleSettingsModal();

        const darkBtn = document.querySelector('.theme-btn[data-theme="dark"]') as HTMLElement;
        darkBtn.click();

        expect(mockSetGlobalTheme).toHaveBeenCalledWith('dark');
    });

    test('adding a label tab calls addTab with the entered value', async () => {
        toggleSettingsModal();

        const input = document.querySelector('#modal-new-label') as HTMLInputElement;
        const addBtn = document.querySelector('#modal-add-btn') as HTMLButtonElement;

        input.value = 'Work';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        expect(addBtn.disabled).toBe(false);

        addBtn.click();
        await new Promise((r) => setTimeout(r, 0));

        expect(mockAddTab).toHaveBeenCalledWith('user@gmail.com', 'Work', 'Work', 'label');
    });

    test('toggling unread checkbox persists showUnreadCount', async () => {
        toggleSettingsModal();

        const toggle = document.querySelector('#modal-unread-toggle') as HTMLInputElement;
        toggle.checked = true;
        toggle.dispatchEvent(new Event('change', { bubbles: true }));
        await new Promise((r) => setTimeout(r, 0));

        expect(mockSavePreferences).toHaveBeenCalledWith('user@gmail.com', { showUnreadCount: true });
    });

    test('Manage all accounts link opens the options page', () => {
        (global as any).chrome = { runtime: { getURL: (p: string) => `chrome-extension://id/${p}` } };
        const openSpy = jest.spyOn(window, 'open').mockImplementation(() => null);

        toggleSettingsModal();
        (document.querySelector('#modal-manage-accounts') as HTMLElement).click();

        expect(openSpy).toHaveBeenCalledWith('chrome-extension://id/options.html', '_blank');
        openSpy.mockRestore();
    });

    test('the header button opens the options page too', () => {
        (global as any).chrome = { runtime: { getURL: (p: string) => `chrome-extension://id/${p}` } };
        const openSpy = jest.spyOn(window, 'open').mockImplementation(() => null);

        toggleSettingsModal();
        (document.querySelector('#modal-open-options') as HTMLElement).click();

        expect(openSpy).toHaveBeenCalledWith('chrome-extension://id/options.html', '_blank');
        openSpy.mockRestore();
    });

    test('the header button survives an invalidated extension context', () => {
        // getURL throws once the extension reloads under a still-open Gmail
        // tab. The modal must not take the page down with it.
        (global as any).chrome = {
            runtime: {
                getURL: () => {
                    throw new Error('Extension context invalidated.');
                },
            },
        };
        toggleSettingsModal();
        expect(() => (document.querySelector('#modal-open-options') as HTMLElement).click()).not.toThrow();
    });

    test('every icon-only control in the modal is a focusable button with a label', () => {
        // An <svg> with no text is announced as nothing, and a <div> with a
        // title attribute is not reachable by keyboard at all. The footer help
        // control was exactly that until v1.5.0.
        toggleSettingsModal();
        const modal = document.getElementById('gmail-tabs-settings-modal')!;
        const iconControls = ['#modal-open-options', '#modal-help-btn'];

        for (const selector of iconControls) {
            const el = modal.querySelector(selector);
            expect(el).not.toBeNull();
            expect(el!.tagName).toBe('BUTTON');
            expect(el!.getAttribute('aria-label')).toBeTruthy();
            expect(el!.getAttribute('title')).toBeTruthy();
            // The icon itself must not be read out alongside the label.
            expect(el!.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
        }
    });
});
