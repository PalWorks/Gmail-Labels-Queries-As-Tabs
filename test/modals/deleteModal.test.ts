/**
 * deleteModal.test.ts
 *
 * Unit tests for the Delete Modal.
 */

import { showDeleteModal } from '../../src/modules/modals/deleteModal';
import { Tab } from '../../src/utils/storage';

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
    removeTab: jest.fn().mockResolvedValue(undefined),
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

const sampleTab: Tab = {
    id: 'tab-1',
    title: 'Work',
    type: 'label',
    value: 'Work',
};

describe('showDeleteModal', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        jest.clearAllMocks();
    });

    it('should append modal to document body', () => {
        showDeleteModal(sampleTab);

        const modal = document.querySelector('.gmail-tabs-modal');
        expect(modal).not.toBeNull();
        expect(document.body.contains(modal)).toBe(true);
    });

    it('should display "Remove Tab?" header', () => {
        showDeleteModal(sampleTab);

        const h3 = document.querySelector('.gmail-tabs-modal h3');
        expect(h3?.textContent).toBe('Remove Tab?');
    });

    it('should display tab title in confirmation message', () => {
        showDeleteModal(sampleTab);

        const strong = document.querySelector('.gmail-tabs-modal strong');
        expect(strong?.textContent).toContain('Work');
    });

    it('should remove modal when Cancel button clicked', () => {
        showDeleteModal(sampleTab);

        const cancelBtn = document.querySelector('.close-btn-action') as HTMLElement;
        cancelBtn.click();

        expect(document.querySelector('.gmail-tabs-modal')).toBeNull();
    });

    it('should remove modal when Escape is pressed', () => {
        showDeleteModal(sampleTab);

        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

        expect(document.querySelector('.gmail-tabs-modal')).toBeNull();
    });

    it('should remove modal when clicking overlay backdrop', () => {
        showDeleteModal(sampleTab);

        const modal = document.querySelector('.gmail-tabs-modal') as HTMLElement;
        modal.click();

        expect(document.querySelector('.gmail-tabs-modal')).toBeNull();
    });

    it('should call removeTab on confirm and invoke render callback', async () => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { removeTab } = require('../../src/utils/storage');

        showDeleteModal(sampleTab);

        const confirmBtn = document.querySelector('#delete-confirm-btn') as HTMLElement;
        confirmBtn.click();

        await new Promise((resolve) => setTimeout(resolve, 10));

        expect(removeTab).toHaveBeenCalledWith('test@gmail.com', 'tab-1');
        expect(mockRenderTabs).toHaveBeenCalled();
    });
});
