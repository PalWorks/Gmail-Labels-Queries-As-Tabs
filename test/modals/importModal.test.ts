export {};
/**
 * importModal.test.ts
 *
 * Unit tests for the Import Modal and exportSettings.
 */

import { showImportModal, exportSettings } from '../../src/modules/modals/importModal';

// Mock chrome APIs
const mockChrome = {
    storage: {
        sync: {
            get: jest.fn(),
            set: jest.fn(),
        },
    },
    runtime: {
        sendMessage: jest.fn(),
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
    updateTabOrder: jest.fn().mockResolvedValue(undefined),
}));

// Mock importExport
jest.mock('../../src/utils/importExport', () => ({
    buildExportPayload: jest.fn().mockReturnValue({ version: 1, tabs: [] }),
    generateExportFilename: jest.fn().mockReturnValue('GmailTabs_test.json'),
    validateImportData: jest.fn(),
    triggerDownload: jest.fn().mockResolvedValue({ success: true, downloadId: 42 }),
}));

// Mock barrel getRenderCallback
const mockRenderTabs = jest.fn();
jest.mock('../../src/modules/modals/index', () => ({
    getRenderCallback: () => mockRenderTabs,
}));

describe('showImportModal', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        jest.clearAllMocks();
    });

    it('should append modal to document body', () => {
        showImportModal();

        const modal = document.querySelector('.gmail-tabs-modal');
        expect(modal).not.toBeNull();
    });

    it('should display "Import Configuration" header', () => {
        showImportModal();

        const h3 = document.querySelector('.gmail-tabs-modal h3');
        expect(h3?.textContent).toBe('Import Configuration');
    });

    it('should contain textarea for JSON input', () => {
        showImportModal();

        const textarea = document.querySelector('#import-json') as HTMLTextAreaElement;
        expect(textarea).not.toBeNull();
    });

    it('should contain file input for JSON upload', () => {
        showImportModal();

        const fileInput = document.querySelector('#import-file') as HTMLInputElement;
        expect(fileInput).not.toBeNull();
        expect(fileInput.accept).toBe('.json');
    });

    it('should remove modal when close button clicked', () => {
        showImportModal();

        const closeBtn = document.querySelector('.close-btn') as HTMLElement;
        closeBtn.click();

        expect(document.querySelector('.gmail-tabs-modal')).toBeNull();
    });

    it('should remove modal when Cancel button clicked', () => {
        showImportModal();

        const cancelBtn = document.querySelector('.close-btn-action') as HTMLElement;
        cancelBtn.click();

        expect(document.querySelector('.gmail-tabs-modal')).toBeNull();
    });

    it('should remove modal when Escape is pressed', () => {
        showImportModal();

        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

        expect(document.querySelector('.gmail-tabs-modal')).toBeNull();
    });

    it('should alert when import clicked with empty textarea', () => {
        const alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => { });

        showImportModal();

        const importBtn = document.querySelector('#import-confirm-btn') as HTMLElement;
        importBtn.click();

        expect(alertSpy).toHaveBeenCalledWith('Please select a file or paste configuration JSON.');
        alertSpy.mockRestore();
    });
});

describe('exportSettings', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should call triggerDownload with correct filename and payload', async () => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { triggerDownload, buildExportPayload, generateExportFilename } = require('../../src/utils/importExport');

        await exportSettings();

        expect(buildExportPayload).toHaveBeenCalledWith(
            'test@gmail.com',
            [{ id: '1', title: 'Inbox', type: 'hash', value: '#inbox' }]
        );
        expect(generateExportFilename).toHaveBeenCalledWith('test@gmail.com');
        expect(triggerDownload).toHaveBeenCalled();
    });

    it('should alert if no current user email', async () => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const stateModule = require('../../src/modules/state');
        const originalEmail = stateModule.state.currentUserEmail;
        stateModule.state.currentUserEmail = null;

        const alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => { });

        await exportSettings();

        expect(alertSpy).toHaveBeenCalledWith('Error: Could not detect user email.');
        alertSpy.mockRestore();
        stateModule.state.currentUserEmail = originalEmail;
    });
});
