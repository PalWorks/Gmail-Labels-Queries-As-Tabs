/**
 * uninstallModal.test.ts
 *
 * Unit tests for the Uninstall Modal.
 */

import { showUninstallModal } from '../../src/modules/modals/uninstallModal';
import { flush } from '../helpers/async';

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
        // A live context. Without this the modal correctly refuses to act,
        // which is what the orphaned-tab tests at the end of this file assert.
        id: 'abcdefghijklmnop',
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
        mockChrome.runtime.id = 'abcdefghijklmnop';
        mockSendMessage.mockReturnValue(undefined);
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
        expect(document.querySelector('.gmail-tabs-modal')).toBeNull();
    });

    it('should export then uninstall when Yes clicked', async () => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { triggerDownload } = require('../../src/utils/importExport');

        showUninstallModal();

        const yesBtn = document.querySelector('#uninstall-yes-btn') as HTMLElement;
        yesBtn.click();

        await flush();

        expect(triggerDownload).toHaveBeenCalled();
        expect(mockSendMessage).toHaveBeenCalledWith({ action: 'UNINSTALL_SELF' });
    });

    // -----------------------------------------------------------------------
    // Orphaned tab
    //
    // Chrome does not reload a page when it updates the extension running in
    // it. Until v1.5.0 the click here removed the dialog and sent a message
    // into a dead context, which looks exactly like an uninstall that worked.
    // -----------------------------------------------------------------------

    describe('when the extension context has been invalidated', () => {
        it('does not pretend the uninstall request was sent', () => {
            showUninstallModal();
            mockChrome.runtime.id = undefined as any;

            (document.querySelector('#uninstall-no-btn') as HTMLElement).click();

            expect(mockSendMessage).not.toHaveBeenCalled();
            // The dialog must not disappear, because nothing happened.
            expect(document.querySelector('.gmail-tabs-modal')).not.toBeNull();
        });

        it('says what went wrong and offers the one thing that fixes it', () => {
            showUninstallModal();
            mockChrome.runtime.id = undefined as any;

            (document.querySelector('#uninstall-no-btn') as HTMLElement).click();

            expect(document.querySelector('.gmail-tabs-modal h3')?.textContent).toBe('Reload Gmail to continue');
            expect(document.querySelector('#modal-reload-page')).not.toBeNull();
        });

        it('reports a context that dies between the check and the reply', async () => {
            showUninstallModal();
            mockSendMessage.mockReturnValue(Promise.reject(new Error('Extension context invalidated.')));

            (document.querySelector('#uninstall-no-btn') as HTMLElement).click();
            await flush();

            // close() ran on the optimistic path, so the notice has nowhere to
            // render; what matters is that the rejection was handled and not
            // left to surface as an unhandled promise.
            expect(mockSendMessage).toHaveBeenCalledWith({ action: 'UNINSTALL_SELF' });
        });

        it('a real failure is not dressed up as a dead context', () => {
            const error = jest.spyOn(console, 'error').mockImplementation(() => {});
            showUninstallModal();
            mockSendMessage.mockImplementation(() => {
                throw new Error('something else entirely');
            });

            (document.querySelector('#uninstall-no-btn') as HTMLElement).click();

            expect(document.querySelector('.gmail-tabs-modal h3')?.textContent).toBe('Uninstall Extension?');
            expect(error).toHaveBeenCalled();
            error.mockRestore();
        });
    });
});
