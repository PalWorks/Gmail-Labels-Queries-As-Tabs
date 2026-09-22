export {};
/**
 * popup.test.ts
 *
 * The toolbar menu.
 *
 * Before v1.6.0 clicking the toolbar icon toggled the settings modal and did
 * nothing at all outside Gmail. The menu is the cost of having somewhere to
 * put the tour, so the tests that matter are: the common action is still one
 * click away, and no entry is ever a dead button.
 */

import * as fs from 'fs';
import * as path from 'path';

const mockSendMessage = jest.fn();
const mockTabsQuery = jest.fn();
const mockTabsCreate = jest.fn();
const mockTabsSendMessage = jest.fn();
const mockClose = jest.fn();

/** The real markup, so a renamed id fails here rather than in the wild. */
function loadPopupDOM(): void {
    const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'popup.html'), 'utf8');
    const body = /<body>([\s\S]*?)<\/body>/.exec(html);
    document.body.innerHTML = (body ? body[1] : '').replace(/<script[\s\S]*?<\/script>/g, '');
}

function loadPopup(): void {
    jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require('../src/popup');
    });
    document.dispatchEvent(new Event('DOMContentLoaded'));
}

beforeEach(() => {
    jest.clearAllMocks();
    (global as any).chrome = {
        runtime: { id: 'abcdef', sendMessage: mockSendMessage },
        tabs: { query: mockTabsQuery, create: mockTabsCreate, sendMessage: mockTabsSendMessage },
    };
    mockSendMessage.mockReturnValue(undefined);
    mockTabsQuery.mockImplementation((_q: any, cb: any) => cb([{ id: 5, url: 'https://mail.google.com/mail/u/0/' }]));
    (window as any).close = mockClose;
    loadPopupDOM();
});

describe('the menu itself', () => {
    test('every entry exists in the shipped markup', () => {
        loadPopup();
        for (const id of ['popup-configure', 'popup-tour', 'popup-settings', 'popup-help']) {
            expect(document.getElementById(id)).not.toBeNull();
        }
    });

    test('configure tabs is first, because it is what people came for', () => {
        // The menu costs that action an extra click. Putting it anywhere but
        // first would cost it two.
        loadPopup();
        const first = document.querySelector('.popup-item');
        expect(first?.id).toBe('popup-configure');
    });
});

describe('on a Gmail tab', () => {
    test('configure tabs opens the modal in that tab', () => {
        loadPopup();
        (document.getElementById('popup-configure') as HTMLElement).click();

        expect(mockTabsSendMessage).toHaveBeenCalledWith(5, { action: 'TOGGLE_SETTINGS' });
        expect(mockClose).toHaveBeenCalled();
    });

    test('the tour is handed to the worker, which decides where to show it', () => {
        loadPopup();
        (document.getElementById('popup-tour') as HTMLElement).click();

        expect(mockSendMessage).toHaveBeenCalledWith({ action: 'START_TOUR' });
    });
});

describe('anywhere else', () => {
    beforeEach(() => {
        mockTabsQuery.mockImplementation((_q: any, cb: any) => cb([{ id: 9, url: 'https://example.com/' }]));
    });

    test('configure tabs says it will open Gmail first, rather than failing silently', () => {
        loadPopup();
        expect(document.getElementById('popup-configure-note')?.textContent).toBe('Opens Gmail first');
    });

    test('and it does open Gmail', () => {
        loadPopup();
        (document.getElementById('popup-configure') as HTMLElement).click();

        expect(mockTabsCreate).toHaveBeenCalledWith({ url: 'https://mail.google.com/' });
        expect(mockTabsSendMessage).not.toHaveBeenCalled();
    });

    test('the tour still works, because the worker falls back to the page', () => {
        loadPopup();
        (document.getElementById('popup-tour') as HTMLElement).click();

        expect(mockSendMessage).toHaveBeenCalledWith({ action: 'START_TOUR' });
    });
});

describe('the quiet entries', () => {
    test('settings asks the worker for the options page', () => {
        loadPopup();
        (document.getElementById('popup-settings') as HTMLElement).click();

        expect(mockSendMessage).toHaveBeenCalledWith({ action: 'OPEN_OPTIONS_PAGE' });
    });

    test('help lands on the contact section rather than wherever it was left', () => {
        loadPopup();
        (document.getElementById('popup-help') as HTMLElement).click();

        expect(mockSendMessage).toHaveBeenCalledWith({ action: 'OPEN_OPTIONS_PAGE', hash: '#contact' });
    });
});

describe('failure', () => {
    test('a rejected message is reported, not dropped', async () => {
        const error = jest.spyOn(console, 'error').mockImplementation(() => {});
        mockSendMessage.mockReturnValue(Promise.reject(new Error('no worker')));

        loadPopup();
        (document.getElementById('popup-tour') as HTMLElement).click();
        for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));

        expect(error).toHaveBeenCalled();
        error.mockRestore();
    });

    test('the callback form of sendMessage does not throw', () => {
        // Chrome returns undefined when a callback is passed, and so do the
        // doubles. undefined.catch would take the popup down.
        mockSendMessage.mockReturnValue(undefined);
        loadPopup();
        expect(() => (document.getElementById('popup-settings') as HTMLElement).click()).not.toThrow();
    });
});
