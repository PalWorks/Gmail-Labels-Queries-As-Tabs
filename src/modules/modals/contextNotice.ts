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
 */

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

    content.querySelector(`#${RELOAD_BUTTON_ID}`)?.addEventListener('click', () => location.reload());
    content.querySelector('.close-btn')?.addEventListener('click', close);
}
