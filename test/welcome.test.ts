export {};
/**
 * welcome.test.ts
 *
 * Unit tests for the welcome/onboarding page logic.
 * Tests theme radio selection, theme persistence, and Open Gmail button.
 */

// ---------------------------------------------------------------------------
// Mock chrome APIs
// ---------------------------------------------------------------------------

const mockStorageGet = jest.fn();
const mockStorageSet = jest.fn();
const mockTabsQuery = jest.fn();
const mockTabsCreate = jest.fn();
const mockTabsUpdate = jest.fn();
const mockTabsReload = jest.fn();

beforeAll(() => {
    (global as any).chrome = {
        storage: {
            sync: {
                get: mockStorageGet,
                set: mockStorageSet,
            },
        },
        tabs: {
            query: mockTabsQuery,
            create: mockTabsCreate,
            update: mockTabsUpdate,
            reload: mockTabsReload,
        },
    };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setupWelcomeDOM(): void {
    document.body.innerHTML = `
        <input type="radio" name="theme" value="system" checked>
        <input type="radio" name="theme" value="light">
        <input type="radio" name="theme" value="dark">
        <button id="open-gmail-btn">Open Gmail</button>
    `;
}

function loadWelcome(): void {
    jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require('../src/welcome');
    });
    // Fire DOMContentLoaded
    document.dispatchEvent(new Event('DOMContentLoaded'));
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
    jest.clearAllMocks();
    document.body.innerHTML = '';
    document.documentElement.removeAttribute('data-theme');

    mockStorageGet.mockImplementation((_keys: any, cb: (result: any) => void) => cb({}));
});

// ---------------------------------------------------------------------------
// Theme Logic
// ---------------------------------------------------------------------------

describe('welcome page theme', () => {
    test('loads saved theme from storage and applies it', () => {
        setupWelcomeDOM();
        mockStorageGet.mockImplementation((_keys: any, cb: (result: any) => void) =>
            cb({ theme: 'dark' })
        );

        loadWelcome();

        expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    });

    test('defaults to system theme when none saved', () => {
        setupWelcomeDOM();
        mockStorageGet.mockImplementation((_keys: any, cb: (result: any) => void) =>
            cb({})
        );

        loadWelcome();

        expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    });

    test('saves theme to storage when radio is changed', () => {
        setupWelcomeDOM();
        loadWelcome();

        const lightRadio = document.querySelector('input[value="light"]') as HTMLInputElement;
        lightRadio.checked = true;
        lightRadio.dispatchEvent(new Event('change', { bubbles: true }));

        expect(mockStorageSet).toHaveBeenCalledWith({ theme: 'light' });
        expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    });

    test('applies light theme via data-theme attribute', () => {
        setupWelcomeDOM();
        loadWelcome();

        const lightRadio = document.querySelector('input[value="light"]') as HTMLInputElement;
        lightRadio.checked = true;
        lightRadio.dispatchEvent(new Event('change', { bubbles: true }));

        expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    });
});

// ---------------------------------------------------------------------------
// Open Gmail Button
// ---------------------------------------------------------------------------

describe('welcome page Open Gmail button', () => {
    test('creates new Gmail tab when no existing tabs found', () => {
        setupWelcomeDOM();
        loadWelcome();

        mockTabsQuery.mockImplementation((_query: any, cb: any) => cb([]));

        const btn = document.getElementById('open-gmail-btn')!;
        btn.click();

        expect(mockTabsCreate).toHaveBeenCalledWith({ url: 'https://mail.google.com/' });
    });

    test('activates and reloads existing Gmail tab', () => {
        setupWelcomeDOM();
        loadWelcome();

        mockTabsQuery.mockImplementation((_query: any, cb: any) =>
            cb([{ id: 5, active: false }])
        );

        const btn = document.getElementById('open-gmail-btn')!;
        btn.click();

        expect(mockTabsUpdate).toHaveBeenCalledWith(5, { active: true });
        expect(mockTabsReload).toHaveBeenCalledWith(5);
        expect(mockTabsCreate).not.toHaveBeenCalled();
    });
});
