/**
 * popup.ts
 *
 * The menu behind the toolbar icon.
 *
 * Every entry here is a second way to reach something that already exists
 * elsewhere, which is the point: the tour in particular was previously
 * reachable exactly once, on install, and a user who dismissed it had no way
 * back to it at all.
 *
 * The popup runs in its own page and closes the moment it loses focus, so
 * every handler asks the service worker to do the work and then calls
 * `window.close()` rather than waiting for a reply it will not live to read.
 */

import { catchChromeError } from './modules/extensionContext';
import { getGlobalTheme } from './utils/storage';
import { DETECTED_GMAIL_THEME_KEY, ResolvedTheme } from './modules/theme';
import { START_TOUR_ACTION, OPEN_OPTIONS_PAGE_ACTION, TOGGLE_SETTINGS_ACTION } from './modules/messages';
import { writeMirroredTheme } from './modules/themeMirror';

const GMAIL_URL = 'https://mail.google.com/';

/**
 * Paint the menu in the theme the extension is actually using.
 *
 * It would be easy to argue the popup is browser chrome and should follow the
 * operating system, and popup.css still does that before this runs. But a
 * user whose desktop is dark and whose Gmail is light picks Light in the
 * extension, and a dark menu hanging off a light everything-else is the same
 * mismatch they picked Light to avoid. Gmail's theme first, the OS only when
 * no Gmail tab has ever reported one.
 */
async function paintTheme(): Promise<void> {
    const [selected, detected] = await Promise.all([getGlobalTheme(), readDetectedGmailTheme()]);

    let resolved: ResolvedTheme;
    if (selected === 'light' || selected === 'dark') {
        resolved = selected;
    } else {
        resolved = detected ?? (prefersDarkOS() ? 'dark' : 'light');
    }
    document.documentElement.setAttribute('data-theme', resolved);
    // The menu is the page most likely to be opened next, and the one with the
    // least time to correct itself. See modules/themeMirror.ts.
    writeMirroredTheme(resolved);
}

function readDetectedGmailTheme(): Promise<ResolvedTheme | null> {
    return new Promise((resolve) => {
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

function prefersDarkOS(): boolean {
    try {
        return window.matchMedia('(prefers-color-scheme: dark)').matches;
    } catch {
        return false;
    }
}

function send(message: Record<string, unknown>): void {
    catchChromeError(chrome.runtime.sendMessage(message), (e) =>
        console.error('Popup: the extension did not answer', e)
    );
}

document.addEventListener('DOMContentLoaded', () => {
    paintTheme().catch((e: unknown) => {
        // The menu stays on the OS default rather than not opening.
        console.error('Popup: could not read the theme', e);
    });

    const configureBtn = document.getElementById('popup-configure') as HTMLButtonElement | null;
    const note = document.getElementById('popup-configure-note');

    /**
     * Configure Tabs lives in the Gmail page, so it can only be opened from a
     * Gmail tab. Rather than failing silently somewhere else, the entry says
     * what it will do instead.
     */
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const url = tabs && tabs[0] ? tabs[0].url || '' : '';
        const onGmail = url.startsWith(GMAIL_URL);
        const tabId = tabs && tabs[0] ? tabs[0].id : undefined;

        if (!onGmail && note) {
            note.textContent = 'Opens Gmail first';
        }

        configureBtn?.addEventListener('click', () => {
            if (onGmail && tabId !== undefined) {
                catchChromeError(chrome.tabs.sendMessage(tabId, { action: TOGGLE_SETTINGS_ACTION }), (e) =>
                    console.error('Popup: could not reach the Gmail tab', e)
                );
            } else {
                catchChromeError(chrome.tabs.create({ url: GMAIL_URL }), (e) =>
                    console.error('Popup: could not open Gmail', e)
                );
            }
            window.close();
        });
    });

    document.getElementById('popup-tour')?.addEventListener('click', () => {
        send({ action: START_TOUR_ACTION });
        window.close();
    });

    document.getElementById('popup-settings')?.addEventListener('click', () => {
        send({ action: OPEN_OPTIONS_PAGE_ACTION });
        window.close();
    });

    document.getElementById('popup-help')?.addEventListener('click', () => {
        send({ action: OPEN_OPTIONS_PAGE_ACTION, hash: '#contact' });
        window.close();
    });
});
