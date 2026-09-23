/**
 * handover.ts
 *
 * What happens when a second copy of this content script arrives in a page
 * that already has one.
 *
 * A Gmail tab open before the extension was installed, or open while Chrome
 * updated it in the background, is not reloaded by Chrome. The worker fixes
 * that by injecting the content script into the tab directly (see
 * `adoptOpenGmailTabs` in background.ts). That leaves a question this module
 * answers: what about the copy that was already running there?
 *
 * On an update it is orphaned. Its `chrome.*` calls throw, but its JavaScript
 * is still running: its MutationObserver still fires, its listeners still
 * respond and its tab bar is still on screen, clickable and dead. Two copies
 * in one page would fight over the same DOM, and the user would have no way
 * to tell which of the two tab bars is the live one.
 *
 * So the arriving copy announces itself, and the copy already there stands
 * down. The announcement is a DOM event rather than a `chrome.*` message on
 * purpose: an orphaned script can no longer receive a message, but it can
 * still hear a `document` event, because that costs it nothing it has lost.
 *
 * One version's worth of imperfection is unavoidable: a copy from before this
 * module existed does not listen, so it cannot stand down. It is close to
 * harmless (it finds the new bar under the id it expects and leaves it alone)
 * and it is gone the moment that tab is reloaded. From this version on, a
 * handover is clean.
 */

import { TABS_BAR_ID } from './state';

/** Announced by an arriving copy; heard by the copy already in the page. */
export const STAND_DOWN_EVENT = 'gmailTabs:standDown';

/**
 * Everything this extension appends to a Gmail page.
 *
 * The teardown has to work on DOM it did not create, so it goes by selector
 * rather than by held reference. That is also why the list lives here rather
 * than in each module: a module that leaves something behind and does not
 * appear in this list leaks it into the page on every handover.
 */
const OUR_PAGE_FURNITURE = [
    `#${TABS_BAR_ID}`,
    '.gmail-tabs-modal',
    '.gmail-tab-dropdown',
    '.glt-ob-scrim',
    '.color-popover',
];

/** Remove every element this extension has added to the page. */
export function removeOurPageFurniture(): void {
    for (const selector of OUR_PAGE_FURNITURE) {
        document.querySelectorAll(selector).forEach((el) => el.remove());
    }
}

/**
 * Take over the page: tell any copy already running here to stand down, clear
 * what it left behind, and agree to stand down in turn for whoever comes next.
 *
 * The announcement goes out **before** the listener is registered, so this
 * copy cannot hear itself and shut itself down on arrival.
 *
 * @param standDown How this copy stops: called if another copy later arrives.
 */
export function claimPage(standDown: () => void): void {
    try {
        document.dispatchEvent(new CustomEvent(STAND_DOWN_EVENT));
    } catch {
        // No handover, then. Clearing the furniture below still gives this
        // copy a clean page to build in, which is the part that shows.
    }
    removeOurPageFurniture();
    document.addEventListener(STAND_DOWN_EVENT, standDown, { once: true });
}
