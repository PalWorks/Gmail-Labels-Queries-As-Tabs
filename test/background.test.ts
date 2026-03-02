/**
 * background.test.ts
 *
 * Unit tests for the background service worker.
 * Tests message handling for DOWNLOAD_FILE and UNINSTALL_SELF,
 * the install hook, and action click handler.
 */

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

let messageListeners: Array<(message: any, sender: any, sendResponse: any) => boolean> = [];
let installedListeners: Array<(details: any) => void> = [];
let actionClickListeners: Array<(tab: any) => void> = [];

const mockDownload = jest.fn();
const mockUninstallSelf = jest.fn();
const mockTabsCreate = jest.fn();
const mockTabsQuery = jest.fn();
const mockTabsReload = jest.fn();
const mockTabsSendMessage = jest.fn().mockResolvedValue(undefined);
const mockSetUninstallURL = jest.fn();

function setupChromeMocks(): void {
    messageListeners = [];
    installedListeners = [];
    actionClickListeners = [];

    (global as any).chrome = {
        runtime: {
            lastError: null,
            onMessage: { addListener: jest.fn((cb: any) => messageListeners.push(cb)) },
            onInstalled: { addListener: jest.fn((cb: any) => installedListeners.push(cb)) },
            setUninstallURL: mockSetUninstallURL,
        },
        downloads: { download: mockDownload },
        management: { uninstallSelf: mockUninstallSelf },
        action: { onClicked: { addListener: jest.fn((cb: any) => actionClickListeners.push(cb)) } },
        tabs: {
            create: mockTabsCreate,
            query: mockTabsQuery,
            reload: mockTabsReload,
            sendMessage: mockTabsSendMessage,
        },
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
    test('opens welcome page on fresh install', () => {
        mockTabsQuery.mockImplementation((_query: any, cb: any) => cb([]));

        installedListeners[0]({ reason: 'install' });

        expect(mockTabsCreate).toHaveBeenCalledWith({ url: 'welcome.html' });
    });

    test('reloads open Gmail tabs on fresh install', () => {
        mockTabsQuery.mockImplementation((_query: any, cb: any) => cb([{ id: 1 }, { id: 2 }]));

        installedListeners[0]({ reason: 'install' });

        expect(mockTabsReload).toHaveBeenCalledWith(1);
        expect(mockTabsReload).toHaveBeenCalledWith(2);
    });

    test('does nothing on update', () => {
        installedListeners[0]({ reason: 'update' });

        expect(mockTabsCreate).not.toHaveBeenCalled();
    });
});

// ---------------------------------------------------------------------------
// Action click handler
// ---------------------------------------------------------------------------

describe('action click handler', () => {
    test('sends TOGGLE_SETTINGS message to the active tab', () => {
        actionClickListeners[0]({ id: 42 });

        expect(mockTabsSendMessage).toHaveBeenCalledWith(42, { action: 'TOGGLE_SETTINGS' });
    });
});

// ---------------------------------------------------------------------------
// Uninstall URL
// ---------------------------------------------------------------------------

describe('uninstall URL', () => {
    test('sets feedback URL on startup', () => {
        expect(mockSetUninstallURL).toHaveBeenCalledWith(
            expect.stringContaining('tally.so'),
            expect.any(Function)
        );
    });
});
