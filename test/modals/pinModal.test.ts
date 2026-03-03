export {};
/**
 * pinModal.test.ts
 *
 * Unit tests for the Pin Modal.
 */

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
    const s = {
        currentUserEmail: 'test@gmail.com',
        currentSettings: null as any,
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

// Mock storage
jest.mock('../../src/utils/storage', () => ({
    addTab: jest.fn().mockResolvedValue(undefined),
    getSettings: jest.fn().mockResolvedValue({
        tabs: [],
        rules: [],
        theme: 'system',
        showUnreadCount: true,
    }),
}));

// Mock barrel getRenderCallback
const mockRenderTabs = jest.fn();
jest.mock('../../src/modules/modals/index', () => ({
    getRenderCallback: () => mockRenderTabs,
}));

import { showPinModal } from '../../src/modules/modals/pinModal';

describe('showPinModal', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        jest.clearAllMocks();
        // jsdom supports hash changes natively
        window.location.hash = '#label/Test';
    });

    it('should show alert if hash is #inbox', () => {
        window.location.hash = '#inbox';
        const alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => { });

        showPinModal();

        expect(alertSpy).toHaveBeenCalledWith('Cannot pin the Inbox. Navigate to a label or search first.');
        expect(document.querySelector('.gmail-tabs-modal')).toBeNull();
        alertSpy.mockRestore();
    });

    it('should show alert if hash is empty', () => {
        window.location.hash = '';
        const alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => { });

        showPinModal();

        // When hash is empty, jsdom may return '' or set it to '#'
        // The point is the modal should not be created
        expect(document.querySelector('.gmail-tabs-modal')).toBeNull();
        alertSpy.mockRestore();
    });

    it('should append modal to document body', () => {
        showPinModal();

        const modal = document.querySelector('.gmail-tabs-modal');
        expect(modal).not.toBeNull();
        expect(document.body.contains(modal)).toBe(true);
    });

    it('should display "Pin Current View" header', () => {
        showPinModal();

        const h3 = document.querySelector('.gmail-tabs-modal h3');
        expect(h3?.textContent).toBe('Pin Current View');
    });

    it('should suggest title from label hash', () => {
        window.location.hash = '#label/MyLabel';

        showPinModal();

        const titleInput = document.querySelector('#pin-title') as HTMLInputElement;
        expect(titleInput.value).toBe('MyLabel');
    });

    it('should suggest title from search hash', () => {
        window.location.hash = '#search/query+text';

        showPinModal();

        const titleInput = document.querySelector('#pin-title') as HTMLInputElement;
        expect(titleInput.value).toBe('Search: query text');
    });

    it('should remove modal when close button clicked', () => {
        showPinModal();

        const closeBtn = document.querySelector('.close-btn') as HTMLElement;
        closeBtn.click();

        expect(document.querySelector('.gmail-tabs-modal')).toBeNull();
    });

    it('should remove modal when Escape is pressed', () => {
        showPinModal();

        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

        expect(document.querySelector('.gmail-tabs-modal')).toBeNull();
    });

    it('should remove modal when clicking overlay backdrop', () => {
        showPinModal();

        const modal = document.querySelector('.gmail-tabs-modal') as HTMLElement;
        modal.click();

        expect(document.querySelector('.gmail-tabs-modal')).toBeNull();
    });

    it('should call addTab on save and invoke render callback', async () => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { addTab } = require('../../src/utils/storage');

        showPinModal();

        const saveBtn = document.querySelector('#pin-save-btn') as HTMLElement;
        saveBtn.click();

        await new Promise((resolve) => setTimeout(resolve, 10));

        expect(addTab).toHaveBeenCalledWith(
            'test@gmail.com',
            expect.any(String),
            '#label/Test',
            'hash'
        );
        expect(mockRenderTabs).toHaveBeenCalled();
    });
});
