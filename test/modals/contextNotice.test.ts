export {};
/**
 * contextNotice.test.ts
 *
 * The notice itself. Two modals render it now, so the wording and the
 * idempotence live in one place and are asserted in one place.
 */

import {
    renderContextInvalidatedNotice,
    reportSettingsWriteFailure,
    RELOAD_BUTTON_ID,
    WRITE_FAILURE_NOTICE_ID,
} from '../../src/modules/modals/contextNotice';

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

// ---------------------------------------------------------------------------
// reportSettingsWriteFailure
// ---------------------------------------------------------------------------

describe('reportSettingsWriteFailure', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    test('a full sync quota says what is full and what to remove', () => {
        reportSettingsWriteFailure(new Error('QUOTA_BYTES quota exceeded'));
        const notice = document.getElementById(WRITE_FAILURE_NOTICE_ID)!;
        expect(notice.getAttribute('role')).toBe('alert');
        expect(notice.textContent).toContain(
            'Settings are full: Chrome sync allows about 8 KB per account. Remove some tabs or rules.'
        );
    });

    test('any other failure says to retry, and the notice dismisses', () => {
        reportSettingsWriteFailure(new Error('boom'));
        const notice = document.getElementById(WRITE_FAILURE_NOTICE_ID)!;
        expect(notice.textContent).toContain('Could not save that change. Try again, or reload Gmail.');
        (notice.querySelector('button') as HTMLElement).click();
        expect(document.getElementById(WRITE_FAILURE_NOTICE_ID)).toBeNull();
    });

    test('a second failure replaces the first rather than stacking', () => {
        reportSettingsWriteFailure(new Error('one'));
        reportSettingsWriteFailure(new Error('two'));
        expect(document.querySelectorAll(`#${WRITE_FAILURE_NOTICE_ID}`)).toHaveLength(1);
    });

    test('a dead context gets the reload notice, once', () => {
        reportSettingsWriteFailure(new Error('Extension context invalidated.'));
        reportSettingsWriteFailure(new Error('Extension context invalidated.'));
        expect(document.querySelectorAll(`#${RELOAD_BUTTON_ID}`)).toHaveLength(1);
        expect(document.getElementById(WRITE_FAILURE_NOTICE_ID)).toBeNull();
    });
});
