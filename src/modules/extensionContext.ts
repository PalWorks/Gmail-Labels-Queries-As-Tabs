/**
 * extensionContext.ts
 *
 * Detecting that this content script has been orphaned.
 *
 * When Chrome updates or reloads an extension, the pages already running its
 * content script are not reloaded with it. The script keeps running, its DOM
 * stays on screen and its buttons stay clickable, but every `chrome.*` call
 * now throws "Extension context invalidated." The user sees a settings modal
 * that silently does nothing.
 *
 * This is not only a development annoyance. Chrome updates extensions in the
 * background, so any long-lived Gmail tab hits it in the wild too, and Gmail
 * tabs are exactly the kind that stay open for days.
 *
 * Nothing can repair an orphaned script from inside itself. What it can do is
 * notice, and say so, instead of failing quietly.
 */

/**
 * True while this content script can still reach the extension.
 *
 * `chrome.runtime.id` is the cheapest reliable probe: it is a plain property
 * read, and it becomes `undefined` the moment the context dies. Accessing
 * `chrome.runtime` at all can throw once the object is torn down, hence the
 * try/catch rather than an optional chain alone.
 */
export function isExtensionContextAlive(): boolean {
    try {
        return Boolean(chrome?.runtime?.id);
    } catch {
        return false;
    }
}

/**
 * True for the error Chrome raises from any `chrome.*` call in an orphaned
 * content script. Matched on the message because Chrome exposes no error
 * code, and matched loosely because the wording has changed across versions.
 */
export function isContextInvalidatedError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error ?? '');
    return /extension context invalidated|context invalidated|receiving end does not exist/i.test(message);
}
