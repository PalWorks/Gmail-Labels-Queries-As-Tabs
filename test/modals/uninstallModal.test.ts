/**
 * uninstallModal.test.ts
 *
 * Unit tests for the Uninstall Modal.
 */

import { showUninstallModal } from '../../src/modules/modals/uninstallModal';

// Mock chrome APIs
const mockSendMessage = jest.fn();
const mockChrome = {
    storage: {
        sync: {
            get: jest.fn(),
            set: jest.fn(),
        },
    },
    runtime: {
        sendMessage: mockSendMessage,
        lastError: null as chrome.runtime.LastError | null,
    },
};
(global as any).chrome = mockChrome;

// Mock state
jest.mock('../../src/modules/state', () => {
    const s = { currentUserEmail: 'test@gmail.com', currentSettings: null as any };
    return {
        state: s,
        MODAL_ID: 'gmail-tabs-settings-modal',
        getAppSettings: () => s.currentSettings,
        setAppSettings: (v: any) => { s.currentSettings = v; },
        getUserEmail: () => s.currentUserEmail,
        setUserEmail: (v: any) => { s.currentUserEmail = v; },
    };
});

// Mock storage
jest.mock('../../src/utils/storage', () => ({
    getSettings: jest.fn().mockResolvedValue({
        tabs: [{ id: '1', title: 'Inbox', type: 'hash', value: '#inbox' }],
        rules: [],
        theme: 'system',
        showUnreadCount: true,
    }),
    getAllAccounts: jest.fn().mockResolvedValue(['test@gmail.com']),
}));

// Mock importExport
jest.mock('../../src/utils/importExport', () => ({
    buildExportPayload: jest.fn().mockReturnValue({ version: 1, tabs: [] }),
    generateExportFilename: jest.fn().mockReturnValue('GmailTabs_test.json'),
    triggerDownload: jest.fn().mockResolvedValue({ success: true }),
}));

describe('showUninstallModal', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        jest.clearAllMocks();
    });

    it('should append modal to document body', () => {
        showUninstallModal();

        const modal = document.querySelector('.gmail-tabs-modal');
        expect(modal).not.toBeNull();
    });

    it('should display "Uninstall Extension?" header', () => {
        showUninstallModal();

        const h3 = document.querySelector('.gmail-tabs-modal h3');
        expect(h3?.textContent).toBe('Uninstall Extension?');
    });

    it('should have Yes and No buttons', () => {
        showUninstallModal();

        expect(document.querySelector('#uninstall-yes-btn')).not.toBeNull();
        expect(document.querySelector('#uninstall-no-btn')).not.toBeNull();
    });

    it('should remove modal when Cancel clicked', () => {
        showUninstallModal();

        const cancelBtn = document.querySelector('.close-btn-action') as HTMLElement;
        cancelBtn.click();

        expect(document.querySelector('.gmail-tabs-modal')).toBeNull();
    });

    it('should remove modal when Escape is pressed', () => {
        showUninstallModal();

        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

        expect(document.querySelector('.gmail-tabs-modal')).toBeNull();
    });

    it('should send UNINSTALL_SELF when No clicked (skip export)', () => {
        showUninstallModal();

        const noBtn = document.querySelector('#uninstall-no-btn') as HTMLElement;
        noBtn.click();

        expect(mockSendMessage).toHaveBeenCalledWith({ action: 'UNINSTALL_SELF' });
    });

    it('should export then uninstall when Yes clicked', async () => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { triggerDownload } = require('../../src/utils/importExport');

        showUninstallModal();

        const yesBtn = document.querySelector('#uninstall-yes-btn') as HTMLElement;
        yesBtn.click();

        await new Promise((resolve) => setTimeout(resolve, 50));

        expect(triggerDownload).toHaveBeenCalled();
        expect(mockSendMessage).toHaveBeenCalledWith({ action: 'UNINSTALL_SELF' });
    });
});
