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
    NAV_SELECTORS,
    UNREAD_COUNT_SELECTOR,
    LABEL_LINK_SELECTOR,
} from '../utils/selectors';

// ---------------------------------------------------------------------------
// Label Normalization
// ---------------------------------------------------------------------------

/**
 * Normalize label name for fuzzy matching.
 * Lowercase, replace separators with space, collapse whitespace.
 */
export function normalizeLabel(name: string): string {
    return decodeURIComponent(name)
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

        let labelId = '';
        if (tabType === 'label') {
            labelId = tabValue;
        } else if (tabType === 'hash') {
            if (tabValue === '#inbox') labelId = '^i';
            else if (tabValue === '#starred') labelId = '^t';
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
        }
    });
}

// ---------------------------------------------------------------------------
// Atom Feed + DOM Scraping
// ---------------------------------------------------------------------------

/**
 * Resolve which Atom feed label a tab maps to.
 * Returns null when the tab has no queryable feed (e.g. #starred, #drafts,
 * #search/...). '' is a real value meaning the Inbox feed; distinguishing it
 * from null prevents non-label hash tabs from wrongly showing the Inbox count.
 */
export function resolveFeedLabel(tab: Tab): string | null {
    if (tab.type === 'label') {
        return tab.value.toLowerCase() === 'inbox' ? '' : tab.value;
    }
    if (tab.type === 'hash') {
        if (tab.value === '#inbox') return '';
        if (tab.value === '#sent') return '^f';
        if (tab.value.startsWith('#label/')) return tab.value.replace('#label/', '');
    }
    return null;
}

// ---------------------------------------------------------------------------
// Atom feed cache (TTL + in-flight coalescing)
// ---------------------------------------------------------------------------
//
// renderTabs() runs frequently (storage changes, re-render events), and each
// run asks every tab for its count. Without caching, that is one network fetch
// per tab per render. We cache the parsed feed count per label for a short TTL
// and coalesce concurrent identical requests into a single fetch.

const FEED_CACHE_TTL_MS = 30_000;

interface FeedCacheEntry {
    count: number;
    ts: number;
}

const feedCache = new Map<string, FeedCacheEntry>();
const inFlightFeeds = new Map<string, Promise<number>>();

/** Clears the Atom feed cache. Primarily used by tests and forced refreshes. */
export function clearUnreadCountCache(): void {
    feedCache.clear();
    inFlightFeeds.clear();
}

// A stalled connection must not hold the in-flight slot open: without this,
// one hung request froze that label's count until the page was reloaded,
// because the coalescing entry is only cleared when the promise settles.
const FEED_FETCH_TIMEOUT_MS = 10_000;

/** Fetch + parse the Atom feed for a label, returning the unread count (0 on any failure). */
async function fetchFeedCount(labelForFeed: string): Promise<number> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FEED_FETCH_TIMEOUT_MS);

    try {
        const encodedLabel = labelForFeed ? encodeURIComponent(labelForFeed) : '';
        const feedUrl = `${location.origin}${location.pathname}feed/atom/${encodedLabel}`;

        const response = await fetch(feedUrl, { signal: controller.signal });
        if (!response.ok) return 0;

        const text = await response.text();
        const xmlDoc = new DOMParser().parseFromString(text, 'text/xml');
        const fullcount = xmlDoc.querySelector('fullcount');
        if (fullcount && fullcount.textContent) {
            const count = parseInt(fullcount.textContent, 10);
            return Number.isFinite(count) && count > 0 ? count : 0;
        }
        return 0;
    } catch (e) {
        console.warn('Gmail Tabs: Failed to fetch atom feed for', labelForFeed, e);
        return 0;
    } finally {
        clearTimeout(timeout);
    }
}

/** Cached, coalesced accessor for a label's feed count. */
async function getCachedFeedCount(labelForFeed: string): Promise<number> {
    const cached = feedCache.get(labelForFeed);
    if (cached && Date.now() - cached.ts < FEED_CACHE_TTL_MS) {
        return cached.count;
    }

    const existing = inFlightFeeds.get(labelForFeed);
    if (existing) return existing;

    const promise = fetchFeedCount(labelForFeed)
        .then((count) => {
            feedCache.set(labelForFeed, { count, ts: Date.now() });
            return count;
        })
        .finally(() => {
            inFlightFeeds.delete(labelForFeed);
        });

    inFlightFeeds.set(labelForFeed, promise);
    return promise;
}

/**
 * Update unread count for a single tab using the Atom feed (primary, cached)
 * with DOM scraping as fallback.
 */
export async function updateUnreadCount(tab: Tab, tabEl: HTMLElement): Promise<void> {
    const countSpan = tabEl.querySelector('.unread-count');
    if (!countSpan) return;

    const labelForFeed = resolveFeedLabel(tab);

    if (labelForFeed !== null) {
        const count = await getCachedFeedCount(labelForFeed);
        if (count > 0) {
            countSpan.textContent = count.toString();
            return;
        }
    }

    const domCount = getUnreadCountFromDOM(tab);
    countSpan.textContent = domCount || '';
}

/**
 * Legacy DOM Scraping fallback for unread counts.
 */
export function getUnreadCountFromDOM(tab: Tab): string {
    const isInbox =
        (tab.type === 'hash' && tab.value === '#inbox') ||
        (tab.type === 'label' && tab.value.toLowerCase() === 'inbox');

    const isSent =
        (tab.type === 'hash' && tab.value === '#sent') || (tab.type === 'label' && tab.value.toLowerCase() === 'sent');

    if (isInbox || isSent) {
        const nav = document.querySelector(NAV_SELECTORS[0]) || document.querySelector(NAV_SELECTORS[1]);
        if (!nav) return '';

        const links = nav.querySelectorAll('a');
        for (const link of links) {
            const ariaLabel = link.getAttribute('aria-label') || '';
            const title = link.getAttribute('title') || '';
            const text = link.textContent || '';

            let isMatch = false;
            if (isInbox) {
                if (link.getAttribute('href')?.endsWith('#inbox')) {
                    isMatch = true;
                } else {
                    isMatch = ariaLabel.startsWith('Inbox') || title.startsWith('Inbox');
                }
            } else if (isSent) {
                isMatch =
                    ariaLabel.startsWith('Sent') ||
                    title.startsWith('Sent') ||
                    (text.includes('Sent') && (link.getAttribute('href')?.endsWith('#sent') ?? false));
            }

            if (isMatch) {
                const bsU = link.querySelector(UNREAD_COUNT_SELECTOR);
                if (bsU && bsU.textContent) return bsU.textContent;

                if (ariaLabel) {
                    const unreadMatch = ariaLabel.match(/(\d+)\s+unread/i);
                    if (unreadMatch) return unreadMatch[1];
                    const parenMatch = ariaLabel.match(/\((\d+)\)/);
                    if (parenMatch) return parenMatch[1];
                }

                if (title) {
                    const match = title.match(/\((\d+)\)/);
                    if (match) return match[1];
                }

                const rawText = link.innerText || '';
                const textMatch = rawText.match(/(\d+)$/m);
                if (textMatch) return textMatch[1];
            }
        }
        return '';
    }

    // For Labels (and hash labels)
    let labelName = tab.value;
    if (tab.type === 'hash' && tab.value.startsWith('#label/')) {
        labelName = tab.value.replace('#label/', '');
    }

    const encodedLabel = encodeURIComponent(labelName).replace(/%20/g, '+');
    const hrefSuffix = '#' + 'label/' + encodedLabel;
    let link = document.querySelector('a[href$="' + hrefSuffix + '"]');

    if (!link) {
        const normalizedTarget = normalizeLabel(labelName);
        const candidates = document.querySelectorAll(LABEL_LINK_SELECTOR);

        for (const candidate of candidates) {
            const title = candidate.getAttribute('title');
            if (title && normalizeLabel(title) === normalizedTarget) {
                link = candidate;
                break;
            }

            const ariaLabel = candidate.getAttribute('aria-label');
            if (ariaLabel) {
                const href = candidate.getAttribute('href');
                if (href) {
                    const hrefLabel = href.split('#label/')[1];
                    if (hrefLabel && normalizeLabel(hrefLabel) === normalizedTarget) {
                        link = candidate;
                        break;
                    }
                }
            }
        }
    }

    if (link) {
        const ariaLabel = link.getAttribute('aria-label');
        if (ariaLabel) {
            const match = ariaLabel.match(/(\d+)\s+unread/);
            return match ? match[1] : '';
        }

        const countEl = link.querySelector(UNREAD_COUNT_SELECTOR);
        if (countEl) {
            return countEl.textContent || '';
        }
    }

    return '';
}
