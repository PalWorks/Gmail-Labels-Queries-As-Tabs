export {};
/**
 * background.test.ts
 *
 * Unit tests for the background service worker.
 * Tests message handling for DOWNLOAD_FILE and UNINSTALL_SELF,
 * the install hook, and action click handler.
 */

import * as fs from 'fs';
import * as path from 'path';
import { flush } from './helpers/async';

// ---------------------------------------------------------------------------
// Mock InboxSDK background import (no-op)
// ---------------------------------------------------------------------------

jest.mock('@inboxsdk/core/background.js', () => ({}));

// Polyfill TextEncoder for jsdom
if (typeof global.TextEncoder === 'undefined') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { TextEncoder } = require('util');
    global.TextEncoder = TextEncoder;
}

// ---------------------------------------------------------------------------
// Mock chrome APIs
// ---------------------------------------------------------------------------

const syncStore: Record<string, any> = {};
const localStore: Record<string, any> = {};

/** Minimal async chrome.storage area, so the mutation queue has somewhere to write. */
function makeArea(store: Record<string, any>) {
    return {
        get: jest.fn((keys: any, cb: any) => {
            void Promise.resolve().then(() => {
                if (keys === null) return cb({ ...store });
                const arr = typeof keys === 'string' ? [keys] : keys;
                const out: Record<string, any> = {};
                arr.forEach((k: string) => {
                    if (store[k] !== undefined) out[k] = store[k];
                });
                cb(out);
            });
        }),
        set: jest.fn((items: Record<string, any>, cb?: any) => {
            void Promise.resolve().then(() => {
                Object.assign(store, items);
                if (cb) cb();
            });
        }),
        remove: jest.fn((k: string, cb?: any) => {
            void Promise.resolve().then(() => {
                delete store[k];
                if (cb) cb();
            });
        }),
    };
}

let messageListeners: Array<(message: any, sender: any, sendResponse: any) => boolean> = [];
let installedListeners: Array<(details: any) => void> = [];

const mockDownload = jest.fn();
const mockUninstallSelf = jest.fn();
const mockTabsCreate = jest.fn().mockResolvedValue({ id: 99 });
/**
 * The worker awaits chrome.tabs.query rather than passing a callback, so the
 * double has to answer in the promise form. Tests set `gmailTabs` to say what
 * is open.
 */
let gmailTabs: any[] = [];
const mockTabsQuery = jest.fn((_query: any, cb?: any) => {
    if (typeof cb === 'function') {
        cb(gmailTabs);
        return undefined;
    }
    return Promise.resolve(gmailTabs);
});
const mockTabsReload = jest.fn().mockResolvedValue(undefined);
const mockTabsUpdate = jest.fn().mockResolvedValue(undefined);
const mockWindowsUpdate = jest.fn().mockResolvedValue(undefined);
const mockTabsSendMessage = jest.fn().mockResolvedValue(undefined);
const mockSetUninstallURL = jest.fn();

function setupChromeMocks(): void {
    Object.keys(syncStore).forEach((k) => delete syncStore[k]);
    Object.keys(localStore).forEach((k) => delete localStore[k]);
    messageListeners = [];
    installedListeners = [];
    gmailTabs = [];

    (global as any).chrome = {
        runtime: {
            lastError: null,
            onMessage: { addListener: jest.fn((cb: any) => messageListeners.push(cb)) },
            onInstalled: { addListener: jest.fn((cb: any) => installedListeners.push(cb)) },
            setUninstallURL: mockSetUninstallURL,
        },
        downloads: { download: mockDownload },
        management: { uninstallSelf: mockUninstallSelf },
        // The toolbar icon opens a popup now, so chrome.action.onClicked never
        // fires. The stub stays so registering a listener would still be seen.
        action: { onClicked: { addListener: jest.fn() } },
        storage: { sync: makeArea(syncStore), local: makeArea(localStore) },
        tabs: {
            create: mockTabsCreate,
            query: mockTabsQuery,
            reload: mockTabsReload,
            update: mockTabsUpdate,
            sendMessage: mockTabsSendMessage,
        },
        windows: { update: mockWindowsUpdate },
    };
}

// ---------------------------------------------------------------------------
// Setup: fresh chrome mocks + fresh module import per test
// ---------------------------------------------------------------------------

beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    setupChromeMocks();

    jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require('../src/background');
    });
});

// ---------------------------------------------------------------------------
// DOWNLOAD_FILE handler
// ---------------------------------------------------------------------------

describe('DOWNLOAD_FILE handler', () => {
    test('triggers chrome.downloads.download with base64 data URL', () => {
        const sendResponse = jest.fn();

        mockDownload.mockImplementation((_opts: any, cb: any) => cb(123));

        messageListeners[0](
            { action: 'DOWNLOAD_FILE', data: '{"tabs":[]}', filename: 'export.json' },
            {},
            sendResponse
        );

        expect(mockDownload).toHaveBeenCalledWith(
            expect.objectContaining({
                filename: 'export.json',
                saveAs: false,
                conflictAction: 'uniquify',
            }),
            expect.any(Function)
        );
        expect(sendResponse).toHaveBeenCalledWith({ success: true, downloadId: 123 });
    });

    test('returns error response when download API reports failure', () => {
        const sendResponse = jest.fn();

        mockDownload.mockImplementation((_opts: any, cb: any) => {
            (global as any).chrome.runtime.lastError = { message: 'Download blocked' };
            cb(undefined);
        });

        messageListeners[0](
            { action: 'DOWNLOAD_FILE', data: '{}', filename: 'test.json' },
            {},
            sendResponse
        );

        expect(sendResponse).toHaveBeenCalledWith({ success: false, error: 'Download blocked' });
    });

    test('returns error when chrome.downloads API is unavailable', () => {
        const sendResponse = jest.fn();
        const origDownloads = (global as any).chrome.downloads;
        delete (global as any).chrome.downloads;

        messageListeners[0](
            { action: 'DOWNLOAD_FILE', data: '{}', filename: 'test.json' },
            {},
            sendResponse
        );

        expect(sendResponse).toHaveBeenCalledWith(
            expect.objectContaining({ success: false })
        );

        (global as any).chrome.downloads = origDownloads;
    });

    test('returns true to keep channel open for async response', () => {
        mockDownload.mockImplementation((_opts: any, cb: any) => cb(1));

        const result = messageListeners[0](
            { action: 'DOWNLOAD_FILE', data: '{}', filename: 'f.json' },
            {},
            jest.fn()
        );

        expect(result).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// UNINSTALL_SELF handler
// ---------------------------------------------------------------------------

describe('UNINSTALL_SELF handler', () => {
    test('calls chrome.management.uninstallSelf with confirmation dialog', () => {
        messageListeners[0]({ action: 'UNINSTALL_SELF' }, {}, jest.fn());

        expect(mockUninstallSelf).toHaveBeenCalledWith(
            { showConfirmDialog: true },
            expect.any(Function)
        );
    });
});

// ---------------------------------------------------------------------------
// Install hook
// ---------------------------------------------------------------------------

describe('onInstalled handler', () => {
    test('opens the standalone page when there is no Gmail tab to run the tour over', async () => {
        gmailTabs = [];

        installedListeners[0]({ reason: 'install' });
        await flush();

        expect(mockTabsCreate).toHaveBeenCalledWith({ url: 'welcome.html' });
    });

    test('reloads open Gmail tabs, which is what makes the tab bar appear', async () => {
        gmailTabs = [{ id: 1 }, { id: 2 }];

        installedListeners[0]({ reason: 'install' });
        await flush();

        expect(mockTabsReload).toHaveBeenCalledWith(1);
        expect(mockTabsReload).toHaveBeenCalledWith(2);
    });

    test('leaves the tour flag for the reloaded tab to pick up', async () => {
        // The worker cannot message those tabs: until they reload they are
        // running no content script, so the message would reach nothing.
        gmailTabs = [{ id: 1, active: true }];

        installedListeners[0]({ reason: 'install' });
        await flush();

        expect(localStore.pendingOnboarding).toBe(true);
        expect(mockTabsSendMessage).not.toHaveBeenCalled();
    });

    test('does not also open the standalone page when Gmail is open', async () => {
        gmailTabs = [{ id: 1 }];

        installedListeners[0]({ reason: 'install' });
        await flush();

        expect(mockTabsCreate).not.toHaveBeenCalled();
    });

    test('does nothing on update', async () => {
        installedListeners[0]({ reason: 'update' });
        await flush();

        expect(mockTabsCreate).not.toHaveBeenCalled();
        expect(localStore.pendingOnboarding).toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// START_TOUR
//
// The toolbar menu and the options page both send this. Unlike install, the
// content script is already running by now, so the tour can be shown directly.
// ---------------------------------------------------------------------------

describe('START_TOUR handler', () => {
    test('shows the tour in the Gmail tab the user is looking at', async () => {
        gmailTabs = [
            { id: 7, windowId: 3 },
            { id: 8, windowId: 4, active: true },
        ];
        const sendResponse = jest.fn();

        const held = messageListeners[0]({ action: 'START_TOUR' }, {}, sendResponse);
        await flush();

        expect(held).toBe(true);
        expect(mockTabsSendMessage).toHaveBeenCalledWith(8, { action: 'SHOW_ONBOARDING' });
        expect(mockTabsUpdate).toHaveBeenCalledWith(8, { active: true });
        expect(mockWindowsUpdate).toHaveBeenCalledWith(4, { focused: true });
        expect(mockTabsCreate).not.toHaveBeenCalled();
    });

    test('falls back to any Gmail tab when none is active', async () => {
        gmailTabs = [{ id: 7, windowId: 3 }];

        messageListeners[0]({ action: 'START_TOUR' }, {}, jest.fn());
        await flush();

        expect(mockTabsSendMessage).toHaveBeenCalledWith(7, { action: 'SHOW_ONBOARDING' });
    });

    test('falls back to the standalone page when there is no Gmail tab', async () => {
        gmailTabs = [];

        messageListeners[0]({ action: 'START_TOUR' }, {}, jest.fn());
        await flush();

        expect(mockTabsCreate).toHaveBeenCalledWith({ url: 'welcome.html' });
    });

    test('falls back to the page when the Gmail tab has no content script yet', async () => {
        // A tab open since before the install answers nothing. Doing nothing
        // at all here is the failure mode this whole release is about.
        gmailTabs = [{ id: 7, windowId: 3, active: true }];
        mockTabsSendMessage.mockRejectedValueOnce(new Error('Receiving end does not exist.'));

        messageListeners[0]({ action: 'START_TOUR' }, {}, jest.fn());
        await flush();

        expect(mockTabsCreate).toHaveBeenCalledWith({ url: 'welcome.html' });
    });

    test('answers, so the popup is not left waiting on a dead channel', async () => {
        gmailTabs = [];
        const sendResponse = jest.fn();

        messageListeners[0]({ action: 'START_TOUR' }, {}, sendResponse);
        await flush();

        expect(sendResponse).toHaveBeenCalledWith({ ok: true });
    });
});

// ---------------------------------------------------------------------------
// Uninstall URL
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// OPEN_OPTIONS_PAGE: the content script cannot do this itself
// ---------------------------------------------------------------------------

describe('OPEN_OPTIONS_PAGE handler', () => {
    test('opens the options page and holds the channel open for the reply', async () => {
        const openOptionsPage = jest.fn();
        (global as any).chrome.runtime.openOptionsPage = openOptionsPage;
        const sendResponse = jest.fn();

        const held = messageListeners[0]({ action: 'OPEN_OPTIONS_PAGE' }, {}, sendResponse);

        expect(openOptionsPage).toHaveBeenCalledTimes(1);
        // The openers can reject rather than throw, so the reply has to wait
        // for them. Returning false here would close the channel before the
        // answer existed.
        expect(held).toBe(true);
        await flush();
        expect(sendResponse).toHaveBeenCalledWith({ ok: true });
    });

    test('falls back to a new tab where openOptionsPage is unavailable', async () => {
        (global as any).chrome.runtime.openOptionsPage = undefined;
        (global as any).chrome.runtime.getURL = (p: string) => `chrome-extension://id/${p}`;
        const sendResponse = jest.fn();

        messageListeners[0]({ action: 'OPEN_OPTIONS_PAGE' }, {}, sendResponse);
        await flush();

        expect(mockTabsCreate).toHaveBeenCalledWith({ url: 'chrome-extension://id/options.html' });
        expect(sendResponse).toHaveBeenCalledWith({ ok: true });
    });

    test('reports a thrown failure rather than throwing at the sender', async () => {
        (global as any).chrome.runtime.openOptionsPage = () => {
            throw new Error('nope');
        };
        const sendResponse = jest.fn();

        expect(() => messageListeners[0]({ action: 'OPEN_OPTIONS_PAGE' }, {}, sendResponse)).not.toThrow();
        await flush();
        expect(sendResponse).toHaveBeenCalledWith({ ok: false, error: 'nope' });
    });

    test('reports a rejected open, which the old synchronous try/catch called success', async () => {
        // This is the regression the async rewrite exists for. chrome.tabs
        // and chrome.runtime reject their promises; they do not throw. The
        // handler used to sendResponse({ ok: true }) alongside a rejection
        // nobody was holding, so a failed open reported success and left an
        // unhandled rejection in the worker.
        (global as any).chrome.runtime.openOptionsPage = jest.fn().mockRejectedValue(new Error('no window'));
        const sendResponse = jest.fn();

        messageListeners[0]({ action: 'OPEN_OPTIONS_PAGE' }, {}, sendResponse);
        await flush();

        expect(sendResponse).toHaveBeenCalledWith({ ok: false, error: 'no window' });
    });
});

describe('uninstall URL', () => {
    test('is set, so uninstalling can ask why', () => {
        expect(mockSetUninstallURL).toHaveBeenCalledTimes(1);
        expect(mockSetUninstallURL.mock.calls[0][0]).toMatch(/^https:\/\//);
    });

    test('carries no account address, settings or identifier in the URL', () => {
        // Chrome appends nothing of its own, so whatever is in this string is
        // the entire payload. It must stay a bare form link: the host is
        // entitled to learn that someone uninstalled, not who.
        const url = new URL(mockSetUninstallURL.mock.calls[0][0]);
        for (const [key, value] of url.searchParams) {
            expect(value).not.toMatch(/@/); // no email
            expect(key).not.toMatch(/mail|user|account|id$|token/i);
        }
        expect(url.pathname + url.search).not.toMatch(/@/);
    });

    test('is the only third-party host the service worker names', () => {
        // `mail.google.com` is the extension's own operating origin, declared
        // in the manifest. Anything else is a third party and must be here on
        // purpose, not by accident.
        const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'background.ts'), 'utf8');
        const urls = source.match(/https?:\/\/[^\s'"`)]+/g) ?? [];
        const hosts = new Set(urls.map((u) => new URL(u).host));
        hosts.delete('mail.google.com');
        expect([...hosts]).toEqual([new URL(mockSetUninstallURL.mock.calls[0][0]).host]);
    });
});

// ---------------------------------------------------------------------------
// MUTATE_SETTINGS handler: the single writer for account settings
// ---------------------------------------------------------------------------

describe('MUTATE_SETTINGS handler', () => {
    function send(message: any): Promise<any> {
        return new Promise((resolve) => {
            const held = messageListeners[0](message, {}, resolve);
            expect(held).toBe(true); // must hold the channel open for the async reply
        });
    }

    const tab = (id: string) => ({ id, title: id, type: 'label' as const, value: id });

    test('applies an op and answers with the written settings', async () => {
        const response = await send({
            action: 'MUTATE_SETTINGS',
            accountId: 'user@gmail.com',
            op: { kind: 'addTab', tab: tab('work') },
        });

        expect(response.ok).toBe(true);
        expect(response.settings.tabs.map((t: any) => t.id)).toContain('work');
        expect(response.settings.rev).toBe(1);
        expect(syncStore['account_user@gmail.com']).toBeDefined();
    });

    test('serializes concurrent mutations for the same account', async () => {
        const responses = await Promise.all([
            send({ action: 'MUTATE_SETTINGS', accountId: 'a@b.com', op: { kind: 'addTab', tab: tab('one') } }),
            send({ action: 'MUTATE_SETTINGS', accountId: 'a@b.com', op: { kind: 'addTab', tab: tab('two') } }),
            send({ action: 'MUTATE_SETTINGS', accountId: 'a@b.com', op: { kind: 'addTab', tab: tab('three') } }),
        ]);

        expect(responses.every((r) => r.ok)).toBe(true);
        const ids = syncStore['account_a@b.com'].tabs.map((t: any) => t.id);
        expect(ids).toEqual(expect.arrayContaining(['one', 'two', 'three']));
        expect(syncStore['account_a@b.com'].rev).toBe(3);
    });

    test('reports failure rather than throwing', async () => {
        const response = await send({
            action: 'MUTATE_SETTINGS',
            accountId: 'user@gmail.com',
            op: { kind: 'nonsense' } as any,
        });
        // An unknown op reduces to undefined, which cannot be written.
        expect(response.ok).toBe(false);
        expect(typeof response.error).toBe('string');
    });
});

// ---------------------------------------------------------------------------
// Message channel discipline
// ---------------------------------------------------------------------------

describe('message channel', () => {
    test('does not hold the channel open for messages it does not handle', () => {
        const held = messageListeners[0]({ action: 'SOMETHING_ELSE' }, {}, jest.fn());
        expect(held).toBe(false);
    });

    test('does not hold the channel open for UNINSTALL_SELF', () => {
        const held = messageListeners[0]({ action: 'UNINSTALL_SELF' }, {}, jest.fn());
        expect(held).toBe(false);
    });
});
