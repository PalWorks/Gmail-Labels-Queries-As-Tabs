export {};
/**
 * contextNotice.test.ts
 *
 * The notice itself. Two modals render it now, so the wording and the
 * idempotence live in one place and are asserted in one place.
 */

import { renderContextInvalidatedNotice, RELOAD_BUTTON_ID } from '../../src/modules/modals/contextNotice';

function makeContent(): HTMLElement {
    document.body.innerHTML = '<div class="gmail-tabs-modal"><div class="modal-content">original</div></div>';
    return document.querySelector('.modal-content') as HTMLElement;
}

describe('renderContextInvalidatedNotice', () => {
    test('replaces the modal contents with the reload notice', () => {
        const content = makeContent();
        renderContextInvalidatedNotice(content, jest.fn());

        expect(content.textContent).not.toContain('original');
        expect(content.querySelector('h3')?.textContent).toBe('Reload Gmail to continue');
        expect(content.querySelector(`#${RELOAD_BUTTON_ID}`)).not.toBeNull();
    });

    test('says the data is safe, because that is the first thing anyone asks', () => {
        const content = makeContent();
        renderContextInvalidatedNotice(content, jest.fn());

        expect(content.textContent).toContain('Your tabs, rules and settings are untouched.');
    });

    test('names the cause, so it does not read as data loss', () => {
        const content = makeContent();
        renderContextInvalidatedNotice(content, jest.fn());

        expect(content.textContent).toMatch(/updated or reloaded while the tab was open/);
    });

    test('is idempotent, so several failing controls cannot stack it', () => {
        const content = makeContent();
        const close = jest.fn();
        renderContextInvalidatedNotice(content, close);
        const firstButton = content.querySelector(`#${RELOAD_BUTTON_ID}`);

        renderContextInvalidatedNotice(content, close);

        expect(content.querySelectorAll(`#${RELOAD_BUTTON_ID}`).length).toBe(1);
        // The same node: a re-render would have discarded its click handler.
        expect(content.querySelector(`#${RELOAD_BUTTON_ID}`)).toBe(firstButton);
    });

    test('the close button dismisses the modal the caller owns', () => {
        const content = makeContent();
        const close = jest.fn();
        renderContextInvalidatedNotice(content, close);

        (content.querySelector('.close-btn') as HTMLElement).click();

        expect(close).toHaveBeenCalledTimes(1);
    });

    // Not asserted: that the button calls location.reload(). jsdom 27 makes
    // window.location.reload read-only and non-configurable, so there is no
    // honest way to observe it here. The handler is a single call with no
    // branch; the live click-through covers it.
    test('the reload button is the primary action, not a secondary one', () => {
        const content = makeContent();
        renderContextInvalidatedNotice(content, jest.fn());

        expect(content.querySelector(`#${RELOAD_BUTTON_ID}`)?.className).toContain('primary-btn');
    });
});
