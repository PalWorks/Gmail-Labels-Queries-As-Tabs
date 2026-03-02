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
