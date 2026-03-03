export {};
/**
 * editModal.test.ts
 *
 * Unit tests for the Edit Modal.
 */

import { showEditModal } from '../../src/modules/modals/editModal';
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
    updateTab: jest.fn().mockResolvedValue(undefined),
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

describe('showEditModal', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        jest.clearAllMocks();
    });

    it('should append modal to document body', () => {
        showEditModal(sampleTab);

        const modal = document.querySelector('.gmail-tabs-modal');
        expect(modal).not.toBeNull();
        expect(document.body.contains(modal)).toBe(true);
    });

    it('should display "Edit Tab" header', () => {
        showEditModal(sampleTab);

        const h3 = document.querySelector('.gmail-tabs-modal h3');
        expect(h3?.textContent).toBe('Edit Tab');
    });

    it('should populate value field with tab value (disabled)', () => {
        showEditModal(sampleTab);

        const inputs = document.querySelectorAll('input');
        const valueInput = inputs[0] as HTMLInputElement;
        expect(valueInput.value).toBe('Work');
        expect(valueInput.disabled).toBe(true);
    });

    it('should populate display name field with tab title', () => {
        showEditModal(sampleTab);

        const nameInput = document.querySelector('#edit-display-name') as HTMLInputElement;
        expect(nameInput.value).toBe('Work');
    });

    it('should remove modal when close button clicked', () => {
        showEditModal(sampleTab);

        const closeBtn = document.querySelector('.close-btn') as HTMLElement;
        closeBtn.click();

        expect(document.querySelector('.gmail-tabs-modal')).toBeNull();
    });

    it('should remove modal when Escape is pressed', () => {
        showEditModal(sampleTab);

        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

        expect(document.querySelector('.gmail-tabs-modal')).toBeNull();
    });

    it('should remove modal when clicking overlay backdrop', () => {
        showEditModal(sampleTab);

        const modal = document.querySelector('.gmail-tabs-modal') as HTMLElement;
        modal.click();

        expect(document.querySelector('.gmail-tabs-modal')).toBeNull();
    });

    it('should call updateTab on save and invoke render callback', async () => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { updateTab } = require('../../src/utils/storage');

        showEditModal(sampleTab);

        const nameInput = document.querySelector('#edit-display-name') as HTMLInputElement;
        nameInput.value = 'Updated Work';

        const saveBtn = document.querySelector('#edit-save-btn') as HTMLElement;
        saveBtn.click();

        await new Promise((resolve) => setTimeout(resolve, 10));

        expect(updateTab).toHaveBeenCalledWith('test@gmail.com', 'tab-1', {
            title: 'Updated Work',
        });
        expect(mockRenderTabs).toHaveBeenCalled();
    });
});
