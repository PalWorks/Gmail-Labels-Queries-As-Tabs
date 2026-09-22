export {};
/**
 * theme.test.ts
 *
 * Unit tests for the theme module.
 * Covers detectGmailDarkMode(), applyTheme(), and listenForSystemThemeChanges().
 */

import { microtasks } from './helpers/async';
import {
    detectGmailDarkMode,
    detectGmailTheme,
    resolveSystemTheme,
    applyTheme,
    commitGuessedTheme,
    listenForSystemThemeChanges,
    watchGmailTheme,
    THEME_UNRESOLVED_CLASS,
    DETECTED_GMAIL_THEME_KEY,
    ThemeMode,
} from '../src/modules/theme';

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

// ---------------------------------------------------------------------------
// detectGmailTheme — Gmail's own theme wins over the OS preference
// ---------------------------------------------------------------------------

describe('detectGmailTheme', () => {
    test('reports light for a light Gmail background even when the OS is dark', () => {
        const map = new Map<Element, string>();
        // Gmail's real light surface, which is not pure white.
        map.set(document.body, 'rgb(248, 250, 253)');
        map.set(document.documentElement, 'rgba(0, 0, 0, 0)');
        mockComputedStyle(map);
        mockMatchMedia(true);

        expect(detectGmailTheme()).toBe('light');
        expect(detectGmailDarkMode()).toBe(false);
    });

    test('reports dark for a dark Gmail background even when the OS is light', () => {
        const map = new Map<Element, string>();
        map.set(document.body, 'rgb(32, 33, 36)');
        map.set(document.documentElement, 'rgba(0, 0, 0, 0)');
        mockComputedStyle(map);
        mockMatchMedia(false);

        expect(detectGmailTheme()).toBe('dark');
    });

    test('skips transparent surfaces and reads the next candidate', () => {
        const map = new Map<Element, string>();
        map.set(document.body, 'transparent');
        map.set(document.documentElement, 'rgb(26, 26, 26)');
        mockComputedStyle(map);
        mockMatchMedia(false);

        expect(detectGmailTheme()).toBe('dark');
    });

    test('returns null when nothing readable has painted yet', () => {
        const map = new Map<Element, string>();
        map.set(document.body, 'rgba(0, 0, 0, 0)');
        map.set(document.documentElement, 'transparent');
        mockComputedStyle(map);
        mockMatchMedia(true);

        expect(detectGmailTheme()).toBeNull();
    });

    test('resolveSystemTheme uses the OS only when Gmail is unreadable', () => {
        const map = new Map<Element, string>();
        map.set(document.body, 'transparent');
        map.set(document.documentElement, 'transparent');
        mockComputedStyle(map);
        mockMatchMedia(true);

        expect(resolveSystemTheme()).toBe('dark');
    });

    test('system mode follows Gmail light while the OS asks for dark', () => {
        const map = new Map<Element, string>();
        map.set(document.body, 'rgb(248, 250, 253)');
        map.set(document.documentElement, 'rgba(0, 0, 0, 0)');
        mockComputedStyle(map);
        mockMatchMedia(true);

        applyTheme('system');

        expect(document.body.classList.contains('force-light')).toBe(true);
        expect(document.body.classList.contains('force-dark')).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// An unknown theme is drawn as nothing, not as a guess
// ---------------------------------------------------------------------------

/**
 * The bug these cover, reported from a desktop set to dark reading a light
 * Gmail: the bar appeared as a black slab, settled to white a moment later,
 * and only then filled with tabs. The black was the OS answer being painted
 * during the window where Gmail had not yet drawn a background to read.
 *
 * The fix is not a faster guess. It is to stop painting one: while 'system'
 * mode has no real answer the bar carries no background at all, so what shows
 * through is the Gmail already on screen.
 */
describe('system mode while Gmail has not painted yet', () => {
    /** Gmail unreadable: every candidate surface is transparent. */
    function gmailNotPaintedYet(): Map<Element, string> {
        const map = new Map<Element, string>();
        map.set(document.body, 'transparent');
        map.set(document.documentElement, 'rgba(0, 0, 0, 0)');
        mockComputedStyle(map);
        return map;
    }

    test('marks the theme unresolved rather than painting the OS guess', () => {
        gmailNotPaintedYet();
        mockMatchMedia(true);

        applyTheme('system');

        // The guess is still applied, so the tabs are readable when they land.
        expect(document.body.classList.contains('force-dark')).toBe(true);
        // But it is marked as a guess, and the stylesheet drops the background.
        expect(document.body.classList.contains(THEME_UNRESOLVED_CLASS)).toBe(true);
    });

    test('drops the mark as soon as Gmail can actually be read', () => {
        const map = gmailNotPaintedYet();
        mockMatchMedia(true);
        applyTheme('system');
        expect(document.body.classList.contains(THEME_UNRESOLVED_CLASS)).toBe(true);

        map.set(document.body, 'rgb(248, 250, 253)');
        applyTheme('system');

        expect(document.body.classList.contains('force-light')).toBe(true);
        expect(document.body.classList.contains(THEME_UNRESOLVED_CLASS)).toBe(false);
    });

    test('an explicit theme is never a guess, and clears a stale mark', () => {
        gmailNotPaintedYet();
        mockMatchMedia(true);
        applyTheme('system');
        expect(document.body.classList.contains(THEME_UNRESOLVED_CLASS)).toBe(true);

        applyTheme('light');

        expect(document.body.classList.contains('force-light')).toBe(true);
        expect(document.body.classList.contains(THEME_UNRESOLVED_CLASS)).toBe(false);
    });

    test('commitGuessedTheme stops waiting and wears the guess', () => {
        gmailNotPaintedYet();
        mockMatchMedia(true);
        applyTheme('system');

        commitGuessedTheme();

        expect(document.body.classList.contains('force-dark')).toBe(true);
        expect(document.body.classList.contains(THEME_UNRESOLVED_CLASS)).toBe(false);
    });

    test('only a real reading is published as Gmail\'s theme', () => {
        const set = jest.fn();
        (globalThis as unknown as { chrome: unknown }).chrome = { storage: { local: { set } } };

        try {
            const map = gmailNotPaintedYet();
            mockMatchMedia(true);

            applyTheme('system');
            // A guess must not be shared as "this is Gmail's theme": the popup
            // and the welcome page fall back to the OS themselves when the key
            // is absent, and would have no way to tell a reading from a guess.
            expect(set).not.toHaveBeenCalled();

            map.set(document.body, 'rgb(32, 33, 36)');
            applyTheme('system');

            expect(set).toHaveBeenCalledWith({ [DETECTED_GMAIL_THEME_KEY]: 'dark' });
        } finally {
            delete (globalThis as unknown as { chrome?: unknown }).chrome;
        }
    });

    test('the watcher commits the guess when Gmail never becomes readable', () => {
        jest.useFakeTimers();
        gmailNotPaintedYet();
        mockMatchMedia(true);

        const stop = watchGmailTheme(() => 'system');
        applyTheme('system');
        expect(document.body.classList.contains(THEME_UNRESOLVED_CLASS)).toBe(true);

        // Halfway through the ladder there is still hope, so still no paint.
        jest.advanceTimersByTime(3000);
        expect(document.body.classList.contains(THEME_UNRESOLVED_CLASS)).toBe(true);

        // Out of chances. A bar that stays invisible looks broken, which is a
        // worse failure than a bar that is merely the wrong colour.
        jest.advanceTimersByTime(8000);
        expect(document.body.classList.contains(THEME_UNRESOLVED_CLASS)).toBe(false);
        expect(document.body.classList.contains('force-dark')).toBe(true);

        stop();
        jest.useRealTimers();
    });

    test('the watcher leaves no mark behind once Gmail paints', () => {
        jest.useFakeTimers();
        const map = gmailNotPaintedYet();
        mockMatchMedia(true);

        const stop = watchGmailTheme(() => 'system');
        applyTheme('system');
        expect(document.body.classList.contains(THEME_UNRESOLVED_CLASS)).toBe(true);

        map.set(document.body, 'rgb(255, 255, 255)');
        jest.advanceTimersByTime(300);

        expect(document.body.classList.contains('force-light')).toBe(true);
        expect(document.body.classList.contains(THEME_UNRESOLVED_CLASS)).toBe(false);

        // And the commit timer, firing later, must not undo anything.
        jest.advanceTimersByTime(11000);
        expect(document.body.classList.contains('force-light')).toBe(true);
        expect(document.body.classList.contains(THEME_UNRESOLVED_CLASS)).toBe(false);

        stop();
        jest.useRealTimers();
    });
});

// ---------------------------------------------------------------------------
// watchGmailTheme
// ---------------------------------------------------------------------------

describe('watchGmailTheme', () => {
    test('re-applies the theme when Gmail switches from light to dark', () => {
        jest.useFakeTimers();
        const map = new Map<Element, string>();
        map.set(document.body, 'rgb(255, 255, 255)');
        map.set(document.documentElement, 'rgba(0, 0, 0, 0)');
        mockComputedStyle(map);
        mockMatchMedia(false);

        const stop = watchGmailTheme(() => 'system');
        expect(document.body.classList.contains('force-light')).toBe(true);

        // Gmail repaints dark; the settling ladder picks it up.
        map.set(document.body, 'rgb(32, 33, 36)');
        jest.advanceTimersByTime(1000);

        expect(document.body.classList.contains('force-dark')).toBe(true);
        stop();
        jest.useRealTimers();
    });

    test('a late paint after the settle ladder is still picked up on load', () => {
        jest.useFakeTimers();
        const map = new Map<Element, string>();
        // Nothing readable yet: this is what a slow connection looks like.
        map.set(document.body, 'transparent');
        map.set(document.documentElement, 'transparent');
        mockComputedStyle(map);
        mockMatchMedia(true); // OS says dark, Gmail will say light

        Object.defineProperty(document, 'readyState', { value: 'loading', configurable: true });
        const stop = watchGmailTheme(() => 'system');

        // Ladder runs out with Gmail still unpainted.
        jest.advanceTimersByTime(11000);

        // Gmail finally paints a light surface, via a stylesheet rather than an
        // attribute the observer watches.
        map.set(document.body, 'rgb(248, 250, 253)');
        window.dispatchEvent(new Event('load'));

        expect(document.body.classList.contains('force-light')).toBe(true);
        stop();
        jest.useRealTimers();
    });

    test('a stylesheet arriving after the ladder has expired still flips the theme', async () => {
        // This is the gap the ladder alone could not cover: Gmail's background
        // usually comes from a stylesheet, and a stylesheet loading changes no
        // attribute on <html> or <body>, so the attribute observer never fires.
        // On a slow connection that stylesheet lands after 10 seconds.
        jest.useFakeTimers();
        const map = new Map<Element, string>();
        map.set(document.body, 'rgb(255, 255, 255)');
        map.set(document.documentElement, 'rgba(0, 0, 0, 0)');
        mockComputedStyle(map);
        mockMatchMedia(false);

        const stop = watchGmailTheme(() => 'system');
        expect(document.body.classList.contains('force-light')).toBe(true);

        // Ladder fully spent. Drain the observer callback our own class write
        // queued, so the assertion below is about the stylesheet and nothing else.
        await microtasks();
        jest.advanceTimersByTime(20_000);
        await microtasks();
        jest.advanceTimersByTime(200);
        expect(document.body.classList.contains('force-light')).toBe(true);

        // Gmail's dark stylesheet finally lands.
        map.set(document.body, 'rgb(32, 33, 36)');
        document.head.appendChild(document.createElement('style'));

        // MutationObserver callbacks are microtasks; then the debounce fires.
        await microtasks();
        jest.advanceTimersByTime(200);

        expect(document.body.classList.contains('force-dark')).toBe(true);
        stop();
        jest.useRealTimers();
    });

    test('ignores head churn that is not a stylesheet', async () => {
        jest.useFakeTimers();
        const map = new Map<Element, string>();
        map.set(document.body, 'rgb(255, 255, 255)');
        map.set(document.documentElement, 'rgba(0, 0, 0, 0)');
        mockComputedStyle(map);
        mockMatchMedia(false);

        const stop = watchGmailTheme(() => 'system');
        await microtasks();
        jest.advanceTimersByTime(20_000);
        await microtasks();
        jest.advanceTimersByTime(200);

        // Gmail rewrites <head> constantly. A <meta> is not a repaint.
        map.set(document.body, 'rgb(32, 33, 36)');
        document.head.appendChild(document.createElement('meta'));
        await microtasks();
        jest.advanceTimersByTime(200);

        expect(document.body.classList.contains('force-light')).toBe(true);
        stop();
        jest.useRealTimers();
    });

    test('re-checks when a background tab becomes visible', async () => {
        jest.useFakeTimers();
        const map = new Map<Element, string>();
        map.set(document.body, 'rgb(255, 255, 255)');
        map.set(document.documentElement, 'rgba(0, 0, 0, 0)');
        mockComputedStyle(map);
        mockMatchMedia(false);

        const stop = watchGmailTheme(() => 'system');
        await microtasks();
        jest.advanceTimersByTime(20_000);
        await microtasks();
        jest.advanceTimersByTime(200);

        map.set(document.body, 'rgb(32, 33, 36)');
        Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
        document.dispatchEvent(new Event('visibilitychange'));
        await microtasks();
        jest.advanceTimersByTime(200);

        expect(document.body.classList.contains('force-dark')).toBe(true);
        stop();
        jest.useRealTimers();
    });

    test('teardown stops every source, including a pending debounce', async () => {
        jest.useFakeTimers();
        const map = new Map<Element, string>();
        map.set(document.body, 'rgb(255, 255, 255)');
        map.set(document.documentElement, 'rgba(0, 0, 0, 0)');
        mockComputedStyle(map);
        mockMatchMedia(false);

        const stop = watchGmailTheme(() => 'system');
        map.set(document.body, 'rgb(32, 33, 36)');
        document.head.appendChild(document.createElement('style'));
        await microtasks();

        // Stop between the observer firing and the debounce elapsing.
        stop();
        jest.advanceTimersByTime(20_000);

        expect(document.body.classList.contains('force-light')).toBe(true);
        jest.useRealTimers();
    });

    test('leaves an explicit light/dark preference alone', () => {
        jest.useFakeTimers();
        const map = new Map<Element, string>();
        map.set(document.body, 'rgb(32, 33, 36)');
        map.set(document.documentElement, 'rgba(0, 0, 0, 0)');
        mockComputedStyle(map);
        mockMatchMedia(false);

        document.body.classList.add('force-light');
        const stop = watchGmailTheme(() => 'light');
        jest.advanceTimersByTime(6000);

        expect(document.body.classList.contains('force-light')).toBe(true);
        expect(document.body.classList.contains('force-dark')).toBe(false);
        stop();
        jest.useRealTimers();
    });
});
