export {};
/**
 * handover.test.ts
 *
 * Two copies of the content script in one page is not a hypothetical: it is
 * what every extension update creates, because Chrome leaves the old copy
 * running in the tab and the worker then injects a new one. These tests are
 * the contract between them.
 */

import { claimPage, removeOurPageFurniture, STAND_DOWN_EVENT } from '../src/modules/handover';
import { TABS_BAR_ID } from '../src/modules/state';

/** Put on screen everything a running copy of the extension leaves behind. */
function buildPageFurniture(): void {
    document.body.innerHTML = `
        <div id="gmails-own-toolbar"><span class="gmail-thing">Gmail</span></div>
        <div id="${TABS_BAR_ID}"><button>Inbox</button></div>
        <div class="gmail-tabs-modal"><div class="modal-content">Settings</div></div>
        <div class="gmail-tab-dropdown show">Edit</div>
        <div class="glt-ob-scrim">Welcome</div>
        <div class="color-popover">Colours</div>
    `;
}

beforeEach(() => {
    document.body.innerHTML = '';
});

describe('a copy arriving in a page that already has one', () => {
    test('tells the copy already there to stand down', () => {
        const first = jest.fn();
        claimPage(first);

        claimPage(jest.fn());

        expect(first).toHaveBeenCalledTimes(1);
    });

    test('does not hear its own announcement', () => {
        // The announcement goes out before the listener is registered. Get
        // that order wrong and every copy shuts itself down on arrival, which
        // is an extension that works until it is updated and then never again.
        const arriving = jest.fn();

        claimPage(arriving);

        expect(arriving).not.toHaveBeenCalled();
    });

    test('clears what the previous copy left on screen', () => {
        buildPageFurniture();

        claimPage(jest.fn());

        expect(document.getElementById(TABS_BAR_ID)).toBeNull();
        expect(document.querySelector('.gmail-tabs-modal')).toBeNull();
        expect(document.querySelector('.gmail-tab-dropdown')).toBeNull();
        expect(document.querySelector('.glt-ob-scrim')).toBeNull();
        expect(document.querySelector('.color-popover')).toBeNull();
    });

    test('leaves Gmail alone', () => {
        buildPageFurniture();

        claimPage(jest.fn());

        expect(document.getElementById('gmails-own-toolbar')).not.toBeNull();
        expect(document.querySelector('.gmail-thing')).not.toBeNull();
    });

    test('stands a copy down once, not once per later arrival', () => {
        const first = jest.fn();
        claimPage(first);
        claimPage(jest.fn());
        claimPage(jest.fn());

        expect(first).toHaveBeenCalledTimes(1);
    });

    test('hands the page on down a chain of copies', () => {
        const first = jest.fn();
        const second = jest.fn();
        claimPage(first);
        claimPage(second);

        claimPage(jest.fn());

        expect(first).toHaveBeenCalledTimes(1);
        expect(second).toHaveBeenCalledTimes(1);
    });

    test('still clears the page when the announcement itself fails', () => {
        buildPageFurniture();
        const dispatch = jest.spyOn(document, 'dispatchEvent').mockImplementation(() => {
            throw new Error('no events here');
        });

        expect(() => claimPage(jest.fn())).not.toThrow();

        expect(document.getElementById(TABS_BAR_ID)).toBeNull();
        dispatch.mockRestore();
    });
});

describe('removeOurPageFurniture', () => {
    test('removes every element the extension adds, including duplicates', () => {
        buildPageFurniture();
        document.body.appendChild(Object.assign(document.createElement('div'), { className: 'gmail-tabs-modal' }));

        removeOurPageFurniture();

        expect(document.querySelectorAll('.gmail-tabs-modal')).toHaveLength(0);
    });

    test('is safe on a page holding none of it', () => {
        document.body.innerHTML = '<div id="gmails-own-toolbar"></div>';

        expect(() => removeOurPageFurniture()).not.toThrow();
        expect(document.getElementById('gmails-own-toolbar')).not.toBeNull();
    });
});

describe('the event name', () => {
    test('is namespaced, because it is dispatched on a page Gmail owns', () => {
        expect(STAND_DOWN_EVENT.startsWith('gmailTabs:')).toBe(true);
    });
});
