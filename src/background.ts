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

const mutationQueue = createMutationQueue();

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

// Set the uninstall URL on startup/install
const FEEDBACK_URL = 'https://tally.so/r/D4BBRR?transparentBackground=1&formEventsForwarding=1';
if (chrome.runtime.setUninstallURL) {
    chrome.runtime.setUninstallURL(FEEDBACK_URL, () => {
        console.log('Background: Uninstall URL set to', FEEDBACK_URL);
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
        chrome.tabs.create({ url: 'welcome.html' });

        // 2. Auto-Reload Open Gmail Tabs
        // This ensures the content script is injected immediately
        chrome.tabs.query({ url: 'https://mail.google.com/*' }, (tabs) => {
            tabs.forEach((tab) => {
                if (tab.id) {
                    chrome.tabs.reload(tab.id);
                }
            });
        });
    }
});
