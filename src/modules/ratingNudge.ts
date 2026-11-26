// SPDX-License-Identifier: AGPL-3.0-only
/**
 * ratingNudge.ts
 *
 * A one-line ask, at the end of the tab bar, for a rating on the Chrome Web
 * Store, once someone has used the tabs for a while.
 *
 * When: at least RATING_MIN_DAYS after the extension first ran here, and
 * after RATING_MIN_CLICKS clicks on a tab. That is someone who has made the
 * bar part of how they use Gmail, which is the only person whose rating
 * means anything. Never during the first-run tour or while moving tabs.
 *
 * How often: "Rate it" or "Don't ask again" ends it for good. "Not now" puts
 * it away for RATING_SNOOZE_DAYS, and after RATING_MAX_SHOWS showings it
 * stops asking. It asks for a rating, never for a particular one, and it is
 * not conditional on anything the user says: the Chrome Web Store's policy
 * forbids steering ratings, and a rating that was steered is worth nothing.
 *
 * State lives in chrome.storage.local, on this device only. Nothing about it
 * leaves the browser; the store page opens only when the user clicks.
 */

export const RATING_STORAGE_KEY = 'ratingNudge';
export const RATING_MIN_DAYS = 7;
export const RATING_MIN_CLICKS = 30;
export const RATING_SNOOZE_DAYS = 30;
export const RATING_MAX_SHOWS = 3;
export const STORE_REVIEWS_URL =
    'https://chromewebstore.google.com/detail/gmail-labels-and-search-q/jemjnjlplglfoiipcjhoacneigdgfmde/reviews';

const DAY_MS = 24 * 60 * 60 * 1000;
const CLICK_FLUSH_MS = 2000;

export interface RatingState {
    /** When the extension first ran on this device, as far as the nudge knows. */
    firstSeen: number;
    /** Clicks on a tab in the bar. */
    tabClicks: number;
    /** Finished: rated, or asked not to be asked again. */
    done: boolean;
    /** Not before this time, after a "Not now". */
    snoozedUntil: number;
    /** How many times "Not now" has put it away. */
    shows: number;
}

export function freshState(now: number): RatingState {
    return { firstSeen: now, tabClicks: 0, done: false, snoozedUntil: 0, shows: 0 };
}

/** Accept only a well-formed record; anything else starts over rather than throw. */
export function parseState(raw: unknown, now: number): RatingState {
    if (!raw || typeof raw !== 'object') return freshState(now);
    const r = raw as Record<string, unknown>;
    const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fallback);
    return {
        firstSeen: num(r.firstSeen, now),
        tabClicks: num(r.tabClicks, 0),
        done: r.done === true,
        snoozedUntil: num(r.snoozedUntil, 0),
        shows: num(r.shows, 0),
    };
}

/** Whether the nudge is due. Pure, so the rules can be tested by the clock. */
export function isDue(state: RatingState, now: number): boolean {
    if (state.done) return false;
    if (state.shows >= RATING_MAX_SHOWS) return false;
    if (now < state.firstSeen + RATING_MIN_DAYS * DAY_MS) return false;
    if (state.tabClicks < RATING_MIN_CLICKS) return false;
    return now >= state.snoozedUntil;
}

export function afterRate(state: RatingState): RatingState {
    return { ...state, done: true };
}

export function afterNotNow(state: RatingState, now: number): RatingState {
    const shows = state.shows + 1;
    return { ...state, shows, snoozedUntil: now + RATING_SNOOZE_DAYS * DAY_MS, done: shows >= RATING_MAX_SHOWS };
}

export function afterNever(state: RatingState): RatingState {
    return { ...state, done: true };
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

let cached: RatingState | null = null;
let pendingClicks = 0;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let onDueChange: (() => void) | null = null;

function storageAvailable(): boolean {
    try {
        return typeof chrome !== 'undefined' && !!chrome.storage?.local && !!chrome.runtime?.id;
    } catch {
        return false;
    }
}

async function read(): Promise<RatingState> {
    const now = Date.now();
    if (!storageAvailable()) return cached ?? freshState(now);
    try {
        const items = await chrome.storage.local.get(RATING_STORAGE_KEY);
        const had = items && RATING_STORAGE_KEY in items;
        const state = parseState(items?.[RATING_STORAGE_KEY], now);
        if (!had) await chrome.storage.local.set({ [RATING_STORAGE_KEY]: state });
        return state;
    } catch {
        return cached ?? freshState(now);
    }
}

async function write(state: RatingState): Promise<void> {
    cached = state;
    if (!storageAvailable()) return;
    try {
        await chrome.storage.local.set({ [RATING_STORAGE_KEY]: state });
    } catch {
        /* a lost write only means asking a little later than planned */
    }
}

/**
 * Load the state once and remember who to tell when it becomes due, so the
 * bar can redraw. Safe to call more than once.
 */
export async function initRatingNudge(redraw: () => void): Promise<void> {
    onDueChange = redraw;
    const wasDue = cached ? isDue(cached, Date.now()) : false;
    cached = await read();
    if (isDue(cached, Date.now()) !== wasDue) redraw();
}

/** True when the bar should show the nudge now. Synchronous, for renderTabs. */
export function ratingNudgeDue(): boolean {
    return cached !== null && isDue(cached, Date.now());
}

/** Count one click on a tab. Writes are batched; a click is cheap. */
export function recordTabClick(): void {
    pendingClicks++;
    if (flushTimer) return;
    flushTimer = setTimeout(() => {
        flushTimer = null;
        void flushClicks();
    }, CLICK_FLUSH_MS);
}

async function flushClicks(): Promise<void> {
    if (pendingClicks === 0) return;
    const add = pendingClicks;
    pendingClicks = 0;
    const current = await read();
    const wasDue = isDue(current, Date.now());
    const next = { ...current, tabClicks: current.tabClicks + add };
    await write(next);
    if (!wasDue && isDue(next, Date.now())) onDueChange?.();
}

/** Test-only reset of module state. */
export function resetRatingNudgeForTests(): void {
    cached = null;
    pendingClicks = 0;
    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = null;
    onDueChange = null;
}

// ---------------------------------------------------------------------------
// The element
// ---------------------------------------------------------------------------

async function settle(next: (s: RatingState) => RatingState): Promise<void> {
    const current = await read();
    await write(next(current));
    onDueChange?.();
}

/**
 * The nudge, as it sits at the end of the bar. Three plain-text buttons, no
 * icons alone, each saying what it does.
 */
export function createRatingNudge(): HTMLElement {
    const box = document.createElement('div');
    box.className = 'rating-nudge';
    box.setAttribute('role', 'group');
    box.setAttribute('aria-label', 'Rate Gmail Labels as Tabs');

    const text = document.createElement('span');
    text.className = 'rating-nudge-text';
    text.textContent = 'Finding these tabs useful?';

    const rate = document.createElement('button');
    rate.type = 'button';
    rate.className = 'rating-nudge-rate';
    rate.textContent = 'Rate it';
    rate.title = 'Opens the Chrome Web Store in a new tab';
    rate.addEventListener('click', (e) => {
        e.stopPropagation();
        window.open(STORE_REVIEWS_URL, '_blank', 'noopener,noreferrer');
        void settle(afterRate);
    });

    const later = document.createElement('button');
    later.type = 'button';
    later.className = 'rating-nudge-later';
    later.textContent = 'Not now';
    later.addEventListener('click', (e) => {
        e.stopPropagation();
        void settle((s) => afterNotNow(s, Date.now()));
    });

    const never = document.createElement('button');
    never.type = 'button';
    never.className = 'rating-nudge-never';
    never.textContent = "Don't ask again";
    never.addEventListener('click', (e) => {
        e.stopPropagation();
        void settle(afterNever);
    });

    box.append(text, rate, later, never);
    return box;
}
