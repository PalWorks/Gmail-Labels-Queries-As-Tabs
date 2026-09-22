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
import { catchChromeError } from './modules/extensionContext';
import { createWizard } from './modules/onboarding/wizardView';

const GMAIL_URL = 'https://mail.google.com/';

/** Match the mechanism welcome.css already keys its dark palette off. */
function applyThemeToPage(theme: Theme): void {
    if (theme === 'light' || theme === 'dark') {
        document.documentElement.setAttribute('data-theme', theme);
    } else {
        // 'system': let prefers-color-scheme decide.
        document.documentElement.removeAttribute('data-theme');
    }
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

    // The page's own theme should match the saved one before the wizard
    // paints, so the first frame is not the wrong colour.
    getGlobalTheme()
        .then(applyThemeToPage)
        .catch((e: unknown) => console.error('Welcome: could not read the saved theme', e));

    const wizard = createWizard({
        loadTheme: () => getGlobalTheme(),
        saveTheme: (theme: Theme) => setGlobalTheme(theme),
        applyTheme: applyThemeToPage,
        onFinish: openGmail,
        // No dismiss control: this page is the whole experience, and an X in
        // its corner would leave the user on an empty tab.
        showClose: false,
        onError: (e: unknown) => console.error('Welcome: the tour could not save a setting', e),
    });

    mount.appendChild(wizard.element);
});
