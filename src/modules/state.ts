/**
 * state.ts
 *
 * Shared mutable state for Gmail Labels as Tabs.
 * All modules import and mutate this shared state object,
 * avoiding the need to pass state through every function call.
 */


import { Settings } from '../utils/storage';

export const TABS_BAR_ID = 'gmail-labels-as-tabs-bar';
export const MODAL_ID = 'gmail-labels-settings-modal';
export const TOOLBAR_SELECTORS = [
    '.G-atb', // Main toolbar container (often has this class)
    '.aeF > div:first-child', // Fallback
];

export interface AppState {
    currentSettings: Settings | null;
    currentUserEmail: string | null;
    initPromise: Promise<void> | null;
    observer: MutationObserver | null;
}

export const state: AppState = {
    currentSettings: null,
    currentUserEmail: null,
    initPromise: null,
    observer: null,
};
