/**
 * background.ts
 *
 * Service worker for the extension.
 *
 * Besides downloads and the install hook, this is the single writer for
 * account settings. Every surface in the profile — the options page and the
 * modals, drag handlers and tab manager inside every open Gmail tab — sends
 * its change here as a `SettingsOp`. The worker is one JavaScript context, so
 * running those through a per-account promise chain serializes them by
 * construction: no lock, no retry, no window. See `mutateSettings`.
 */

import '@inboxsdk/core/background.js';
import { MUTATE_SETTINGS_ACTION, createMutationQueue, MutateSettingsResponse } from './utils/storage';
import { catchChromeError } from './modules/extensionContext';

const mutationQueue = createMutationQueue();

/**
 * Open the options page, preferring Chrome's own opener so an already-open
 * tab is focused rather than duplicated.
 */
async function openOptionsPage(): Promise<void> {
    if (chrome.runtime.openOptionsPage) {
        await chrome.runtime.openOptionsPage();
        return;
    }
    await chrome.tabs.create({ url: chrome.runtime.getURL('options.html') });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === MUTATE_SETTINGS_ACTION) {
        mutationQueue(message.accountId, message.op)
            .then((settings) => sendResponse({ ok: true, settings } satisfies MutateSettingsResponse))
            .catch((e: unknown) =>
                sendResponse({
                    ok: false,
                    error: e instanceof Error ? e.message : String(e),
                } satisfies MutateSettingsResponse)
            );
        // Async reply: hold the channel open.
        return true;
    }

    if (message.action === 'DOWNLOAD_FILE') {
        try {
            console.log('Background: Received DOWNLOAD_FILE request');

            if (!chrome.downloads) {
                throw new Error('chrome.downloads API is not available');
            }

            // Use TextEncoder for reliable UTF-8 → base64 encoding
            let base64Data;
            try {
                const encoder = new TextEncoder();
                const bytes = encoder.encode(message.data);
                let binary = '';
                for (let i = 0; i < bytes.length; i++) {
                    binary += String.fromCharCode(bytes[i]);
                }
                base64Data = btoa(binary);
            } catch (e) {
                throw new Error('Failed to encode data: ' + (e as Error).message);
            }

            const url = 'data:application/json;base64,' + base64Data;

            chrome.downloads.download(
                {
                    url: url,
                    filename: message.filename,
                    saveAs: false,
                    conflictAction: 'uniquify',
                },
                (downloadId) => {
                    if (chrome.runtime.lastError) {
                        console.error('Background: Download failed:', chrome.runtime.lastError);
                        sendResponse({ success: false, error: chrome.runtime.lastError.message });
                    } else {
                        console.log('Background: Download started, ID:', downloadId);
                        sendResponse({ success: true, downloadId: downloadId });
                    }
                }
            );
        } catch (e: any) {
            console.error('Background: Error processing download request:', e);
            sendResponse({ success: false, error: e.message });
        }
        // chrome.downloads.download answers through a callback.
        return true;
    }

    if (message.action === 'OPEN_OPTIONS_PAGE') {
        // A content script cannot open this itself. `options.html` is not in
        // `web_accessible_resources`, so a navigation whose initiator is
        // mail.google.com is refused with ERR_BLOCKED_BY_CLIENT, which is how
        // the "Manage all accounts" link silently did nothing from v1.2.1 to
        // v1.5.0. Listing the page would fix the symptom by letting any script
        // on Gmail reach the settings UI, so the worker opens it instead.
        //
        // Answered asynchronously, and deliberately. Both openers can reject
        // rather than throw, so the synchronous try/catch this replaced would
        // have reported ok: true for an options page that never opened.
        openOptionsPage()
            .then(() => sendResponse({ ok: true }))
            .catch((e: unknown) => {
                console.error('Background: could not open the options page:', e);
                sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) });
            });
        return true;
    }

    if (message.action === 'UNINSTALL_SELF') {
        console.log('Background: Received UNINSTALL_SELF request');
        if (chrome.management && chrome.management.uninstallSelf) {
            chrome.management.uninstallSelf({ showConfirmDialog: true }, () => {
                if (chrome.runtime.lastError) {
                    console.error('Background: Uninstall failed:', chrome.runtime.lastError);
                }
            });
        } else {
            console.error('Background: chrome.management.uninstallSelf is not available. Check permissions.');
        }
        return false;
    }

    // Anything else is not ours. Returning true here would hold the sender's
    // message channel open forever: a promise-form sendMessage would never
    // settle, which is exactly how a stale worker can hang a caller.
    return false;
});

// Uninstall URL: the one moment the in-product feedback form cannot reach.
//
// Chrome opens this page in a new tab after the extension is removed, which
// is the only chance to ask why. Nothing is sent from here: Chrome navigates
// to a static form and the user chooses whether to fill it in. No account
// address, no settings and no identifier is attached to the URL, so the form
// host learns only that someone, somewhere, uninstalled.
//
// This is a third-party host, so it is disclosed rather than quiet: in
// SECURITY.md, on the in-extension privacy page (Settings -> Privacy), in
// STORE_LISTING.md and in the Web Store data declaration. A test in
// test/repoConsistency.test.ts fails the build if this URL's host is present
// here and missing from any of those, so it cannot go undisclosed again.
// See ADR-014.
const UNINSTALL_FEEDBACK_URL = 'https://tally.so/r/D4BBRR?transparentBackground=1&formEventsForwarding=1';
if (chrome.runtime.setUninstallURL) {
    chrome.runtime.setUninstallURL(UNINSTALL_FEEDBACK_URL, () => {
        if (chrome.runtime.lastError) {
            console.warn('Background: could not set uninstall URL:', chrome.runtime.lastError);
        }
    });
}

chrome.action.onClicked.addListener((tab) => {
    if (tab.id) {
        chrome.tabs.sendMessage(tab.id, { action: 'TOGGLE_SETTINGS' }).catch((err) => {
            // Ignore errors if the content script isn't ready
            console.warn('Could not send message to tab:', err);
        });
    }
});

// Install hook: Open Welcome Page & Reload Gmail Tabs
chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
        // 1. Open Welcome Page
        catchChromeError(chrome.tabs.create({ url: 'welcome.html' }), (e) =>
            console.warn('Background: could not open the welcome page:', e)
        );

        // 2. Auto-Reload Open Gmail Tabs
        // This ensures the content script is injected immediately
        chrome.tabs.query({ url: 'https://mail.google.com/*' }, (tabs) => {
            tabs.forEach((tab) => {
                if (tab.id) {
                    // One discarded or closing tab must not stop the rest.
                    catchChromeError(chrome.tabs.reload(tab.id), (e) =>
                        console.warn('Background: could not reload Gmail tab', tab.id, e)
                    );
                }
            });
        });
    }
});
