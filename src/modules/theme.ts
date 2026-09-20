/**
 * theme.ts
 *
 * Theme management for Gmail Labels as Tabs.
 * Controls force-dark / force-light CSS class application.
 *
 * The source of truth for 'system' mode is *Gmail's own* rendered theme, not
 * the OS media query. Gmail's theme is an account setting, so a user on a dark
 * desktop can be reading a light Gmail; matching the OS there makes the tab bar
 * stand out instead of blending in. The OS query is a last resort, used only
 * when Gmail's background cannot be read yet (very early injection).
 */

export type ThemeMode = 'system' | 'light' | 'dark';

/** A theme actually rendered on screen — 'system' resolves to one of these. */
export type ResolvedTheme = 'light' | 'dark';

import { MAIN_CONTENT_SELECTOR } from '../utils/selectors';

// Gmail dark mode background colors (and close variants)
const GMAIL_DARK_BG_COLORS = [
    'rgb(32, 33, 36)', // Standard Gmail dark
    'rgb(26, 26, 26)', // Alternate dark
    'rgb(41, 42, 45)', // Slightly lighter dark variant
];

// Luminance bands (0-255). The gap between them is deliberately left
// undecided so a mid-grey surface falls through to the next candidate
// element rather than guessing wrong.
const DARK_LUMINANCE_MAX = 110;
const LIGHT_LUMINANCE_MIN = 140;

/** Key under which the last detected Gmail theme is shared with other pages. */
export const DETECTED_GMAIL_THEME_KEY = 'detectedGmailTheme';

/**
 * Read Gmail's rendered theme from the page itself.
 *
 * Returns `null` — not a guess — when no candidate element has a readable,
 * non-transparent background yet. Callers decide what to do with "unknown":
 * the watcher re-checks, `applyTheme` falls back to the OS query.
 */
export function detectGmailTheme(): ResolvedTheme | null {
    const candidates: Element[] = [document.body, document.documentElement];
    const mainContent = document.querySelector(MAIN_CONTENT_SELECTOR);
    if (mainContent) candidates.push(mainContent);

    const backgrounds = candidates
        .filter((el): el is Element => !!el)
        .map((el) => getComputedStyle(el).backgroundColor)
        .filter((bg) => !!bg && !isTransparent(bg));

    // Pass 1: an exact Gmail dark surface anywhere is conclusive. Gmail keeps a
    // light <body> in some dark layouts, so this must beat the luminance pass.
    if (backgrounds.some((bg) => GMAIL_DARK_BG_COLORS.includes(bg))) return 'dark';

    // Pass 2: judge by perceived luminance, nearest surface first.
    for (const bg of backgrounds) {
        const luminance = parseLuminance(bg);
        if (luminance === null) continue;
        if (luminance < DARK_LUMINANCE_MAX) return 'dark';
        if (luminance > LIGHT_LUMINANCE_MIN) return 'light';
    }

    return null;
}

/**
 * Resolve 'system' to a concrete theme: Gmail's own theme when it can be read,
 * the OS preference only as a fallback.
 */
export function resolveSystemTheme(): ResolvedTheme {
    const detected = detectGmailTheme();
    if (detected) return detected;
    return prefersDarkOS() ? 'dark' : 'light';
}

/**
 * Detect whether Gmail is currently rendering in dark mode.
 * Retained for backward compatibility; prefer `detectGmailTheme()`, which can
 * also say "unknown".
 */
export function detectGmailDarkMode(): boolean {
    return resolveSystemTheme() === 'dark';
}

/** True when the string is a fully transparent / absent color. */
function isTransparent(color: string): boolean {
    const normalized = color.replace(/\s/g, '').toLowerCase();
    return normalized === 'transparent' || normalized === 'rgba(0,0,0,0)';
}

/** True when the OS asks for dark. Safe when matchMedia is unavailable. */
function prefersDarkOS(): boolean {
    try {
        return window.matchMedia('(prefers-color-scheme: dark)').matches;
    } catch {
        return false;
    }
}

/**
 * Parse an rgb/rgba string and return approximate luminance (0-255).
 * Returns null if the color string can't be parsed.
 */
function parseLuminance(color: string): number | null {
    const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (!match) return null;
    const r = parseInt(match[1], 10);
    const g = parseInt(match[2], 10);
    const b = parseInt(match[3], 10);
    // Perceived luminance (ITU-R BT.709)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Share the detected Gmail theme with the extension's other pages (the options
 * page has no Gmail DOM to sample, so it mirrors this value in 'system' mode).
 * Best-effort: never throws, never blocks rendering.
 */
export function publishDetectedTheme(theme: ResolvedTheme): void {
    try {
        chrome?.storage?.local?.set({ [DETECTED_GMAIL_THEME_KEY]: theme });
    } catch {
        // Storage unavailable (context invalidated, or unit test): ignore.
    }
}

/**
 * Apply the selected theme by toggling CSS classes on document.body.
 * - 'light'  → force-light (overrides any dark media query)
 * - 'dark'   → force-dark
 * - 'system' → match Gmail's own rendered theme
 */
export function applyTheme(theme: ThemeMode): void {
    document.body.classList.remove('force-dark', 'force-light');

    let resolved: ResolvedTheme;
    if (theme === 'dark' || theme === 'light') {
        resolved = theme;
    } else {
        resolved = resolveSystemTheme();
        publishDetectedTheme(resolved);
    }

    document.body.classList.add(resolved === 'dark' ? 'force-dark' : 'force-light');
}

/**
 * Set up a listener for OS-level theme changes so that 'system' mode
 * auto-updates when the user toggles OS dark mode.
 */
export function listenForSystemThemeChanges(getCurrentTheme: () => ThemeMode): void {
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    mql.addEventListener('change', () => {
        if (getCurrentTheme() === 'system') {
            applyTheme('system');
        }
    });
}

// Gmail paints its real background well after injection, and the user can flip
// the Gmail theme without a reload, so 'system' mode re-checks on a short
// settling ladder and then on DOM attribute changes.
const SETTLE_DELAYS_MS = [250, 750, 2000, 5000];

/**
 * Keep 'system' mode in step with Gmail's own theme: re-detect while the page
 * settles, then whenever Gmail mutates the attributes that carry its theme.
 * Returns a teardown function (used by tests; the content script runs for the
 * life of the tab).
 */
export function watchGmailTheme(getCurrentTheme: () => ThemeMode): () => void {
    let lastResolved: ResolvedTheme | null = null;

    const check = (): void => {
        if (getCurrentTheme() !== 'system') return;
        const detected = detectGmailTheme();
        if (!detected || detected === lastResolved) return;
        lastResolved = detected;
        applyTheme('system');
    };

    const timers = SETTLE_DELAYS_MS.map((ms) => setTimeout(check, ms));

    let scheduled = false;
    const observer = new MutationObserver(() => {
        if (scheduled) return;
        scheduled = true;
        setTimeout(() => {
            scheduled = false;
            check();
        }, 150);
    });
    const options: MutationObserverInit = { attributes: true, attributeFilter: ['class', 'style'] };
    observer.observe(document.documentElement, options);
    if (document.body) observer.observe(document.body, options);

    check();

    return () => {
        timers.forEach(clearTimeout);
        observer.disconnect();
    };
}
