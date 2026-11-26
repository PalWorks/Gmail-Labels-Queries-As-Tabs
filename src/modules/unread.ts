// SPDX-License-Identifier: AGPL-3.0-only
/**
 * unread.ts
 *
 * Unread count management for Gmail Labels as Tabs.
 * Handles Atom feed fetching, DOM scraping fallback, label map building,
 * and real-time XHR update processing.
 */

import { Tab } from '../utils/storage';
import { TABS_BAR_ID } from './state';
import {
    UNREAD_COUNT_SELECTOR,
    LABEL_LINK_SELECTOR,
    SIDEBAR_ROW_SELECTOR,
    SIDEBAR_LINK_SELECTORS,
} from '../utils/selectors';

// ---------------------------------------------------------------------------
// Label Normalization
// ---------------------------------------------------------------------------

/**
 * Normalize label name for fuzzy matching.
 * Lowercase, replace separators with space, collapse whitespace.
 */
export function normalizeLabel(name: string): string {
    let decoded = name;
    try {
        decoded = decodeURIComponent(name);
    } catch {
        // A label name may contain a literal '%' ("100% done"), which is not
        // a valid escape. Match on the raw name rather than throw.
    }
    return decoded
        .toLowerCase()
        .replace(/[/\-_]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

// ---------------------------------------------------------------------------
// DOM Label Map
// ---------------------------------------------------------------------------

/**
 * Scrapes the Gmail sidebar to build a map of Label Name -> Internal ID.
 * Crucial because XHR updates use internal IDs (e.g. Label_4)
 * while tabs use display names.
 */
export function buildLabelMapFromDOM(): Map<string, string> {
    const map = new Map<string, string>();

    const labelLinks = document.querySelectorAll(LABEL_LINK_SELECTOR);

    labelLinks.forEach((link) => {
        const href = link.getAttribute('href');
        if (!href) return;

        const rawId = href.split('#label/')[1];
        if (!rawId) return;

        const id = decodeURIComponent(rawId).replace(/\+/g, ' ');

        let title = link.getAttribute('title');

        if (!title) {
            const childWithTitle = link.querySelector('[title]');
            if (childWithTitle) {
                title = childWithTitle.getAttribute('title');
            }
        }

        if (!title) {
            const ariaLabel = link.getAttribute('aria-label');
            if (ariaLabel) {
                title = ariaLabel.split(',')[0];
            }
        }

        if (title) {
            map.set(title.toLowerCase(), id);
            map.set(id.toLowerCase(), id);
        }
    });

    console.log('Gmail Tabs: Built DOM Label Map (Size: ' + map.size + ')');
    return map;
}

// ---------------------------------------------------------------------------
// Known-label tokens (for the XHR interceptor filter)
// ---------------------------------------------------------------------------

/** Maps a system hash route to Gmail's internal label id used in sync responses. */
const SYSTEM_HASH_TO_ID: Record<string, string> = {
    '#inbox': '^i',
    '#starred': '^t',
    '#drafts': '^r',
    '#sent': '^f',
    '#spam': '^s',
    '#trash': '^k',
    '#all': '^all',
};

/**
 * Builds the set of label tokens the user's tabs could receive unread updates
 * for. The content script sends this to the page-world XHR interceptor so it can
 * ignore coincidental [string, number] tuples for labels the user does not track.
 * Includes DOM sidebar label names/ids to cover Gmail's internal id forms.
 */
export function computeKnownLabelTokens(tabs: Tab[]): string[] {
    const tokens = new Set<string>();
    const add = (s?: string | null) => {
        if (s) tokens.add(s);
    };

    for (const tab of tabs) {
        if (tab.type === 'label') {
            add(tab.value);
        } else if (tab.type === 'hash') {
            if (SYSTEM_HASH_TO_ID[tab.value]) {
                add(SYSTEM_HASH_TO_ID[tab.value]);
            } else if (tab.value.startsWith('#label/')) {
                add(decodeURIComponent(tab.value.replace('#label/', '').replace(/\+/g, ' ')));
            } else if (tab.value.startsWith('#search/label:')) {
                const raw = decodeURIComponent(tab.value.replace('#search/', ''));
                if (raw.startsWith('label:')) add(raw.replace('label:', ''));
            }
        }
    }

    try {
        const domMap = buildLabelMapFromDOM();
        for (const [name, id] of domMap.entries()) {
            add(name);
            add(id);
        }
    } catch {
        /* DOM not ready; tab-derived tokens are enough */
    }

    return Array.from(tokens);
}

// ---------------------------------------------------------------------------
// XHR Unread Update Handler
// ---------------------------------------------------------------------------

/**
 * Process incoming unread count updates from the XHR interceptor.
 * Matches updates to visible tab elements and updates their badges.
 */
export function handleUnreadUpdates(updates: { label: string; count: number }[]): void {
    console.log('Gmail Tabs: Received unread updates', updates);

    const updateMap = new Map<string, number>();
    updates.forEach((u) => updateMap.set(u.label, u.count));

    const domLabelMap = buildLabelMapFromDOM();

    const normalize = (str: string) => str.toLowerCase().replace(/[^a-z0-9]/g, '');

    const bar = document.getElementById(TABS_BAR_ID);
    if (!bar) return;

    const tabs = bar.querySelectorAll('.gmail-tab');
    tabs.forEach((t) => {
        const tabEl = t as HTMLElement;
        const tabValue = tabEl.dataset.value;
        const tabType = tabEl.dataset.type;

        if (!tabValue) return;

        // Gmail's own sidebar is the count the user compares a badge with, and
        // it is read directly (refreshCountsFromSidebar). A sync tuple for the
        // same view can mean something else: `^i` is every unread message in
        // the inbox, all categories, while Gmail shows Primary only (measured
        // 2026-11-26: 446 against Gmail's 9).
        if (findSidebarLink({ id: '', title: '', type: tabType === 'label' ? 'label' : 'hash', value: tabValue })) {
            return;
        }

        let labelId = '';
        if (tabType === 'label') {
            labelId = tabValue;
        } else if (tabType === 'hash') {
            if (tabValue === '#starred') labelId = '^t';
            else if (tabValue === '#drafts') labelId = '^r';
            else if (tabValue === '#sent') labelId = '^f';
            else if (tabValue === '#spam') labelId = '^s';
            else if (tabValue === '#trash') labelId = '^k';
            else if (tabValue === '#all') labelId = '^all';
            else if (tabValue.startsWith('#label/')) {
                labelId = decodeURIComponent(tabValue.replace('#label/', '').replace(/\+/g, ' '));
            } else if (tabValue.startsWith('#search/label:')) {
                const raw = decodeURIComponent(tabValue.replace('#search/', ''));
                if (raw.startsWith('label:')) {
                    labelId = raw.replace('label:', '');
                }
            }
        }

        let resolvedId = labelId;
        if (domLabelMap.has(labelId.toLowerCase())) {
            resolvedId = domLabelMap.get(labelId.toLowerCase()) || labelId;
        }

        let count = updateMap.get(resolvedId);
        if (count === undefined && resolvedId && !resolvedId.startsWith('^')) {
            const normalizedTarget = normalize(resolvedId);
            for (const [key, val] of updateMap.entries()) {
                const normalizedKey = normalize(key);
                if (normalizedKey === normalizedTarget) {
                    count = val;
                    break;
                }
            }
        }

        if (count !== undefined) {
            const countSpan = tabEl.querySelector('.unread-count');
            if (countSpan) {
                countSpan.textContent = count > 0 ? count.toString() : '';
            }
            recordLiveCount(tabType, tabValue, count);
        }
    });
}

/**
 * Store a live XHR count in the feed cache, so the next redraw shows it.
 *
 * Writing only the badge was not enough: renderTabs() rebuilds every badge
 * from the feed cache, and inside the 30 s TTL that cache still held the
 * older feed count, so a live update was reverted by the next redraw.
 */
function recordLiveCount(tabType: string | undefined, tabValue: string, count: number): void {
    if (tabType !== 'label' && tabType !== 'hash') return;
    const feedLabel = resolveFeedLabel({ id: '', title: '', type: tabType, value: tabValue });
    if (feedLabel === null) return;
    const now = Date.now();
    feedCache.set(feedLabel, { count, ts: now, failures: 0 });
    lastLiveUpdate.set(feedLabel, now);
}

// ---------------------------------------------------------------------------
// Atom Feed + DOM Scraping
// ---------------------------------------------------------------------------

/**
 * Resolve which Atom feed label a tab maps to, for when Gmail's sidebar does
 * not show the label (hidden, or under a collapsed parent).
 *
 * Only user labels. Returns null for everything else: searches have no feed,
 * and the system views are always in the sidebar. The inbox in particular has
 * no feed that means what Gmail shows: `feed/atom/` counts every category,
 * while the sidebar shows Primary alone when categories are on.
 */
export function resolveFeedLabel(tab: Tab): string | null {
    if (tab.type === 'label') {
        const lower = tab.value.toLowerCase();
        return lower === 'inbox' || lower === 'sent' ? null : tab.value;
    }
    if (tab.type === 'hash' && tab.value.startsWith('#label/')) return decodeLabelHash(tab.value);
    return null;
}

/**
 * The name Gmail's Atom feed knows a label by: every `/` and space becomes
 * `-`. Measured 2026-11-26 on 32 labels: `feed/atom/Parent-Child-Name` matched
 * the sidebar's count every time, and `feed/atom/Parent%2FChild%20Name` read 0
 * every time, which is also what the feed answers for a label that does not
 * exist. Before this, every nested or spaced label read as zero.
 */
export function feedNameForLabel(label: string): string {
    return label.replace(/[/\s]/g, '-');
}

/**
 * The label name inside a `#label/...` hash, decoded.
 *
 * A pinned hash tab stores the address bar as Gmail wrote it, so the name is
 * already encoded (`My+Label`, `Parent%2FChild`). The feed URL encodes it
 * again, and without decoding first that produced `My%2BLabel` and
 * `Parent%252FChild`, feeds for labels that do not exist.
 */
function decodeLabelHash(hash: string): string {
    const raw = hash.slice('#label/'.length).replace(/\+/g, ' ');
    try {
        return decodeURIComponent(raw);
    } catch {
        // A malformed escape is better sent as it is than not at all.
        return raw;
    }
}

// ---------------------------------------------------------------------------
// Atom feed cache (TTL, backoff, coalescing, concurrency cap)
// ---------------------------------------------------------------------------
//
// renderTabs() runs frequently (storage changes, re-render events), and each
// run asks every tab for its count. Without caching that is one network fetch
// per tab per render, so counts are cached per label for a short TTL and
// concurrent identical requests are coalesced into one fetch.
//
// Failure is tracked separately from the answer. A failed fetch used to be
// stored as the number 0 and served for the full 30s TTL, which is
// indistinguishable from "this label really has no unread mail" and blocked
// the retry that would have corrected it. Now a failure keeps the last count
// we actually know, backs the next attempt off, and lets the caller tell
// "zero" from "no idea".

const FEED_CACHE_TTL_MS = 30_000;

/** First retry delay after a failure; doubles per consecutive failure. */
const FEED_FAILURE_BACKOFF_MS = 5_000;
/** Ceiling on that backoff, so a broken network is polled once every 5 min. */
const FEED_FAILURE_BACKOFF_MAX_MS = 300_000;

/**
 * Feeds in flight at once. A tab bar with many labels, on a slow link, would
 * otherwise open one connection per label simultaneously and compete with
 * Gmail's own requests for the same connection pool.
 */
const MAX_CONCURRENT_FEED_FETCHES = 4;

interface FeedCacheEntry {
    /** Last count we actually fetched, or null if we have never succeeded. */
    count: number | null;
    /** When this entry was last written, success or failure. */
    ts: number;
    /** Consecutive failures since the last success. 0 means the count is fresh. */
    failures: number;
}

const feedCache = new Map<string, FeedCacheEntry>();

/**
 * When a live XHR count last arrived for each feed label. A feed fetch that
 * started before that moment is older news than the badge, so its answer is
 * not allowed to overwrite it.
 */
const lastLiveUpdate = new Map<string, number>();
const inFlightFeeds = new Map<string, Promise<number | null>>();

let activeFeedFetches = 0;
const feedFetchWaiters: Array<() => void> = [];

/**
 * Clears the Atom feed cache. Test-only reset hook: nothing in `src/` calls
 * it, and tests need it because the cache is module state that outlives
 * each case.
 */
export function clearUnreadCountCache(): void {
    feedCache.clear();
    lastLiveUpdate.clear();
    inFlightFeeds.clear();
    activeFeedFetches = 0;
    // Resolve rather than drop: a waiter whose promise is thrown away never
    // resumes, so its fetch would hang for the life of the page.
    feedFetchWaiters.splice(0).forEach((resume) => resume());
}

// A stalled connection must not hold the in-flight slot open: without this,
// one hung request froze that label's count until the page was reloaded,
// because the coalescing entry is only cleared when the promise settles.
const FEED_FETCH_TIMEOUT_MS = 10_000;

function acquireFeedSlot(): Promise<void> {
    if (activeFeedFetches < MAX_CONCURRENT_FEED_FETCHES) {
        activeFeedFetches++;
        return Promise.resolve();
    }
    return new Promise<void>((resolve) => feedFetchWaiters.push(resolve));
}

function releaseFeedSlot(): void {
    const next = feedFetchWaiters.shift();
    // Hand the slot straight over rather than decrementing and re-incrementing.
    if (next) {
        next();
        return;
    }
    activeFeedFetches = Math.max(0, activeFeedFetches - 1);
}

/** How long to wait before retrying a label that has failed `failures` times. */
function backoffFor(failures: number): number {
    if (failures <= 0) return 0;
    const delay = FEED_FAILURE_BACKOFF_MS * 2 ** (failures - 1);
    return Math.min(delay, FEED_FAILURE_BACKOFF_MAX_MS);
}

/**
 * Fetch and parse the Atom feed for a label.
 *
 * Returns the count on success, or null when we could not find out. Null is
 * not zero: the caller falls back to scraping the DOM, and the cache keeps
 * whatever count it already had rather than blanking the badge.
 */
async function fetchFeedCount(labelForFeed: string): Promise<number | null> {
    // Queue before starting the clock, so a request waiting its turn does not
    // spend its own timeout budget sitting in the queue.
    await acquireFeedSlot();

    // The slot is released in this outer finally, not alongside the timer:
    // anything that throws between acquiring and entering the inner try would
    // otherwise leak a slot, and four leaks stop unread counts entirely.
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), FEED_FETCH_TIMEOUT_MS);

        try {
            const encodedLabel = labelForFeed ? encodeURIComponent(feedNameForLabel(labelForFeed)) : '';
            const feedUrl = `${location.origin}${location.pathname}feed/atom/${encodedLabel}`;

            const response = await fetch(feedUrl, { signal: controller.signal });
            if (!response.ok) return null;

            const text = await response.text();
            const xmlDoc = new DOMParser().parseFromString(text, 'text/xml');
            const fullcount = xmlDoc.querySelector('fullcount');
            if (fullcount && fullcount.textContent) {
                const count = parseInt(fullcount.textContent, 10);
                return Number.isFinite(count) && count > 0 ? count : 0;
            }
            // A well-formed feed with no <fullcount> genuinely means zero unread.
            return 0;
        } catch (e) {
            console.warn('Gmail Tabs: Failed to fetch atom feed for', labelForFeed, e);
            return null;
        } finally {
            clearTimeout(timeout);
        }
    } finally {
        releaseFeedSlot();
    }
}

/**
 * Cached, coalesced, backed-off accessor for a label's feed count.
 *
 * Returns null when the count is genuinely unknown: never fetched, or failing
 * and we have no earlier answer to fall back on.
 */
async function getCachedFeedCount(labelForFeed: string): Promise<number | null> {
    const cached = feedCache.get(labelForFeed);
    const age = cached ? Date.now() - cached.ts : Infinity;

    if (cached) {
        if (cached.failures === 0 && age < FEED_CACHE_TTL_MS) return cached.count;
        // Still inside the backoff window: serve the last known count rather
        // than hammering an endpoint that is not answering.
        if (cached.failures > 0 && age < backoffFor(cached.failures)) return cached.count;
    }

    const existing = inFlightFeeds.get(labelForFeed);
    if (existing) return existing;

    const fetchStarted = Date.now();
    const promise = fetchFeedCount(labelForFeed)
        .then((count) => {
            const previous = feedCache.get(labelForFeed);
            // A live count landed while this fetch was on the wire: it is
            // newer than whatever the feed says, so keep it.
            if ((lastLiveUpdate.get(labelForFeed) ?? -Infinity) >= fetchStarted) {
                return previous?.count ?? count;
            }
            if (count === null) {
                feedCache.set(labelForFeed, {
                    // Keep the last good number so the badge does not blink to
                    // nothing over one dropped request.
                    count: previous?.count ?? null,
                    ts: Date.now(),
                    failures: (previous?.failures ?? 0) + 1,
                });
                return previous?.count ?? null;
            }
            feedCache.set(labelForFeed, { count, ts: Date.now(), failures: 0 });
            return count;
        })
        .finally(() => {
            inFlightFeeds.delete(labelForFeed);
        });

    inFlightFeeds.set(labelForFeed, promise);
    return promise;
}

/**
 * Update the unread count for one tab.
 *
 * Gmail's own sidebar first: when the view has a row there, the badge shows
 * exactly what that row shows, nothing when it shows nothing. That is the
 * number the user compares the badge with, and it already follows their inbox
 * type, categories and language. Only a label with no row (hidden from the
 * label list, or under a collapsed parent) falls back to the Atom feed.
 */
export async function updateUnreadCount(tab: Tab, tabEl: HTMLElement): Promise<void> {
    const countSpan = tabEl.querySelector('.unread-count');
    if (!countSpan) return;

    const link = findSidebarLink(tab);
    if (link) {
        countSpan.textContent = readSidebarCount(link);
        return;
    }

    const labelForFeed = resolveFeedLabel(tab);
    if (labelForFeed === null) {
        countSpan.textContent = '';
        return;
    }
    const count = await getCachedFeedCount(labelForFeed);
    // The sidebar may have arrived while the feed was on the wire.
    const lateLink = findSidebarLink(tab);
    if (lateLink) {
        countSpan.textContent = readSidebarCount(lateLink);
        return;
    }
    countSpan.textContent = count !== null && count > 0 ? count.toString() : '';
}

// ---------------------------------------------------------------------------
// Gmail's sidebar
// ---------------------------------------------------------------------------

/** A hash fragment as Gmail writes it, decoded: `label/Work+Stuff` is `label/Work Stuff`. */
function decodeViewFragment(fragment: string): string {
    const raw = fragment.replace(/\+/g, ' ');
    try {
        return decodeURIComponent(raw);
    } catch {
        return raw;
    }
}

/**
 * The view a tab opens, in the form a sidebar link's hash takes once decoded
 * and lower-cased: `inbox`, `drafts`, `category/updates`, `label/work/clients`.
 * Null for a search, which Gmail's sidebar never counts.
 */
export function sidebarViewKey(tab: Tab): string | null {
    if (tab.type === 'label') {
        const lower = tab.value.toLowerCase();
        return lower === 'inbox' || lower === 'sent' ? lower : `label/${lower}`;
    }
    if (!tab.value.startsWith('#') || tab.value.startsWith('#search/')) return null;
    return decodeViewFragment(tab.value.slice(1)).toLowerCase();
}

/** The sidebar link for the view a tab opens, or null when Gmail shows none. */
export function findSidebarLink(tab: Tab): HTMLAnchorElement | null {
    const key = sidebarViewKey(tab);
    if (!key) return null;
    for (const selector of SIDEBAR_LINK_SELECTORS) {
        for (const link of document.querySelectorAll<HTMLAnchorElement>(selector)) {
            const href = link.getAttribute('href') || '';
            const hash = href.indexOf('#');
            if (hash >= 0 && decodeViewFragment(href.slice(hash + 1)).toLowerCase() === key) return link;
        }
    }
    return null;
}

/** Digits with the separators a locale may group them with: `9`, `1,234`, `1.234`. */
const DISPLAYED_COUNT = /^[\p{Nd}][\p{Nd}.,'\u00a0\u202f ]*$/u;

/**
 * The count Gmail shows on a sidebar row, as Gmail writes it, or '' when it
 * shows none. The visible number is read before the aria-label, because the
 * aria-label's wording ("9 unread") is in the user's language and the number
 * is not.
 */
export function readSidebarCount(link: Element): string {
    const row = link.closest(SIDEBAR_ROW_SELECTOR);
    if (row) {
        for (const el of row.querySelectorAll(UNREAD_COUNT_SELECTOR)) {
            // A parent label's row can hold its children's rows; their counts
            // are theirs, not the parent's.
            if (el.closest(SIDEBAR_ROW_SELECTOR) !== row) continue;
            const text = (el.textContent || '').trim();
            return DISPLAYED_COUNT.test(text) ? text : '';
        }
    }
    const inner = link.querySelector(UNREAD_COUNT_SELECTOR);
    if (inner) {
        const text = (inner.textContent || '').trim();
        return DISPLAYED_COUNT.test(text) ? text : '';
    }
    const match = (link.getAttribute('aria-label') || '').match(/(\d[\d,.]*)\s+unread/i);
    return match ? match[1] : '';
}

/**
 * Re-read every badge whose view has a sidebar row. Called whenever Gmail
 * changes a count in the sidebar, so a badge follows Gmail as it changes.
 */
export function refreshCountsFromSidebar(): void {
    const bar = document.getElementById(TABS_BAR_ID);
    if (!bar) return;
    bar.querySelectorAll<HTMLElement>('.gmail-tab').forEach((tabEl) => {
        const countSpan = tabEl.querySelector('.unread-count');
        const value = tabEl.dataset.value;
        if (!countSpan || !value) return;
        const tab: Tab = { id: '', title: '', type: tabEl.dataset.type === 'label' ? 'label' : 'hash', value };
        const link = findSidebarLink(tab);
        if (!link) return;
        const text = readSidebarCount(link);
        if (countSpan.textContent !== text) countSpan.textContent = text;
    });
}

/** The smallest element holding every sidebar link, or null before Gmail has drawn them. */
function findSidebarRoot(): Element | null {
    const links: Element[] = [];
    for (const selector of SIDEBAR_LINK_SELECTORS) links.push(...document.querySelectorAll(selector));
    if (links.length === 0) return null;
    let root: Element | null = links[0].parentElement;
    while (root && !links.every((l) => root!.contains(l))) root = root.parentElement;
    // A count sits beside its link, so the root must hold whole rows.
    const row = root?.closest(SIDEBAR_ROW_SELECTOR);
    return row ? row.parentElement ?? row : root;
}

const SIDEBAR_SETTLE_MS = 250;
const SIDEBAR_FIND_RETRY_MS = 2000;

/**
 * Watch Gmail's sidebar and call `onChange` (debounced) when anything in it
 * changes, and once as soon as it is first found. Gmail redraws the sidebar
 * now and then, so a root that leaves the page is found again. Returns a
 * function that stops watching.
 */
export function watchSidebarCounts(onChange: () => void): () => void {
    let observer: MutationObserver | null = null;
    let observed: Element | null = null;
    let settle: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;

    const fire = () => {
        if (settle) clearTimeout(settle);
        settle = setTimeout(() => {
            settle = null;
            if (!stopped) onChange();
        }, SIDEBAR_SETTLE_MS);
    };

    const attach = () => {
        if (stopped || (observed && observed.isConnected)) return;
        observer?.disconnect();
        observed = findSidebarRoot();
        if (!observed) return;
        observer = new MutationObserver(fire);
        observer.observe(observed, { subtree: true, childList: true, characterData: true });
        fire();
    };

    attach();
    const finder = setInterval(attach, SIDEBAR_FIND_RETRY_MS);
    return () => {
        stopped = true;
        clearInterval(finder);
        if (settle) clearTimeout(settle);
        observer?.disconnect();
    };
}
