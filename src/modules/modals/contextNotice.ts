/**
 * contextNotice.ts
 *
 * The one message every in-Gmail modal shows once it discovers it is running
 * in an orphaned content script.
 *
 * It lives on its own because more than one modal needs it and the wording is
 * the whole value. An orphaned script cannot re-establish itself, so a modal
 * that keeps its controls on screen is offering twelve buttons that each do
 * nothing. Replacing the contents with the single action that will help is
 * the honest response, and it has to read the same wherever it appears.
 *
 * It also owns the notice for a settings write that failed for any other
 * reason, and the guard every async modal control runs through, so a failed
 * click always ends in something the user can see. The production build
 * drops console output, so a failure that is only logged is a failure nobody
 * ever learns about.
 */

import { isContextInvalidatedError, isExtensionContextAlive } from '../extensionContext';

/** Marks a modal whose contents have already been replaced by this notice. */
export const RELOAD_BUTTON_ID = 'modal-reload-page';

/**
 * Replace a modal's `.modal-content` with the reload notice.
 *
 * Idempotent: a second call on a modal already showing the notice does
 * nothing, so several failing controls cannot stack it or wipe out the
 * handler already bound to the reload button.
 *
 * @param content The modal's `.modal-content` element.
 * @param close   How to dismiss this particular modal.
 */
export function renderContextInvalidatedNotice(content: Element, close: () => void): void {
    if (content.querySelector(`#${RELOAD_BUTTON_ID}`)) return;

    content.innerHTML = `
        <div class="modal-header">
            <h3>Reload Gmail to continue</h3>
            <div class="modal-header-actions">
                <button type="button" class="close-btn" aria-label="Close">✕</button>
            </div>
        </div>
        <div class="modal-body">
            <p class="context-invalidated-message">This tab is still running an older copy of the
            extension, because the extension was updated or reloaded while the tab was open.
            Nothing here can save changes until the page is reloaded.</p>
            <p class="context-invalidated-message">Your tabs, rules and settings are untouched.</p>
            <button type="button" id="${RELOAD_BUTTON_ID}" class="primary-btn">Reload Gmail</button>
        </div>
    `;

    // A dialog labelled by the heading it just lost keeps its name.
    const labelledBy = content.getAttribute('aria-labelledby');
    const heading = content.querySelector('h3');
    if (labelledBy && heading) heading.id = labelledBy;

    content.querySelector(`#${RELOAD_BUTTON_ID}`)?.addEventListener('click', () => location.reload());
    content.querySelector('.close-btn')?.addEventListener('click', close);
}

// ---------------------------------------------------------------------------
// Settings write failures
// ---------------------------------------------------------------------------

/** Id of the page-level notice, so a second failure replaces the first. */
export const WRITE_FAILURE_NOTICE_ID = 'gmail-tabs-write-failure';

/** Shown when Chrome sync refuses a write because the account is full. */
export const QUOTA_FAILURE_MESSAGE =
    'Settings are full: Chrome sync allows about 8 KB per account. Remove some tabs or rules.';

/** Shown for any other failed write. */
export const GENERIC_FAILURE_MESSAGE = 'Could not save that change. Try again, or reload Gmail.';

function errorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    if (typeof error === 'string') return error;
    if (error && typeof error === 'object' && 'message' in error) {
        return String((error as { message: unknown }).message);
    }
    return '';
}

/**
 * Tell the user that a settings write failed, in the Gmail page itself.
 *
 * A dead context gets the reload notice, in a modal of its own when nothing
 * else is showing it. Anything else gets a small dismissible notice: a quota
 * error says what is full and what to remove, because "try again" will fail
 * the same way every time; the rest say to retry.
 */
export function reportSettingsWriteFailure(error: unknown): void {
    if (isContextInvalidatedError(error)) {
        if (document.getElementById(RELOAD_BUTTON_ID)) return;
        const modal = document.createElement('div');
        modal.className = 'gmail-tabs-modal';
        const content = document.createElement('div');
        content.className = 'modal-content';
        modal.appendChild(content);
        document.body.appendChild(modal);
        renderContextInvalidatedNotice(content, () => modal.remove());
        return;
    }

    const text = /QUOTA_BYTES/.test(errorMessage(error)) ? QUOTA_FAILURE_MESSAGE : GENERIC_FAILURE_MESSAGE;

    document.getElementById(WRITE_FAILURE_NOTICE_ID)?.remove();
    const notice = document.createElement('div');
    notice.id = WRITE_FAILURE_NOTICE_ID;
    notice.className = 'gmail-tabs-notice';
    notice.setAttribute('role', 'alert');

    const message = document.createElement('span');
    message.className = 'gmail-tabs-notice-text';
    message.textContent = text;

    const dismiss = document.createElement('button');
    dismiss.type = 'button';
    dismiss.className = 'gmail-tabs-notice-close';
    dismiss.setAttribute('aria-label', 'Dismiss');
    dismiss.textContent = '✕';
    dismiss.addEventListener('click', () => notice.remove());

    notice.append(message, dismiss);
    document.body.appendChild(notice);
}

/**
 * Run an async modal action so that a failure leaves the modal usable.
 *
 * `trigger` is disabled while the work runs, so a slow write cannot be
 * submitted twice, and enabled again if it fails. A dead context replaces the
 * modal's contents with the reload notice; any other failure keeps the modal
 * open, with what the user typed, and shows the write-failure notice.
 */
export function guardModalAction(
    work: () => Promise<void>,
    surface: { content: Element; close: () => void; trigger?: HTMLButtonElement }
): void {
    const { content, close, trigger } = surface;
    if (!isExtensionContextAlive()) {
        renderContextInvalidatedNotice(content, close);
        return;
    }
    if (trigger) trigger.disabled = true;
    work().then(
        () => {
            if (trigger) trigger.disabled = false;
        },
        (error: unknown) => {
            if (trigger) trigger.disabled = false;
            if (isContextInvalidatedError(error)) {
                renderContextInvalidatedNotice(content, close);
                return;
            }
            reportSettingsWriteFailure(error);
        }
    );
}
