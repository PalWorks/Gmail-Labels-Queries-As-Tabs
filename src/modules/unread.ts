/**
 * unread.ts
 *
 * Unread count management for Gmail Labels as Tabs.
 * Handles Atom feed fetching, DOM scraping fallback, label map building,
 * and real-time XHR update processing.
 */

import { Tab } from '../utils/storage';
import { TABS_BAR_ID } from './state';

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
        .replace(/[\/\-_]/g, ' ')
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

    const labelLinks = document.querySelectorAll('a[href*="#label/"]');

    labelLinks.forEach(link => {
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
// XHR Unread Update Handler
// ---------------------------------------------------------------------------

/**
 * Process incoming unread count updates from the XHR interceptor.
 * Matches updates to visible tab elements and updates their badges.
 */
export function handleUnreadUpdates(updates: { label: string; count: number }[]): void {
    console.log('Gmail Tabs: Received unread updates', updates);

    const updateMap = new Map<string, number>();
    updates.forEach(u => updateMap.set(u.label, u.count));

    const domLabelMap = buildLabelMapFromDOM();

    const normalize = (str: string) => str.toLowerCase().replace(/[^a-z0-9]/g, '');

    const bar = document.getElementById(TABS_BAR_ID);
    if (!bar) return;

    const tabs = bar.querySelectorAll('.gmail-tab');
    tabs.forEach(t => {
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
 * Update unread count for a single tab using Atom Feed (primary)
 * with DOM scraping as fallback.
 */
export async function updateUnreadCount(tab: Tab, tabEl: HTMLElement): Promise<void> {
    const countSpan = tabEl.querySelector('.unread-count');
    if (!countSpan) return;

    let labelForFeed = '';

    if (tab.type === 'label') {
        labelForFeed = tab.value;
        if (labelForFeed.toLowerCase() === 'inbox') {
            labelForFeed = '';
        }
    } else if (tab.type === 'hash') {
        if (tab.value === '#inbox') {
            labelForFeed = '';
        } else if (tab.value === '#sent') {
            labelForFeed = '^f';
        } else if (tab.value.startsWith('#label/')) {
            labelForFeed = tab.value.replace('#label/', '');
        }
    }

    if (labelForFeed !== undefined) {
        try {
            const encodedLabel = labelForFeed ? encodeURIComponent(labelForFeed) : '';
            const feedUrl = `${location.origin}${location.pathname}feed/atom/${encodedLabel}`;

            const response = await fetch(feedUrl);
            if (response.ok) {
                const text = await response.text();
                const parser = new DOMParser();
                const xmlDoc = parser.parseFromString(text, "text/xml");
                const fullcount = xmlDoc.querySelector('fullcount');

                if (fullcount && fullcount.textContent) {
                    const count = parseInt(fullcount.textContent, 10);
                    if (count > 0) {
                        countSpan.textContent = count.toString();
                        return;
                    }
                }
            }
        } catch (e) {
            console.warn('Gmail Tabs: Failed to fetch atom feed for', labelForFeed, e);
        }
    }

    const domCount = getUnreadCountFromDOM(tab);
    if (domCount) {
        countSpan.textContent = domCount;
    } else {
        countSpan.textContent = '';
    }
}

/**
 * Legacy DOM Scraping fallback for unread counts.
 */
export function getUnreadCountFromDOM(tab: Tab): string {
    const isInbox = (tab.type === 'hash' && tab.value === '#inbox') ||
        (tab.type === 'label' && tab.value.toLowerCase() === 'inbox');

    const isSent = (tab.type === 'hash' && tab.value === '#sent') ||
        (tab.type === 'label' && tab.value.toLowerCase() === 'sent');

    if (isInbox || isSent) {
        const nav = document.querySelector('[role="navigation"]') || document.querySelector('.wT');
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
                const bsU = link.querySelector('.bsU');
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
        const candidates = document.querySelectorAll('a[href*="#label/"]');

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

        const countEl = link.querySelector('.bsU');
        if (countEl) {
            return countEl.textContent || '';
        }
    }

    return '';
}
