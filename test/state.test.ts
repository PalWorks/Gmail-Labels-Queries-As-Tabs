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
    getUserEmail,
    setUserEmail,
    resetState,
    state,
} from '../src/modules/state';
import { Settings } from '../src/utils/storage';

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

        it('writes through to the raw state object', () => {
            setAppSettings(fakeSettings);
            expect(state.currentSettings).toBe(fakeSettings);
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

        it('writes through to the raw state object', () => {
            setUserEmail('test@gmail.com');
            expect(state.currentUserEmail).toBe('test@gmail.com');
        });
    });

    // -----------------------------------------------------------------------
    // resetState
    // -----------------------------------------------------------------------

    describe('resetState', () => {
        it('clears all state properties', () => {
            setAppSettings(fakeSettings);
            setUserEmail('user@gmail.com');
            state.initPromise = Promise.resolve();

            resetState();

            expect(getAppSettings()).toBeNull();
            expect(getUserEmail()).toBeNull();
            expect(state.initPromise).toBeNull();
            expect(state.observer).toBeNull();
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
