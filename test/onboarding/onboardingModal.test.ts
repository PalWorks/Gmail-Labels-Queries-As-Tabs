export {};
/**
 * onboardingModal.test.ts
 *
 * The tour as it appears over Gmail. This file covers the surround only: the
 * wizard's own behaviour is in wizardView.test.ts.
 */

const mockApplyTheme = jest.fn();
jest.mock('../../src/modules/theme', () => ({ applyTheme: (t: string) => mockApplyTheme(t) }));

const mockGetGlobalTheme = jest.fn().mockResolvedValue('light');
const mockSetGlobalTheme = jest.fn().mockResolvedValue(undefined);
jest.mock('../../src/utils/storage', () => ({
    getGlobalTheme: () => mockGetGlobalTheme(),
    setGlobalTheme: (t: string) => mockSetGlobalTheme(t),
}));

import {
    showOnboarding,
    hideOnboarding,
    isOnboardingOpen,
    ONBOARDING_MODAL_ID,
} from '../../src/modules/onboarding/onboardingModal';

async function settle(): Promise<void> {
    for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0));
}

beforeEach(() => {
    document.body.innerHTML = '';
    jest.clearAllMocks();
    mockGetGlobalTheme.mockResolvedValue('light');
    mockSetGlobalTheme.mockResolvedValue(undefined);
    (global as any).chrome = { runtime: { id: 'abcdef' } };
});

afterEach(() => hideOnboarding());

describe('showing the tour', () => {
    test('mounts the wizard inside a scrim', () => {
        showOnboarding();

        const scrim = document.getElementById(ONBOARDING_MODAL_ID);
        expect(scrim).not.toBeNull();
        expect(scrim!.querySelector('.glt-ob')).not.toBeNull();
        expect(isOnboardingOpen()).toBe(true);
    });

    test('offers a dismiss control, unlike the standalone page', () => {
        showOnboarding();
        expect(document.querySelector('.glt-ob-close')).not.toBeNull();
    });

    test('a second trigger restarts it rather than stacking a second copy', () => {
        // "Show me around" while the tour is already open means "again".
        showOnboarding();
        (document.querySelector('.glt-ob-next') as HTMLElement).click();
        expect(document.querySelector('.glt-ob-step')?.textContent).toBe('Step 2 of 6');

        showOnboarding();

        expect(document.querySelectorAll('.glt-ob').length).toBe(1);
        expect(document.querySelector('.glt-ob-step')?.textContent).toBe('Step 1 of 6');
    });
});

describe('dismissing', () => {
    test('Escape closes it', () => {
        showOnboarding();
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        expect(isOnboardingOpen()).toBe(false);
    });

    test('clicking the backdrop closes it', () => {
        showOnboarding();
        (document.getElementById(ONBOARDING_MODAL_ID) as HTMLElement).click();
        expect(isOnboardingOpen()).toBe(false);
    });

    test('clicking inside the panel does not', () => {
        showOnboarding();
        (document.querySelector('.glt-ob') as HTMLElement).click();
        expect(isOnboardingOpen()).toBe(true);
    });

    test('the close control closes it', () => {
        showOnboarding();
        (document.querySelector('.glt-ob-close') as HTMLElement).click();
        expect(isOnboardingOpen()).toBe(false);
    });

    test('finishing closes it', () => {
        showOnboarding();
        for (let i = 0; i < 5; i++) (document.querySelector('.glt-ob-next') as HTMLElement).click();
        (document.querySelector('.glt-ob-next') as HTMLElement).click();
        expect(isOnboardingOpen()).toBe(false);
    });

    test('Escape stops working once it is closed', () => {
        // The keydown listener is on document, so failing to remove it leaks
        // one per tour shown.
        showOnboarding();
        (document.querySelector('.glt-ob-close') as HTMLElement).click();
        expect(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))).not.toThrow();
        expect(isOnboardingOpen()).toBe(false);
    });
});

describe('theme, which reaches the real tab bar', () => {
    test('a choice is applied to this Gmail page and saved browser-wide', async () => {
        // Saving through setGlobalTheme is what retints every other open Gmail
        // tab: they are all listening on that storage key already.
        showOnboarding();
        for (let i = 0; i < 5; i++) (document.querySelector('.glt-ob-next') as HTMLElement).click();

        (document.querySelectorAll('.glt-ob-theme')[1] as HTMLElement).click();
        await settle();

        expect(mockApplyTheme).toHaveBeenCalledWith('dark');
        expect(mockSetGlobalTheme).toHaveBeenCalledWith('dark');
    });
});

describe('when the extension context has been invalidated', () => {
    test('says so instead of offering a tour that cannot save anything', () => {
        (global as any).chrome = { runtime: {} };

        showOnboarding();

        expect(document.querySelector('.glt-ob h3')?.textContent).toBe('Reload Gmail to continue');
        expect(document.querySelector('#modal-reload-page')).not.toBeNull();
    });

    test('and can still be dismissed, rather than trapping the user', () => {
        // The check runs after the panel is mounted precisely so this works.
        (global as any).chrome = { runtime: {} };
        showOnboarding();

        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

        expect(isOnboardingOpen()).toBe(false);
    });

    test('a context that dies mid-tour is reported on the next save', async () => {
        showOnboarding();
        mockSetGlobalTheme.mockRejectedValue(new Error('Extension context invalidated.'));
        for (let i = 0; i < 5; i++) (document.querySelector('.glt-ob-next') as HTMLElement).click();

        (document.querySelectorAll('.glt-ob-theme')[1] as HTMLElement).click();
        await settle();

        expect(document.querySelector('.glt-ob h3')?.textContent).toBe('Reload Gmail to continue');
    });

    test('a real failure is not dressed up as a dead context', async () => {
        const error = jest.spyOn(console, 'error').mockImplementation(() => {});
        showOnboarding();
        mockSetGlobalTheme.mockRejectedValue(new Error('something else entirely'));
        for (let i = 0; i < 5; i++) (document.querySelector('.glt-ob-next') as HTMLElement).click();

        (document.querySelectorAll('.glt-ob-theme')[1] as HTMLElement).click();
        await settle();

        expect(document.querySelector('.glt-ob-title')?.textContent).toBe('Pick your look');
        expect(error).toHaveBeenCalled();
        error.mockRestore();
    });
});
