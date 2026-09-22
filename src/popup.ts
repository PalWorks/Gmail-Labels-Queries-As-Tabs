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
import { START_TOUR_ACTION, OPEN_OPTIONS_PAGE_ACTION, TOGGLE_SETTINGS_ACTION } from './modules/messages';

const GMAIL_URL = 'https://mail.google.com/';

function send(message: Record<string, unknown>): void {
    catchChromeError(chrome.runtime.sendMessage(message), (e) =>
        console.error('Popup: the extension did not answer', e)
    );
}

document.addEventListener('DOMContentLoaded', () => {
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
