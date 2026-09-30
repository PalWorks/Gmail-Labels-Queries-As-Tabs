export {};
/**
 * dialogA11y.test.ts
 *
 * The shared dialog contract: named modal dialog, focus kept inside while
 * open and returned on close, and keystrokes kept away from Gmail.
 */

import { makeDialog } from '../../src/modules/modals/dialogA11y';

function mountDialog(): {
    opener: HTMLButtonElement;
    root: HTMLElement;
    title: HTMLElement;
    first: HTMLButtonElement;
    last: HTMLButtonElement;
} {
    document.body.innerHTML = '';
    const opener = document.createElement('button');
    opener.textContent = 'open';
    document.body.appendChild(opener);
    opener.focus();

    const root = document.createElement('div');
    const title = document.createElement('h3');
    title.textContent = 'Title';
    const first = document.createElement('button');
    first.textContent = 'first';
    const last = document.createElement('button');
    last.textContent = 'last';
    root.append(title, first, last);
    document.body.appendChild(root);
    return { opener, root, title, first, last };
}

function tab(target: HTMLElement, shiftKey = false): KeyboardEvent {
    const e = new KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true, cancelable: true });
    target.dispatchEvent(e);
    return e;
}

describe('makeDialog', () => {
    test('announces a named modal dialog', () => {
        const { root, title } = mountDialog();
        makeDialog(root, title);
        expect(root.getAttribute('role')).toBe('dialog');
        expect(root.getAttribute('aria-modal')).toBe('true');
        expect(title.id).not.toBe('');
        expect(root.getAttribute('aria-labelledby')).toBe(title.id);
    });

    test('moves focus in, and Tab wraps at both ends', () => {
        const { root, title, first, last } = mountDialog();
        makeDialog(root, title, { initialFocus: first });
        expect(document.activeElement).toBe(first);

        last.focus();
        expect(tab(last).defaultPrevented).toBe(true);
        expect(document.activeElement).toBe(first);

        expect(tab(first, true).defaultPrevented).toBe(true);
        expect(document.activeElement).toBe(last);
    });

    test('release returns focus to where it was before opening', () => {
        const { opener, root, title, first } = mountDialog();
        const release = makeDialog(root, title, { initialFocus: first });
        release();
        expect(document.activeElement).toBe(opener);
    });

    test('keystrokes inside the dialog do not reach Gmail, and Escape still closes', () => {
        const { root, title, first } = mountDialog();
        const onEscape = jest.fn();
        makeDialog(root, title, { onEscape, initialFocus: first });
        const gmail = jest.fn();
        document.addEventListener('keydown', gmail);
        document.addEventListener('keypress', gmail);

        first.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', bubbles: true }));
        first.dispatchEvent(new KeyboardEvent('keypress', { key: 'c', bubbles: true }));
        first.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

        expect(gmail).not.toHaveBeenCalled();
        expect(onEscape).toHaveBeenCalledTimes(1);
        document.removeEventListener('keydown', gmail);
        document.removeEventListener('keypress', gmail);
    });
});
