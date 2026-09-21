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
    // A live extension context by default. Without `runtime.id` the modal
    // correctly decides this tab is orphaned and offers only a reload, which
    // is the behaviour two tests below opt into deliberately.
    (global as any).chrome = { runtime: { id: 'abcdef', sendMessage: jest.fn().mockResolvedValue({ ok: true }) } };
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

    test('an orphaned content script says so instead of showing dead controls', () => {
        // chrome.runtime.id is gone: this tab is running an older copy of the
        // extension after an update, so every control in the modal is dead.
        (global as any).chrome = { runtime: { sendMessage: jest.fn() } };
        expect((global as any).chrome.runtime.id).toBeUndefined();

        toggleSettingsModal();
        const modal = document.getElementById('gmail-tabs-settings-modal')!;

        expect(modal.textContent).toContain('Reload Gmail to continue');
        expect(modal.querySelector('#modal-reload-page')).not.toBeNull();
        // The controls that cannot work are not offered at all.
        expect(modal.querySelector('#modal-add-btn')).toBeNull();
        expect(modal.querySelector('#uninstall-btn')).toBeNull();
        // And it says the user's data is safe, because that is the first
        // thing anyone reading "reload" will worry about.
        expect(modal.textContent).toContain('untouched');
    });

    test('the notice is still dismissible', () => {
        (global as any).chrome = { runtime: {} };
        toggleSettingsModal();
        (document.querySelector('#gmail-tabs-settings-modal .close-btn') as HTMLElement).click();
        expect(document.getElementById('gmail-tabs-settings-modal')).toBeNull();
    });

    /**
     * Both routes to the options page go through the service worker. Opening
     * it from the content script with `window.open` is refused by Chrome with
     * ERR_BLOCKED_BY_CLIENT, because the navigation's initiator is
     * mail.google.com and `options.html` is not web-accessible. That is how
     * "Manage all accounts" did nothing at all from v1.2.1 to v1.5.0.
     */
    describe.each([
        ['Manage all accounts link', '#modal-manage-accounts'],
        ['header button', '#modal-open-options'],
    ])('%s', (_name, selector) => {
        test('asks the service worker to open the options page', () => {
            const sendMessage = jest.fn().mockResolvedValue({ ok: true });
            (global as any).chrome = { runtime: { id: 'abcdef', sendMessage } };
            const openSpy = jest.spyOn(window, 'open').mockImplementation(() => null);

            toggleSettingsModal();
            (document.querySelector(selector) as HTMLElement).click();

            expect(sendMessage).toHaveBeenCalledWith({ action: 'OPEN_OPTIONS_PAGE' });
            // Never directly: Chrome blocks it from a content script.
            expect(openSpy).not.toHaveBeenCalled();
            openSpy.mockRestore();
        });

        test('survives an invalidated extension context', () => {
            // sendMessage throws once the extension reloads under a still-open
            // Gmail tab. The modal must not take the page down with it.
            // Alive at open, dies before the click: the check at open time
            // cannot catch this one, so the call site has to.
            (global as any).chrome = {
                runtime: {
                    id: 'abcdef',
                    sendMessage: () => {
                        throw new Error('Extension context invalidated.');
                    },
                },
            };
            toggleSettingsModal();
            expect(() => (document.querySelector(selector) as HTMLElement).click()).not.toThrow();
        });

        test('survives the worker rejecting the message', async () => {
            const sendMessage = jest.fn().mockRejectedValue(new Error('Receiving end does not exist.'));
            (global as any).chrome = { runtime: { id: 'abcdef', sendMessage } };
            toggleSettingsModal();
            expect(() => (document.querySelector(selector) as HTMLElement).click()).not.toThrow();
            await Promise.resolve();
        });
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
