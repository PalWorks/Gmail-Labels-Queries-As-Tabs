// SPDX-License-Identifier: AGPL-3.0-only
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

/**
 * The count Gmail shows on a sidebar row (Inbox, Drafts, a label). It sits
 * beside the row's link, not inside it: measured 2026-11-26, a label row is
 * `.TO > .TN > .aio > (span > a) + .bsU`.
 */
export const UNREAD_COUNT_SELECTOR = '.bsU';

/** One row of Gmail's left sidebar, holding a link and, beside it, its count. */
export const SIDEBAR_ROW_SELECTOR = '.TO';

/**
 * Links in Gmail's left sidebar, system views and labels alike. The label list
 * is no longer inside `[role="navigation"]` (found 2026-11-22), so the row
 * container comes first and the navigation landmark is the fallback.
 */
export const SIDEBAR_LINK_SELECTORS = ['.aim a[href*="#"]', '[role="navigation"] a[href*="#"]'];

/** Main content area (used for dark mode background detection) */
export const MAIN_CONTENT_SELECTOR = '.nH';

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
