/**
 * theme.ts
 *
 * Theme management for Gmail Labels as Tabs.
 * Controls force-dark / force-light CSS class application.
 * Detects Gmail's actual dark mode via background color inspection.
 */

export type ThemeMode = 'system' | 'light' | 'dark';

// Gmail dark mode background colors (and close variants)
const GMAIL_DARK_BG_COLORS = [
    'rgb(32, 33, 36)',     // Standard Gmail dark
    'rgb(26, 26, 26)',     // Alternate dark
    'rgb(41, 42, 45)',     // Slightly lighter dark variant
];

/**
 * Detect whether Gmail is currently rendering in dark mode
 * by inspecting actual background colors rather than relying on OS media queries.
 */
export function detectGmailDarkMode(): boolean {
    // Strategy 1: Check Gmail's main body/html background
    const bodyBg = getComputedStyle(document.body).backgroundColor;
    if (GMAIL_DARK_BG_COLORS.includes(bodyBg)) {
        return true;
    }

    // Strategy 2: Check the <html> element
    const htmlBg = getComputedStyle(document.documentElement).backgroundColor;
    if (GMAIL_DARK_BG_COLORS.includes(htmlBg)) {
        return true;
    }

    // Strategy 3: Check Gmail's main content area if available
    const mainContent = document.querySelector('.nH') as HTMLElement;
    if (mainContent) {
        const contentBg = getComputedStyle(mainContent).backgroundColor;
        if (GMAIL_DARK_BG_COLORS.includes(contentBg)) {
            return true;
        }
    }

    // Strategy 4: Luminance-based fallback — parse any rgb() value
    const luminance = parseLuminance(bodyBg);
    if (luminance !== null && luminance < 50) {
        return true;
    }

    // Fallback: use OS-level media query
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
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
 * Apply the selected theme by toggling CSS classes on document.body.
 * - 'light'  → force-light (overrides any dark media query)
 * - 'dark'   → force-dark
 * - 'system' → detect Gmail's actual mode and match it
 */
export function applyTheme(theme: ThemeMode): void {
    document.body.classList.remove('force-dark', 'force-light');

    if (theme === 'dark') {
        document.body.classList.add('force-dark');
    } else if (theme === 'light') {
        document.body.classList.add('force-light');
    } else {
        // 'system' — detect Gmail's current mode and match
        const gmailIsDark = detectGmailDarkMode();
        if (gmailIsDark) {
            document.body.classList.add('force-dark');
        } else {
            document.body.classList.add('force-light');
        }
    }
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
