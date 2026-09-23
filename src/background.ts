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

import {
    MUTATE_SETTINGS_ACTION,
    createMutationQueue,
    MutateSettingsResponse,
    setPendingOnboarding,
} from './utils/storage';
import { catchChromeError } from './modules/extensionContext';
import { START_TOUR_ACTION, SHOW_ONBOARDING_ACTION, OPEN_OPTIONS_PAGE_ACTION } from './modules/messages';

const mutationQueue = createMutationQueue();

/** Matches every Gmail tab, in any window. */
const GMAIL_MATCH = 'https://mail.google.com/*';

/**
 * Start the onboarding tour on whichever surface the user actually has.
 *
 * Over Gmail wherever possible, because that is the only place the theme
 * chooser on the last slide can retint the real tab bar while the user
 * watches. The standalone page is the fallback for a browser with no Gmail
 * open, and for a Gmail tab old enough to predate this install and so to be
 * running no content script yet.
 */
async function startTour(): Promise<void> {
    let tabs: chrome.tabs.Tab[] = [];
    try {
        tabs = await chrome.tabs.query({ url: GMAIL_MATCH });
    } catch (e: unknown) {
        console.warn('Background: could not look for a Gmail tab:', e);
    }

    // Prefer the one the user is looking at.
    const target = tabs.find((t) => t.active) ?? tabs[0];

    if (target && target.id !== undefined) {
        try {
            await chrome.tabs.update(target.id, { active: true });
            if (target.windowId !== undefined) {
                await chrome.windows.update(target.windowId, { focused: true });
            }
            await chrome.tabs.sendMessage(target.id, { action: SHOW_ONBOARDING_ACTION });
            return;
        } catch (e: unknown) {
            // No content script in that tab yet. Fall through to the page
            // rather than leaving the user with nothing having happened.
            console.warn('Background: the Gmail tab could not show the tour:', e);
        }
    }

    await chrome.tabs.create({ url: 'welcome.html' });
}

/**
 * Open the options page, preferring Chrome's own opener so an already-open
 * tab is focused rather than duplicated.
 */
async function openOptionsPage(hash?: string): Promise<void> {
    // A hash targets one section, so "Help & support" in the toolbar menu
    // lands on the contact form rather than on whatever section was last
    // open. openOptionsPage() cannot carry one, so a hash means a real tab.
    if (hash) {
        await chrome.tabs.create({ url: chrome.runtime.getURL('options.html') + hash });
        return;
    }
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

    if (message.action === OPEN_OPTIONS_PAGE_ACTION) {
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
        openOptionsPage(typeof message.hash === 'string' ? message.hash : undefined)
            .then(() => sendResponse({ ok: true }))
            .catch((e: unknown) => {
                console.error('Background: could not open the options page:', e);
                sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) });
            });
        return true;
    }

    if (message.action === START_TOUR_ACTION) {
        startTour()
            .then(() => sendResponse({ ok: true }))
            .catch((e: unknown) => {
                console.error('Background: could not start the tour:', e);
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

/**
 * Decide where the first-run tour should appear, and make it happen.
 *
 * Reloading the open Gmail tabs is not new behaviour bolted on for the tour:
 * it is what makes the tab bar appear at all without the user reloading by
 * hand. The tour rides along with it.
 */
async function installOnboarding(): Promise<void> {
    let tabs: chrome.tabs.Tab[] = [];
    try {
        tabs = await chrome.tabs.query({ url: GMAIL_MATCH });
    } catch (e: unknown) {
        console.warn('Background: could not look for Gmail tabs on install:', e);
    }

    if (tabs.length === 0) {
        // Nothing to run it over: the standalone page is the whole experience.
        await chrome.tabs.create({ url: 'welcome.html' });
        return;
    }

    await setPendingOnboarding(true);

    for (const tab of tabs) {
        if (tab.id === undefined) continue;
        // One discarded or closing tab must not stop the rest.
        catchChromeError(chrome.tabs.reload(tab.id), (e) =>
            console.warn('Background: could not reload Gmail tab', tab.id, e)
        );
    }

    const focus = tabs.find((t) => t.active) ?? tabs[0];
    if (focus && focus.id !== undefined) {
        catchChromeError(chrome.tabs.update(focus.id, { active: true }), (e) =>
            console.warn('Background: could not focus the Gmail tab:', e)
        );
    }
}

// Install hook: first-run tour + reload open Gmail tabs
chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
        // The tour runs over Gmail when there is a Gmail tab to run it over,
        // because only there can the theme chooser retint the real bar. The
        // flag is how: an already-open Gmail tab is running no content script
        // until it reloads, so a message sent now would reach nothing. The
        // reload below injects the script, which then picks this up.
        installOnboarding().catch((e: unknown) =>
            console.warn('Background: could not set up the welcome tour:', e)
        );
    }
});
