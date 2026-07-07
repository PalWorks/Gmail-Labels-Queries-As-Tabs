/**
 * state.ts
 *
 * Shared mutable state for Gmail Labels as Tabs.
 * Use the getter/setter functions to read and write state.
 * Direct property mutation is deprecated; use setAppSettings()
 * and setUserEmail() instead.
 */

import { Settings, Tab } from '../utils/storage';
import { TOOLBAR_SELECTORS } from '../utils/selectors';

export { TOOLBAR_SELECTORS };
export const TABS_BAR_ID = 'gmail-labels-as-tabs-bar';
export const MODAL_ID = 'gmail-labels-settings-modal';

// Only truly-shared, cross-module state lives here. Content-script lifecycle
// primitives (the MutationObserver, the init promise) are private to content.ts.
export interface AppState {
    currentSettings: Settings | null;
    currentUserEmail: string | null;
}

export const state: AppState = {
    currentSettings: null,
    currentUserEmail: null,
};

// ---------------------------------------------------------------------------
// Getter / Setter Functions
// ---------------------------------------------------------------------------

let settingsInitialized = false;
let emailInitialized = false;

/** Return the current settings (may be null before first load). */
export function getAppSettings(): Settings | null {
    return state.currentSettings;
}

/**
 * Store new settings. Rejects null after the first successful
 * set to prevent accidental clearing of loaded settings.
 */
export function setAppSettings(settings: Settings | null): void {
    if (settings === null && settingsInitialized) {
        throw new Error('Cannot clear settings after initialization');
    }
    state.currentSettings = settings;
    if (settings !== null) {
        settingsInitialized = true;
    }
}

/**
 * Replace the tab array on the current settings in place. No-op if settings
 * are not loaded yet. Centralizes the optimistic tab-order updates so no module
 * pokes at `getAppSettings().tabs` directly.
 */
export function setAppTabs(tabs: Tab[]): void {
    if (state.currentSettings) {
        state.currentSettings.tabs = tabs;
    }
}

/** Return the current user email (may be null before detection). */
export function getUserEmail(): string | null {
    return state.currentUserEmail;
}

/**
 * Store the detected email. Rejects null after the first successful
 * set to prevent accidental clearing of the identified account.
 */
export function setUserEmail(email: string | null): void {
    if (email === null && emailInitialized) {
        throw new Error('Cannot clear email after initialization');
    }
    state.currentUserEmail = email;
    if (email !== null) {
        emailInitialized = true;
    }
}

/** Reset all state (for testing only). */
export function resetState(): void {
    state.currentSettings = null;
    state.currentUserEmail = null;
    settingsInitialized = false;
    emailInitialized = false;
}
