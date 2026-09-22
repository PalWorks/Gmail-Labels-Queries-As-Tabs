export {};
/**
 * welcome.test.ts
 *
 * The standalone onboarding page.
 *
 * It is a thin host now: it mounts the shared wizard and differs from the
 * in-Gmail modal in exactly two ways, so those two are what this file covers.
 * The wizard's own behaviour lives in wizardView.test.ts and is not repeated
 * here.
 */

const mockStorageGet = jest.fn();
const mockStorageSet = jest.fn();
const mockTabsQuery = jest.fn();
const mockTabsCreate = jest.fn();
const mockTabsUpdate = jest.fn();
const mockTabsReload = jest.fn();

beforeAll(() => {
    (global as any).chrome = {
        // Theme is a browser-wide preference in chrome.storage.local.
        storage: { local: { get: mockStorageGet, set: mockStorageSet } },
        runtime: { id: 'abcdef', lastError: null },
        tabs: {
            query: mockTabsQuery,
            create: mockTabsCreate,
            update: mockTabsUpdate,
            reload: mockTabsReload,
        },
    };
});

function setupWelcomeDOM(): void {
    document.body.innerHTML = '<main id="welcome-stage"></main>';
}

function loadWelcome(): void {
    jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require('../src/welcome');
    });
    document.dispatchEvent(new Event('DOMContentLoaded'));
}

/** Let the two storage reads the page makes on open settle. */
async function settle(): Promise<void> {
    for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0));
}

beforeEach(() => {
    jest.clearAllMocks();
    document.documentElement.removeAttribute('data-theme');
    mockStorageGet.mockImplementation((_keys: any, cb: any) => cb({ globalTheme: 'light' }));
    mockStorageSet.mockImplementation((_items: any, cb?: any) => cb?.());
    setupWelcomeDOM();
});

describe('the welcome page mounts the shared wizard', () => {
    test('the tour is on the page, not a second copy of the copy', async () => {
        loadWelcome();
        await settle();

        const wizard = document.querySelector('#welcome-stage .glt-ob');
        expect(wizard).not.toBeNull();
        expect(wizard!.querySelector('.glt-ob-title')?.textContent).toBe('Your labels, across the top');
    });

    test('it starts on the first slide', async () => {
        loadWelcome();
        await settle();

        expect(document.querySelector('.glt-ob-step')?.textContent).toBe('Step 1 of 6');
    });

    test('there is no dismiss control, because this page is the whole experience', async () => {
        // An X here would leave the user on an empty tab.
        loadWelcome();
        await settle();

        expect(document.querySelector('.glt-ob-close')).toBeNull();
    });
});

describe('theme, which this page applies to itself', () => {
    test('opens on the saved theme', async () => {
        mockStorageGet.mockImplementation((_keys: any, cb: any) => cb({ globalTheme: 'dark' }));

        loadWelcome();
        await settle();

        expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    });

    test("'system' resolves to the theme Gmail last reported, not the OS", async () => {
        // The page has no Gmail DOM to sample, so it mirrors what a content
        // script published. Removing the attribute instead would hand the
        // decision to welcome.css's prefers-color-scheme block, which is the
        // operating system again — the bug this replaced.
        mockStorageGet.mockImplementation((keys: any, cb: any) => {
            const key = Array.isArray(keys) ? keys[0] : keys;
            cb(key === 'detectedGmailTheme' ? { detectedGmailTheme: 'light' } : { globalTheme: 'system' });
        });

        loadWelcome();
        await settle();

        expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    });

    test("'system' follows Gmail into dark too", async () => {
        mockStorageGet.mockImplementation((keys: any, cb: any) => {
            const key = Array.isArray(keys) ? keys[0] : keys;
            cb(key === 'detectedGmailTheme' ? { detectedGmailTheme: 'dark' } : { globalTheme: 'system' });
        });

        loadWelcome();
        await settle();

        expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    });

    test('the OS decides only when no Gmail tab has ever reported a theme', async () => {
        const real = (window as any).matchMedia;
        (window as any).matchMedia = (q: string) => ({ matches: q.includes('dark'), media: q });
        mockStorageGet.mockImplementation((keys: any, cb: any) => {
            const key = Array.isArray(keys) ? keys[0] : keys;
            cb(key === 'detectedGmailTheme' ? {} : { globalTheme: 'system' });
        });

        loadWelcome();
        await settle();

        expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
        (window as any).matchMedia = real;
    });

    test('choosing a theme repaints the page and persists it browser-wide', async () => {
        loadWelcome();
        await settle();

        // The chooser is on the last slide.
        for (let i = 0; i < 5; i++) (document.querySelector('.glt-ob-next') as HTMLElement).click();
        const dark = document.querySelectorAll('.glt-ob-theme')[1] as HTMLElement;
        dark.click();
        await settle();

        expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
        expect(mockStorageSet).toHaveBeenCalledWith({ globalTheme: 'dark' }, expect.any(Function));
    });

    test('a failed write does not take the page down', async () => {
        const error = jest.spyOn(console, 'error').mockImplementation(() => {});
        mockStorageSet.mockImplementation(() => {
            throw new Error('storage is gone');
        });

        loadWelcome();
        await settle();
        for (let i = 0; i < 5; i++) (document.querySelector('.glt-ob-next') as HTMLElement).click();

        expect(() => (document.querySelectorAll('.glt-ob-theme')[1] as HTMLElement).click()).not.toThrow();
        await settle();
        expect(error).toHaveBeenCalled();
        error.mockRestore();
    });
});

describe('finishing the tour', () => {
    /** Walk to the last slide and press the finish button. */
    function finish(): void {
        for (let i = 0; i < 5; i++) (document.querySelector('.glt-ob-next') as HTMLElement).click();
        (document.querySelector('.glt-ob-next') as HTMLElement).click();
    }

    test('the final button says what happens next', async () => {
        loadWelcome();
        await settle();
        for (let i = 0; i < 5; i++) (document.querySelector('.glt-ob-next') as HTMLElement).click();

        expect(document.querySelector('.glt-ob-next')?.textContent).toBe('Start using with Gmail');
    });

    test('focuses an existing Gmail tab and reloads it', async () => {
        // Reloaded because that tab may predate the install and so be running
        // no content script: arriving at a Gmail with no tab bar, straight
        // after a tour promising one, is the worst possible first impression.
        mockTabsQuery.mockImplementation((_q: any, cb: any) => cb([{ id: 5 }]));

        loadWelcome();
        await settle();
        finish();

        expect(mockTabsUpdate).toHaveBeenCalledWith(5, { active: true });
        expect(mockTabsReload).toHaveBeenCalledWith(5);
        expect(mockTabsCreate).not.toHaveBeenCalled();
    });

    test('opens Gmail when none is open', async () => {
        mockTabsQuery.mockImplementation((_q: any, cb: any) => cb([]));

        loadWelcome();
        await settle();
        finish();

        expect(mockTabsCreate).toHaveBeenCalledWith({ url: 'https://mail.google.com/' });
    });
});
