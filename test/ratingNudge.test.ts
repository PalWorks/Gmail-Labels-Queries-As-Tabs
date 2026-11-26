// SPDX-License-Identifier: AGPL-3.0-only
export {};
/**
 * ratingNudge.test.ts
 *
 * When the rating ask appears in the tab bar, and how it goes away.
 */

import {
    isDue,
    freshState,
    parseState,
    afterRate,
    afterNotNow,
    afterNever,
    createRatingNudge,
    RATING_MIN_DAYS,
    RATING_MIN_CLICKS,
    RATING_SNOOZE_DAYS,
    RATING_MAX_SHOWS,
    STORE_REVIEWS_URL,
    initRatingNudge,
    ratingNudgeDue,
    resetRatingNudgeForTests,
    RATING_STORAGE_KEY,
} from '../src/modules/ratingNudge';

const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.UTC(2026, 10, 1);

/** A user who qualifies: past the waiting period, with enough clicks. */
const qualified = () => ({ ...freshState(T0), tabClicks: RATING_MIN_CLICKS });

describe('isDue', () => {
    test('not before the waiting period, however many clicks', () => {
        expect(isDue(qualified(), T0 + (RATING_MIN_DAYS - 1) * DAY)).toBe(false);
        expect(isDue(qualified(), T0 + RATING_MIN_DAYS * DAY)).toBe(true);
    });

    test('not before enough clicks, however long installed', () => {
        expect(isDue({ ...qualified(), tabClicks: RATING_MIN_CLICKS - 1 }, T0 + 365 * DAY)).toBe(false);
    });

    test('"Rate it" and "Don\'t ask again" end it for good', () => {
        const later = T0 + 400 * DAY;
        expect(isDue(afterRate(qualified()), later)).toBe(false);
        expect(isDue(afterNever(qualified()), later)).toBe(false);
    });

    test('"Not now" waits the snooze period, then asks again', () => {
        const now = T0 + RATING_MIN_DAYS * DAY;
        const s = afterNotNow(qualified(), now);
        expect(isDue(s, now + (RATING_SNOOZE_DAYS - 1) * DAY)).toBe(false);
        expect(isDue(s, now + RATING_SNOOZE_DAYS * DAY)).toBe(true);
    });

    test(`stops after ${RATING_MAX_SHOWS} "Not now"s`, () => {
        let s = qualified();
        let now = T0 + RATING_MIN_DAYS * DAY;
        for (let i = 0; i < RATING_MAX_SHOWS; i++) {
            s = afterNotNow(s, now);
            now += RATING_SNOOZE_DAYS * DAY;
        }
        expect(isDue(s, now + 365 * DAY)).toBe(false);
    });
});

describe('parseState', () => {
    test('a missing or malformed record starts fresh rather than throw', () => {
        expect(parseState(undefined, T0)).toEqual(freshState(T0));
        expect(parseState({ firstSeen: 'x', tabClicks: -4, done: 'yes' }, T0)).toEqual(freshState(T0));
    });
});

describe('the element', () => {
    beforeEach(() => resetRatingNudgeForTests());

    test('three buttons, each saying what it does', () => {
        const el = createRatingNudge();
        expect([...el.querySelectorAll('button')].map((b) => b.textContent)).toEqual([
            'Rate it',
            'Not now',
            "Don't ask again",
        ]);
    });

    test('asks for a rating, never for a particular one', () => {
        expect(createRatingNudge().textContent).not.toMatch(/5|five|star/i);
    });

    test('"Rate it" opens the store reviews page in a new tab', () => {
        const open = jest.spyOn(window, 'open').mockImplementation(() => null);
        createRatingNudge().querySelector<HTMLButtonElement>('.rating-nudge-rate')!.click();
        expect(open).toHaveBeenCalledWith(STORE_REVIEWS_URL, '_blank', 'noopener,noreferrer');
        open.mockRestore();
    });
});

describe('initRatingNudge with chrome.storage', () => {
    let store: Record<string, unknown>;

    beforeEach(() => {
        resetRatingNudgeForTests();
        store = {};
        (global as any).chrome = {
            runtime: { id: 'test' },
            storage: {
                local: {
                    get: jest.fn(async (key: string) => (key in store ? { [key]: store[key] } : {})),
                    set: jest.fn(async (items: Record<string, unknown>) => Object.assign(store, items)),
                },
            },
        };
    });

    afterEach(() => {
        delete (global as any).chrome;
    });

    test('a first run records when it started and is not due', async () => {
        await initRatingNudge(() => {});
        expect(store[RATING_STORAGE_KEY]).toMatchObject({ tabClicks: 0, done: false });
        expect(ratingNudgeDue()).toBe(false);
    });

    test('a qualified user is due, and the bar is told to redraw', async () => {
        store[RATING_STORAGE_KEY] = { ...freshState(Date.now() - (RATING_MIN_DAYS + 1) * DAY), tabClicks: RATING_MIN_CLICKS };
        const redraw = jest.fn();
        await initRatingNudge(redraw);
        expect(ratingNudgeDue()).toBe(true);
        expect(redraw).toHaveBeenCalled();
    });
});
