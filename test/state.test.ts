export {};
/**
 * state.test.ts
 *
 * Tests for the state module getter/setter functions
 * and resetState cleanup utility.
 */

import {
    getAppSettings,
    setAppSettings,
    setAppTabs,
    getUserEmail,
    setUserEmail,
    resetState,
} from '../src/modules/state';
import { Settings, Tab } from '../src/utils/storage';

const fakeSettings: Settings = {
    tabs: [{ id: '1', title: 'Inbox', value: '#inbox', type: 'hash' }],
    theme: 'system',
    showUnreadCount: true,
    rules: [],
};

describe('state module', () => {
    beforeEach(() => {
        resetState();
    });

    // -----------------------------------------------------------------------
    // getAppSettings / setAppSettings
    // -----------------------------------------------------------------------

    describe('setAppSettings / getAppSettings', () => {
        it('returns null before any settings are stored', () => {
            expect(getAppSettings()).toBeNull();
        });

        it('stores and returns settings', () => {
            setAppSettings(fakeSettings);
            expect(getAppSettings()).toBe(fakeSettings);
        });

        it('allows setting null when no prior value exists', () => {
            expect(() => setAppSettings(null)).not.toThrow();
            expect(getAppSettings()).toBeNull();
        });

        it('rejects null after a non-null value was stored', () => {
            setAppSettings(fakeSettings);
            expect(() => setAppSettings(null)).toThrow('Cannot clear settings after initialization');
            expect(getAppSettings()).toBe(fakeSettings);
        });

        it('allows replacing one non-null value with another', () => {
            setAppSettings(fakeSettings);
            const updated = { ...fakeSettings, theme: 'dark' as const };
            setAppSettings(updated);
            expect(getAppSettings()).toBe(updated);
        });

        it('writes through so getAppSettings returns the same reference', () => {
            setAppSettings(fakeSettings);
            expect(getAppSettings()).toBe(fakeSettings);
        });
    });

    // -----------------------------------------------------------------------
    // getUserEmail / setUserEmail
    // -----------------------------------------------------------------------

    describe('setUserEmail / getUserEmail', () => {
        it('returns null before any email is stored', () => {
            expect(getUserEmail()).toBeNull();
        });

        it('stores and returns the email', () => {
            setUserEmail('user@gmail.com');
            expect(getUserEmail()).toBe('user@gmail.com');
        });

        it('allows setting null when no prior value exists', () => {
            expect(() => setUserEmail(null)).not.toThrow();
            expect(getUserEmail()).toBeNull();
        });

        it('rejects null after a non-null value was stored', () => {
            setUserEmail('user@gmail.com');
            expect(() => setUserEmail(null)).toThrow('Cannot clear email after initialization');
            expect(getUserEmail()).toBe('user@gmail.com');
        });

        it('allows replacing one email with another', () => {
            setUserEmail('a@gmail.com');
            setUserEmail('b@gmail.com');
            expect(getUserEmail()).toBe('b@gmail.com');
        });

        it('writes through so getUserEmail returns the value', () => {
            setUserEmail('test@gmail.com');
            expect(getUserEmail()).toBe('test@gmail.com');
        });
    });

    // -----------------------------------------------------------------------
    // resetState
    // -----------------------------------------------------------------------

    describe('setAppTabs', () => {
        it('replaces the tab array on the current settings', () => {
            setAppSettings({ ...fakeSettings, tabs: [...fakeSettings.tabs] });
            const newTabs: Tab[] = [
                { id: '2', title: 'Sent', value: '#sent', type: 'hash' },
                { id: '3', title: 'Work', value: 'Work', type: 'label' },
            ];
            setAppTabs(newTabs);
            expect(getAppSettings()!.tabs).toBe(newTabs);
        });

        it('is a no-op when settings are not loaded', () => {
            expect(() => setAppTabs([])).not.toThrow();
            expect(getAppSettings()).toBeNull();
        });
    });

    describe('resetState', () => {
        it('clears all state properties', () => {
            setAppSettings(fakeSettings);
            setUserEmail('user@gmail.com');

            resetState();

            expect(getAppSettings()).toBeNull();
            expect(getUserEmail()).toBeNull();
        });

        it('allows setting null again after reset', () => {
            setAppSettings(fakeSettings);
            setUserEmail('user@gmail.com');
            resetState();

            expect(() => setAppSettings(null)).not.toThrow();
            expect(() => setUserEmail(null)).not.toThrow();
        });

        it('allows re-initialization after reset', () => {
            setAppSettings(fakeSettings);
            resetState();

            const newSettings = { ...fakeSettings, theme: 'light' as const };
            setAppSettings(newSettings);
            expect(getAppSettings()).toBe(newSettings);
        });
    });
});
