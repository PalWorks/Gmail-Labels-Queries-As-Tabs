export {};
/**
 * themeMirror.test.ts
 *
 * The synchronous copy of the resolved theme, and the boot-time stamp that
 * uses it.
 *
 * What these protect is a frame, not a value: the options page painted its
 * dark base tokens, then its elements, then the real theme, which a user
 * reported as a black flash. Nothing about the final state was ever wrong,
 * so nothing that only checks the final state could have caught it.
 */

import { readMirroredTheme, writeMirroredTheme, stampResolvedTheme, THEME_MIRROR_KEY } from '../src/modules/themeMirror';

describe('themeMirror', () => {
    beforeEach(() => {
        window.localStorage.clear();
        document.documentElement.removeAttribute('data-theme');
        document.body.className = '';
    });

    test('remembers what was painted', () => {
        writeMirroredTheme('dark');
        expect(readMirroredTheme()).toBe('dark');
        writeMirroredTheme('light');
        expect(readMirroredTheme()).toBe('light');
    });

    test('an unwritten mirror is null, not a default', () => {
        // Null and 'light' are different answers: the boot script turns the
        // first into the extension's stored default, and a caller that wanted
        // to know whether anything had ever been painted can still tell.
        expect(readMirroredTheme()).toBeNull();
    });

    test('junk in storage reads as unwritten', () => {
        window.localStorage.setItem(THEME_MIRROR_KEY, 'chartreuse');
        expect(readMirroredTheme()).toBeNull();
    });

    test('a browser that refuses storage does not break the page', () => {
        const getItem = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
            throw new Error('site data blocked');
        });
        const setItem = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new Error('site data blocked');
        });
        try {
            expect(readMirroredTheme()).toBeNull();
            expect(() => writeMirroredTheme('dark')).not.toThrow();
        } finally {
            getItem.mockRestore();
            setItem.mockRestore();
        }
    });

    test('stamps both conventions, because three pages read two of them', () => {
        stampResolvedTheme('dark');
        // The popup and the welcome page.
        expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
        // The options page.
        expect(document.body.classList.contains('theme-dark')).toBe(true);
        expect(document.body.classList.contains('theme-light')).toBe(false);
    });

    test('stamping again replaces the previous theme rather than adding to it', () => {
        stampResolvedTheme('dark');
        stampResolvedTheme('light');
        expect(document.documentElement.getAttribute('data-theme')).toBe('light');
        expect(document.body.classList.contains('theme-light')).toBe(true);
        expect(document.body.classList.contains('theme-dark')).toBe(false);
    });
});

describe('themeBoot', () => {
    beforeEach(() => {
        jest.resetModules();
        window.localStorage.clear();
        document.documentElement.removeAttribute('data-theme');
        document.body.className = '';
    });

    test('opens in the theme this browser last painted', async () => {
        writeMirroredTheme('dark');
        await import('../src/themeBoot');
        expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
        expect(document.body.classList.contains('theme-dark')).toBe(true);
    });

    test('with nothing remembered it opens light, the stored default', async () => {
        // Not the OS. getGlobalTheme() returns 'light' when nothing is saved,
        // so light is what this extension is actually set to; asking
        // prefers-color-scheme here would be the 1.6.1 bug again, in the one
        // place with no way to correct itself before the user sees it.
        await import('../src/themeBoot');
        expect(document.documentElement.getAttribute('data-theme')).toBe('light');
        expect(document.body.classList.contains('theme-light')).toBe(true);
    });
});
