/**
 * selectors.ts
 *
 * Centralized registry of Gmail-specific CSS selectors.
 * Keeping all DOM selectors in one file makes it easy to update
 * them when Gmail changes its class names.
 */

/** Main toolbar container candidates (ordered by specificity) */
export const TOOLBAR_SELECTORS = [
    '.G-atb',
    '.aeF > div:first-child',
];

/** Unread count badge inside a navigation link */
export const UNREAD_COUNT_SELECTOR = '.bsU';

/** Main content area (used for dark mode background detection) */
export const MAIN_CONTENT_SELECTOR = '.nH';

/** Navigation container candidates (ordered by specificity) */
export const NAV_SELECTORS = [
    '[role="navigation"]',
    '.wT',
];

/** Links pointing to Gmail label views */
export const LABEL_LINK_SELECTOR = 'a[href*="#label/"]';

/**
 * Sender icons: the fallbacks behind the ARIA anchors in senderIcons.ts.
 *
 * Neither is the first thing tried. Rows are found by `tr[role="row"]` inside
 * `[role="main"]` and the subject by the row's `[role="link"]`; these are what
 * Gmail called the same elements on 2026-09-29 (43 of 43 rows matched both
 * ways), kept for the day an ARIA attribute goes missing while the markup
 * stays. The drift canary checks both against the live page every day and
 * proposes a new value here when one stops matching.
 */
export const SENDER_ROW_FALLBACK = 'tr.zA';
export const SENDER_SUBJECT_FALLBACK = '.xT';
