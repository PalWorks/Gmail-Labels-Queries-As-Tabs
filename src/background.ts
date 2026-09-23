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
import {
    START_TOUR_ACTION,
    SHOW_ONBOARDING_ACTION,
    OPEN_OPTIONS_PAGE_ACTION,
    PING_ACTION,
} from './modules/messages';

const mutationQueue = createMutationQueue();

/** Matches every Gmail tab, in any window. */
const GMAIL_MATCH = 'https://mail.google.com/*';

/**
 * The content script and its stylesheets, exactly as `manifest.json` declares
 * them.
 *
 * Chrome injects these itself into every Gmail tab loaded from now on. It
 * does not inject them into a tab that was already open when the extension
 * was installed, updated or reloaded: that tab keeps running whatever copy it
 * had, or none at all, until the user reloads it by hand. This list is how we
 * reach those tabs instead of asking the user to.
 *
 * A guard in test/repoConsistency.test.ts fails if these two lists and the
 * manifest ever disagree, because the failure would be silent: injection
 * would succeed and the tab would come up unstyled, or a version behind.
 */
const CONTENT_SCRIPT_FILES = ['js/content.js'];
const CONTENT_STYLE_FILES = ['css/toolbar.css', 'css/onboarding.css'];

/** Every Gmail tab open in this profile, in any window. */
async function findGmailTabs(): Promise<chrome.tabs.Tab[]> {
    try {
        return await chrome.tabs.query({ url: GMAIL_MATCH });
    } catch (e: unknown) {
        console.warn('Background: could not look for Gmail tabs:', e);
        return [];
    }
}

/** What happened to one tab, for the log and for the tests. */
type Adoption = 'already-running' | 'injected' | 'reloaded' | 'skipped';

/**
 * Give one already-open Gmail tab a working content script.
 *
 * Injection rather than a reload, because the tab belongs to the user: a
 * reload throws away an open compose window, the thread they were reading and
 * their place in it, at a moment they did not choose and for a reason they
 * cannot see. Chrome updates extensions in the background, so that moment is
 * arbitrary. Injection is invisible; the tab bar simply appears.
 *
 * The reload survives as the fallback, because a tab with no tab bar is worse
 * than a tab that blinked.
 */
async function adoptGmailTab(tab: chrome.tabs.Tab): Promise<Adoption> {
    if (tab.id === undefined) return 'skipped';

    // A discarded tab has no page to inject into, and it will load the
    // content script itself the moment the user comes back to it. Waking it
    // would spend the user's data to change nothing they can see.
    if (tab.discarded) return 'skipped';

    // `tab.status` is deliberately not consulted. Measured on 2026-09-24: a
    // fully loaded, fully usable Gmail tab reports `status: 'loading'`,
    // because Gmail holds a request open for its live updates. Skipping
    // loading tabs therefore skipped every Gmail tab there was, which is the
    // one thing this function exists not to do. A page that really is still
    // loading gets the manifest's own copy as well, and the two sort it out:
    // see modules/handover.ts.

    try {
        const reply = await chrome.tabs.sendMessage(tab.id, { action: PING_ACTION });
        // Answering at all is the answer. A script that replies is connected,
        // so it is this version's and it is live.
        if (reply) return 'already-running';
    } catch {
        // No answer: either no content script, or one orphaned by this very
        // update. Both are exactly what the injection below is for.
    }

    try {
        await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: CONTENT_STYLE_FILES });
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: CONTENT_SCRIPT_FILES });
        return 'injected';
    } catch (e: unknown) {
        console.warn('Background: could not inject into Gmail tab', tab.id, e);
    }

    try {
        await chrome.tabs.reload(tab.id);
        return 'reloaded';
    } catch (e: unknown) {
        console.warn('Background: could not reload Gmail tab', tab.id, e);
        return 'skipped';
    }
}

/**
 * Make every open Gmail tab work, without the user reloading any of them.
 *
 * One tab that cannot be reached must not stop the rest, so each is handled
 * independently and none of them rejects.
 */
async function adoptOpenGmailTabs(tabs?: chrome.tabs.Tab[]): Promise<Adoption[]> {
    const open = tabs ?? (await findGmailTabs());
    return Promise.all(open.map((tab) => adoptGmailTab(tab)));
}

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
 * Reaching the open Gmail tabs is not new behaviour bolted on for the tour:
 * it is what makes the tab bar appear at all without the user reloading by
 * hand. The tour rides along with it.
 */
async function installOnboarding(): Promise<void> {
    const tabs = await findGmailTabs();

    if (tabs.length === 0) {
        // Nothing to run it over: the standalone page is the whole experience.
        await chrome.tabs.create({ url: 'welcome.html' });
        return;
    }

    // Set before the scripts arrive, not after: each one reads this flag as
    // it boots, and a flag written afterwards would be read by nobody.
    await setPendingOnboarding(true);

    await adoptOpenGmailTabs(tabs);

    const focus = tabs.find((t) => t.active) ?? tabs[0];
    if (focus && focus.id !== undefined) {
        catchChromeError(chrome.tabs.update(focus.id, { active: true }), (e) =>
            console.warn('Background: could not focus the Gmail tab:', e)
        );
    }
}

// Install and update hook: reach the Gmail tabs Chrome will not reach itself.
chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
        // The tour runs over Gmail when there is a Gmail tab to run it over,
        // because only there can the theme chooser retint the real bar. The
        // flag is how: an already-open Gmail tab is running no content script
        // yet, so a message sent now would reach nothing. The injection below
        // starts one, which then picks the flag up.
        installOnboarding().catch((e: unknown) =>
            console.warn('Background: could not set up the welcome tour:', e)
        );
        return;
    }

    if (details.reason === 'update') {
        // Measured on 2026-09-24, headless Chrome 141: this fires both when
        // the extension is updated and when an unpacked copy is reloaded from
        // chrome://extensions, the latter with `previousVersion` equal to the
        // version being installed. Both leave every open Gmail tab running an
        // orphaned script whose every `chrome.*` call throws, so both need
        // the same repair.
        adoptOpenGmailTabs().catch((e: unknown) =>
            console.warn('Background: could not reach the open Gmail tabs:', e)
        );
    }
});
