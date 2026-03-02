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
const mockAddTab = jest.fn().mockResolvedValue(undefined);
const mockRemoveTab = jest.fn().mockResolvedValue(undefined);
const mockUpdateTabOrder = jest.fn().mockResolvedValue(undefined);
const mockApplyTheme = jest.fn();

jest.mock('../src/utils/storage', () => ({
    getSettings: (...args: any[]) => mockGetSettings(...args),
    saveSettings: (...args: any[]) => mockSaveSettings(...args),
    addTab: (...args: any[]) => mockAddTab(...args),
    removeTab: (...args: any[]) => mockRemoveTab(...args),
    updateTabOrder: (...args: any[]) => mockUpdateTabOrder(...args),
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
