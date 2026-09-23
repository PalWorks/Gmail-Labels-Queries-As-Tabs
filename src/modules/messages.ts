/**
 * messages.ts
 *
 * The names of every message passed between the extension's surfaces.
 *
 * They live in a module of their own, with no imports, because the senders and
 * the receiver are almost never in the same bundle. The toolbar popup sends
 * `OPEN_OPTIONS_PAGE`, but the constant used to live in `settingsModal.ts`;
 * importing it from there would have pulled the settings modal, the tab
 * manager, the import and uninstall modals and all of their `chrome.*` calls
 * into a popup that renders four buttons.
 *
 * A message name is a contract between two bundles. Keeping the contract in a
 * leaf module is what stops that contract dragging an implementation with it.
 */

/** Content script → worker: open the extension's options page. */
export const OPEN_OPTIONS_PAGE_ACTION = 'OPEN_OPTIONS_PAGE';

/** Popup or options page → worker: start the tour wherever it best fits. */
export const START_TOUR_ACTION = 'START_TOUR';

/** Worker → content script: show the tour in this Gmail tab now. */
export const SHOW_ONBOARDING_ACTION = 'SHOW_ONBOARDING';

/** Worker or popup → content script: toggle the Configure Tabs modal. */
export const TOGGLE_SETTINGS_ACTION = 'TOGGLE_SETTINGS';

/**
 * Worker → content script: are you there, and still connected?
 *
 * The answer is what tells the worker whether a Gmail tab needs a content
 * script injected into it. An orphaned script cannot answer: its context is
 * gone, so the send rejects, which reads as "not there" and is exactly right.
 */
export const PING_ACTION = 'PING';
