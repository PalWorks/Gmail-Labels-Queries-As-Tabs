export {};
/**
 * theme.test.ts
 *
 * Unit tests for the theme module.
 * Covers detectGmailDarkMode(), applyTheme(), and listenForSystemThemeChanges().
 */

import { detectGmailDarkMode, applyTheme, listenForSystemThemeChanges, ThemeMode } from '../src/modules/theme';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Override getComputedStyle to return a controlled backgroundColor for
 * specific elements. Falls back to empty string for all other properties.
 */
function mockComputedStyle(elementBgMap: Map<Element, string>): void {
    window.getComputedStyle = jest.fn((el: Element) => {
        const bg = elementBgMap.get(el) || '';
        return { backgroundColor: bg } as CSSStyleDeclaration;
    });
}

/** Create a mock matchMedia that reports the given dark mode preference. */
function mockMatchMedia(prefersDark: boolean): jest.Mock {
    const listeners: Array<(e: { matches: boolean }) => void> = [];
    const mql = {
        matches: prefersDark,
        addEventListener: jest.fn((_event: string, cb: (e: { matches: boolean }) => void) => {
            listeners.push(cb);
        }),
        removeEventListener: jest.fn(),
    };
    const fn = jest.fn().mockReturnValue(mql);
    Object.defineProperty(window, 'matchMedia', { value: fn, writable: true });
    return fn;
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
    document.body.className = '';
    document.body.innerHTML = '';
});

// ---------------------------------------------------------------------------
// detectGmailDarkMode
// ---------------------------------------------------------------------------

describe('detectGmailDarkMode', () => {
    test('returns true for standard Gmail dark body background', () => {
        const map = new Map<Element, string>();
        map.set(document.body, 'rgb(32, 33, 36)');
        map.set(document.documentElement, '');
        mockComputedStyle(map);
        mockMatchMedia(false);

        expect(detectGmailDarkMode()).toBe(true);
    });

    test('returns true for alternate dark background', () => {
        const map = new Map<Element, string>();
        map.set(document.body, 'rgb(26, 26, 26)');
        map.set(document.documentElement, '');
        mockComputedStyle(map);
        mockMatchMedia(false);

        expect(detectGmailDarkMode()).toBe(true);
    });

    test('returns true when html element has dark background', () => {
        const map = new Map<Element, string>();
        map.set(document.body, 'rgb(255, 255, 255)');
        map.set(document.documentElement, 'rgb(41, 42, 45)');
        mockComputedStyle(map);
        mockMatchMedia(false);

        expect(detectGmailDarkMode()).toBe(true);
    });

    test('returns true when .nH content area has dark background', () => {
        const nH = document.createElement('div');
        nH.className = 'nH';
        document.body.appendChild(nH);

        const map = new Map<Element, string>();
        map.set(document.body, 'rgb(255, 255, 255)');
        map.set(document.documentElement, 'rgb(255, 255, 255)');
        map.set(nH, 'rgb(32, 33, 36)');
        mockComputedStyle(map);
        mockMatchMedia(false);

        expect(detectGmailDarkMode()).toBe(true);
    });

    test('returns true for arbitrary dark rgb via luminance fallback', () => {
        const map = new Map<Element, string>();
        map.set(document.body, 'rgb(20, 20, 20)');
        map.set(document.documentElement, 'rgb(255, 255, 255)');
        mockComputedStyle(map);
        mockMatchMedia(false);

        expect(detectGmailDarkMode()).toBe(true);
    });

    test('returns false for white/light background', () => {
        const map = new Map<Element, string>();
        map.set(document.body, 'rgb(255, 255, 255)');
        map.set(document.documentElement, 'rgb(255, 255, 255)');
        mockComputedStyle(map);
        mockMatchMedia(false);

        expect(detectGmailDarkMode()).toBe(false);
    });

    test('falls back to OS media query when background is unparseable', () => {
        const map = new Map<Element, string>();
        map.set(document.body, 'transparent');
        map.set(document.documentElement, 'transparent');
        mockComputedStyle(map);
        mockMatchMedia(true);

        expect(detectGmailDarkMode()).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// applyTheme
// ---------------------------------------------------------------------------

describe('applyTheme', () => {
    test('dark mode adds force-dark class', () => {
        // Need getComputedStyle for system detection path (not reached for 'dark')
        mockMatchMedia(false);
        applyTheme('dark');

        expect(document.body.classList.contains('force-dark')).toBe(true);
        expect(document.body.classList.contains('force-light')).toBe(false);
    });

    test('light mode adds force-light class', () => {
        mockMatchMedia(false);
        applyTheme('light');

        expect(document.body.classList.contains('force-light')).toBe(true);
        expect(document.body.classList.contains('force-dark')).toBe(false);
    });

    test('system mode detects dark and adds force-dark', () => {
        const map = new Map<Element, string>();
        map.set(document.body, 'rgb(32, 33, 36)');
        map.set(document.documentElement, '');
        mockComputedStyle(map);
        mockMatchMedia(false);

        applyTheme('system');

        expect(document.body.classList.contains('force-dark')).toBe(true);
    });

    test('system mode detects light and adds force-light', () => {
        const map = new Map<Element, string>();
        map.set(document.body, 'rgb(255, 255, 255)');
        map.set(document.documentElement, 'rgb(255, 255, 255)');
        mockComputedStyle(map);
        mockMatchMedia(false);

        applyTheme('system');

        expect(document.body.classList.contains('force-light')).toBe(true);
    });

    test('switching themes removes previous class', () => {
        mockMatchMedia(false);

        applyTheme('dark');
        expect(document.body.classList.contains('force-dark')).toBe(true);

        applyTheme('light');
        expect(document.body.classList.contains('force-dark')).toBe(false);
        expect(document.body.classList.contains('force-light')).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// listenForSystemThemeChanges
// ---------------------------------------------------------------------------

describe('listenForSystemThemeChanges', () => {
    test('registers a media query change listener', () => {
        const listeners: Array<(e: { matches: boolean }) => void> = [];
        const mql = {
            matches: false,
            addEventListener: jest.fn((_event: string, cb: (e: { matches: boolean }) => void) => {
                listeners.push(cb);
            }),
            removeEventListener: jest.fn(),
        };
        Object.defineProperty(window, 'matchMedia', {
            value: jest.fn().mockReturnValue(mql),
            writable: true,
        });

        const currentTheme: ThemeMode = 'system';
        listenForSystemThemeChanges(() => currentTheme);

        expect(mql.addEventListener).toHaveBeenCalledWith('change', expect.any(Function));
    });
});
