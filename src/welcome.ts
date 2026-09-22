/**
 * welcome.ts
 *
 * The standalone onboarding page.
 *
 * It exists for one case: someone installed the extension with no Gmail tab
 * open, so there is nothing to show the tour over. Everything explanatory
 * lives in the shared wizard, which this page mounts unchanged — a second copy
 * of the copy, the choreography or the theme chooser would drift from the
 * in-Gmail one within a release.
 *
 * Two things differ from the modal, and only two: the page applies a chosen
 * theme to itself rather than to Gmail's tab bar, and finishing opens Gmail
 * rather than dismissing an overlay.
 */

import { getGlobalTheme, setGlobalTheme, Theme } from './utils/storage';
import { DETECTED_GMAIL_THEME_KEY, ResolvedTheme } from './modules/theme';
import { catchChromeError } from './modules/extensionContext';
import { createWizard } from './modules/onboarding/wizardView';
import { writeMirroredTheme } from './modules/themeMirror';

const GMAIL_URL = 'https://mail.google.com/';

/**
 * The theme a Gmail tab last reported, or null if none ever has.
 *
 * This page has no Gmail DOM to sample, so it mirrors what a content script
 * published. Null is the honest answer on a browser that has never opened
 * Gmail, and only then does the OS get a say.
 */
let detectedGmailTheme: ResolvedTheme | null = null;

async function loadDetectedGmailTheme(): Promise<void> {
    detectedGmailTheme = await new Promise<ResolvedTheme | null>((resolve) => {
        try {
            chrome.storage.local.get([DETECTED_GMAIL_THEME_KEY], (items) => {
                if (chrome.runtime.lastError || !items) {
                    resolve(null);
                    return;
                }
                const t = items[DETECTED_GMAIL_THEME_KEY];
                resolve(t === 'light' || t === 'dark' ? t : null);
            });
        } catch {
            resolve(null);
        }
    });
}

/**
 * What 'system' means here: Gmail's theme first, the OS only as a last
 * resort. Gmail's theme is an account setting, so a dark desktop says nothing
 * about the inbox this extension has to blend into.
 */
function resolveSystemForPage(): ResolvedTheme {
    if (detectedGmailTheme) return detectedGmailTheme;
    try {
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    } catch {
        return 'light';
    }
}

/**
 * Stamp the resolved theme, never the raw selection.
 *
 * Removing the attribute for 'system' would hand the decision to
 * welcome.css's `prefers-color-scheme` block, which is the OS again. That
 * block stays as the pre-JavaScript default and nothing more.
 */
function applyThemeToPage(theme: Theme): void {
    const resolved = theme === 'light' || theme === 'dark' ? theme : resolveSystemForPage();
    document.documentElement.setAttribute('data-theme', resolved);
    // So the next extension page opens in this rather than its stylesheet's
    // default. See modules/themeMirror.ts.
    writeMirroredTheme(resolved);
}

/**
 * Focus an existing Gmail tab, or open one.
 *
 * The existing tab is reloaded because it may predate this install and so be
 * running no content script: without that, the user would arrive at a Gmail
 * with no tab bar, immediately after a tour promising one.
 */
function openGmail(): void {
    chrome.tabs.query({ url: 'https://mail.google.com/*' }, (tabs) => {
        const report = (e: unknown): void => console.error('Welcome: could not open Gmail', e);

        if (tabs && tabs.length > 0 && tabs[0].id !== undefined) {
            const id = tabs[0].id;
            catchChromeError(chrome.tabs.update(id, { active: true }), report);
            catchChromeError(chrome.tabs.reload(id), report);
            return;
        }

        catchChromeError(chrome.tabs.create({ url: GMAIL_URL }), report);
    });
}

document.addEventListener('DOMContentLoaded', () => {
    const mount = document.getElementById('welcome-stage');
    if (!mount) return;

    // Learn Gmail's theme before painting, so 'system' does not flash the
    // wrong one. Both reads are best-effort and neither blocks the wizard.
    loadDetectedGmailTheme()
        .then(() => getGlobalTheme())
        .then(applyThemeToPage)
        .catch((e: unknown) => console.error('Welcome: could not read the saved theme', e));

    const wizard = createWizard({
        loadTheme: () => getGlobalTheme(),
        saveTheme: (theme: Theme) => setGlobalTheme(theme),
        applyTheme: applyThemeToPage,
        resolveSystem: resolveSystemForPage,
        onFinish: openGmail,
        // No dismiss control: this page is the whole experience, and an X in
        // its corner would leave the user on an empty tab.
        showClose: false,
        onError: (e: unknown) => console.error('Welcome: the tour could not save a setting', e),
    });

    mount.appendChild(wizard.element);
});
