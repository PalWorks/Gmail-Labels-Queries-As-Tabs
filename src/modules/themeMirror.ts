/**
 * themeMirror.ts
 *
 * A synchronous copy of the resolved theme, so an extension page can be the
 * right colour on its first frame.
 *
 * The theme itself lives in `chrome.storage.local`, which is asynchronous.
 * Every extension page therefore has a window between "HTML parsed" and
 * "storage answered" in which it must paint something, and until now it
 * painted whatever its stylesheet defaulted to: for the options page, whose
 * base tokens are dark, that was a black page that turned white a moment
 * later.
 *
 * `localStorage` is the only synchronous storage a page has. It is shared by
 * every page on the extension's origin (options, popup, welcome), so one of
 * them writing the resolved theme lets all of them open in it.
 *
 * Three things this deliberately is not:
 *
 *  - It is not the source of truth. `chrome.storage.local` is. This is a
 *    cache, read before the real value arrives and overwritten by it.
 *  - It is not synced. `localStorage` is per-profile, which is right: it
 *    describes what this browser last painted, not what the user prefers.
 *  - It is not written by the Gmail content script, which lives on Gmail's
 *    origin and cannot see this storage. Change the theme from the in-Gmail
 *    modal and the next options page load may still open in the old one for
 *    a frame before correcting itself. A stale cache costs a flash; it never
 *    costs a wrong final state.
 *
 * Every access is wrapped: localStorage throws when site data is blocked, and
 * a theme cache is never worth breaking a page over.
 */

export type MirroredTheme = 'light' | 'dark';

/** Namespaced, because the extension's pages share an origin with nothing else but each other. */
export const THEME_MIRROR_KEY = 'glt.resolvedTheme';

/**
 * The theme this browser last painted, or null if it has never painted one.
 *
 * Null is not "light": callers decide what an absent answer means, which for
 * the boot script is the extension's own default rather than the OS.
 */
export function readMirroredTheme(): MirroredTheme | null {
    try {
        const value = window.localStorage.getItem(THEME_MIRROR_KEY);
        return value === 'light' || value === 'dark' ? value : null;
    } catch {
        return null;
    }
}

/** Remember the theme this page settled on, for the next page to open in. */
export function writeMirroredTheme(theme: MirroredTheme): void {
    try {
        window.localStorage.setItem(THEME_MIRROR_KEY, theme);
    } catch {
        // Blocked storage, private window, quota. The page is already themed;
        // the only cost is that the next one starts from the default again.
    }
}

/**
 * Put a resolved theme on the document, in both the forms this extension's
 * pages read.
 *
 * The options page keys off `body.theme-light` / `body.theme-dark`; the popup
 * and the welcome page key off `data-theme` on `<html>`. Stamping both is a
 * line of code and means one boot script serves all three, rather than three
 * scripts that drift.
 */
export function stampResolvedTheme(theme: MirroredTheme): void {
    try {
        document.documentElement.setAttribute('data-theme', theme);
        if (document.body) {
            document.body.classList.remove('theme-light', 'theme-dark');
            document.body.classList.add(theme === 'dark' ? 'theme-dark' : 'theme-light');
        }
    } catch {
        // A document that cannot be stamped cannot be shown either.
    }
}
