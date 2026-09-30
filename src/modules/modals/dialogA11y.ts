/**
 * dialogA11y.ts
 *
 * The accessibility contract every dialog this extension draws over Gmail
 * shares: announced as a modal dialog with a name, keyboard focus kept inside
 * it while it is open, and handed back to wherever it was when it closes.
 *
 * It also keeps our keystrokes out of Gmail. Gmail binds single-letter
 * shortcuts on the document ("c" composes, "#" deletes), so typing a tab
 * title into one of our inputs used to reach those handlers too. Key events
 * that start inside a dialog stop at the dialog.
 */

/** Everything that can take focus by keyboard, in document order. */
const FOCUSABLE = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
].join(',');

let nextLabelId = 0;

export interface DialogOptions {
    /** Called for Escape pressed inside the dialog, which no longer reaches the document. */
    onEscape?: () => void;
    /** Element to focus on open. Defaults to the dialog itself. */
    initialFocus?: HTMLElement | null;
}

function focusableIn(root: HTMLElement): HTMLElement[] {
    return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => !el.hidden);
}

/**
 * Make `root` a modal dialog named by `labelEl`.
 *
 * Returns the release function: it removes the trap and restores focus to
 * the element that had it before the dialog opened, if that element is still
 * in the page. Call it from the dialog's close path.
 */
export function makeDialog(root: HTMLElement, labelEl: HTMLElement | null, options: DialogOptions = {}): () => void {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    if (labelEl) {
        if (!labelEl.id) labelEl.id = `gmail-tabs-dialog-title-${++nextLabelId}`;
        root.setAttribute('aria-labelledby', labelEl.id);
    }
    if (!root.hasAttribute('tabindex')) root.setAttribute('tabindex', '-1');

    const onKeyDown = (e: KeyboardEvent): void => {
        // Our keystrokes are not Gmail's shortcuts.
        e.stopPropagation();

        if (e.key === 'Escape') {
            options.onEscape?.();
            return;
        }
        if (e.key !== 'Tab') return;

        const items = focusableIn(root);
        if (items.length === 0) {
            e.preventDefault();
            root.focus();
            return;
        }
        const first = items[0];
        const last = items[items.length - 1];
        const active = document.activeElement;
        if (e.shiftKey && (active === first || active === root)) {
            e.preventDefault();
            last.focus();
        } else if (!e.shiftKey && active === last) {
            e.preventDefault();
            first.focus();
        }
    };
    const stop = (e: Event): void => e.stopPropagation();

    root.addEventListener('keydown', onKeyDown);
    root.addEventListener('keypress', stop);
    root.addEventListener('keyup', stop);

    (options.initialFocus ?? root).focus();

    let released = false;
    return (): void => {
        if (released) return;
        released = true;
        root.removeEventListener('keydown', onKeyDown);
        root.removeEventListener('keypress', stop);
        root.removeEventListener('keyup', stop);
        if (previouslyFocused && previouslyFocused.isConnected) previouslyFocused.focus();
    };
}
