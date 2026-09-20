/**
 * pageWorld.ts
 *
 * This script is injected into the "MAIN" world of the Gmail page.
 * It has access to the same window and global objects as Gmail's own scripts.
 *
 * Purpose:
 * Intercept XMLHttpRequest to capture real-time unread count updates from Gmail's
 * internal API responses (specifically /sync/ and /mail/u/0/).
 */

// Define the shape of the data we want to extract
interface UnreadUpdate {
    label: string;
    count: number;
}

/** Extended XMLHttpRequest with URL tracking for interception */
interface InstrumentedXHR extends XMLHttpRequest {
    _url: string;
}

// ---------------------------------------------------------------------------
// Known-label filter (populated by the content script)
// ---------------------------------------------------------------------------
//
// The content script knows exactly which labels the user has tabs for and
// dispatches that set here. When populated, we only report counts for those
// labels, which is the strongest defense against Gmail's undocumented protocol
// yielding coincidental [string, number] tuples. Before the set arrives we fall
// back to the structural heuristic below so counts still work on first paint.

let knownLabels: Set<string> | null = null;

/** Normalize a label token for set membership (case/separator-insensitive, keeps ^ for system ids). */
function normalizeToken(s: string): string {
    return s.toLowerCase().replace(/[^a-z0-9^]/g, '');
}

document.addEventListener('gmailTabs:setKnownLabels', (e: Event) => {
    const detail = (e as CustomEvent).detail;
    if (Array.isArray(detail)) {
        knownLabels = new Set(detail.filter((t) => typeof t === 'string').map(normalizeToken));
    }
});

// Helper to dispatch events back to the content script (isolated world)
function dispatchUnreadUpdate(updates: UnreadUpdate[]) {
    if (!updates || updates.length === 0) return;

    const event = new CustomEvent('gmailTabs:unreadUpdate', {
        detail: updates,
    });
    document.dispatchEvent(event);
}

// Helper to parse Gmail's JSON (which often starts with )]}' or similar anti-hijacking prefixes)
function parseGmailJson(text: string): any {
    try {
        // Remove anti-hijacking prefix if present
        const cleanText = text.replace(/^\)]}'\n/, '');
        return JSON.parse(cleanText);
    } catch {
        return null;
    }
}

// Main interception logic
function interceptXHR() {
    const XHR = XMLHttpRequest.prototype;
    const originalOpen = XHR.open;
    const originalSend = XHR.send;

    // We don't strictly need to intercept open, but it's good for tracking URL
    XHR.open = function (this: InstrumentedXHR, method: string, url: string | URL) {
        this._url = url.toString();
        return originalOpen.apply(this, arguments as any);
    };

    XHR.send = function (this: InstrumentedXHR, _body) {
        const xhr = this;

        // Add load listener to capture response
        this.addEventListener('load', function () {
            const url = xhr._url || '';

            // Check if this is a relevant URL
            // 1. /sync/ - Contains updates (new emails, read status changes)
            // 2. /mail/u/X/ - Initial load or refresh often hits this
            if (url.includes('/sync/') || (url.includes('/mail/u/') && !url.includes('?'))) {
                try {
                    const responseText = xhr.responseText;
                    if (responseText) {
                        processResponse(responseText);
                    }
                } catch (e) {
                    console.error('Gmail Tabs: Error processing XHR response', e);
                }
            }
        });

        return originalSend.apply(this, arguments as any);
    };
}

/**
 * Process the raw response text from Gmail
 * This is the tricky part - Gmail's protocol is complex and minified.
 * We look for patterns that resemble label counts.
 */
function processResponse(responseText: string) {
    const data = parseGmailJson(responseText);
    if (!data) return;

    const updates: UnreadUpdate[] = [];

    // Recursive search for label counts in the deep array structure
    // Gmail often sends arrays like [["label_id", count, ...], ...]
    // Common System Labels: ^i (Inbox), ^t (Starred), ^s (Sent), ^r (Drafts), ^all (All Mail)
    // Custom Labels: label-name

    // We'll use a heuristic: look for arrays where:
    // index 0 is a string (label ID)
    // index 1 is a number (unread count) - sometimes it's index 2 or 3 depending on the specific endpoint

    // NOTE: This is a simplified heuristic. Gmail's format changes.
    // A more robust way often involves looking for specific "u" (unread) keys or known structures.
    // For now, we'll try to find the specific "counts" array which is usually present in initial load
    // and some sync responses.

    findCounts(data, updates);

    if (updates.length > 0) {
        dispatchUnreadUpdate(updates);
    }
}

function findCounts(obj: any, updates: UnreadUpdate[]) {
    if (!obj || typeof obj !== 'object') return;

    if (Array.isArray(obj)) {
        // Heuristic for Label Count Tuple: [ "LabelName", UnreadCount, ... ]
        // Usually: [ "LabelName", UnreadCount, TotalCount, ... ]
        // Constraints:
        // - Length >= 2
        // - [0] is string (Label ID)
        // - [1] is integer (Unread Count)

        if (obj.length >= 2 && typeof obj[0] === 'string' && typeof obj[1] === 'number') {
            const labelId = obj[0];
            const count = obj[1];

            if (isValidLabel(labelId) && isValidCount(count) && isKnownLabel(labelId)) {
                updates.push({ label: labelId, count });
            }
        }

        // Continue searching children
        for (const item of obj) {
            findCounts(item, updates);
        }
    } else {
        // Object
        for (const key in obj) {
            findCounts(obj[key], updates);
        }
    }
}

function isValidLabel(label: string): boolean {
    // Basic filter to avoid false positives.
    // Gmail system labels: ^i, ^t, ^b, ^f, ^k, ^s, ^r, ^all, ^io_im
    // Internal ids: Label_NN. Custom labels: human-readable text.

    if (!label) return false;
    if (label.includes('http')) return false;
    if (label.includes('gmail/att/')) return false; // Attachment paths
    if (label.startsWith('/')) return false; // Real labels do not start with a slash
    if (label.length > 80) return false; // Too long to be a label

    // Reject pure-digit tokens (timestamps, counters, ids) that commonly appear
    // as [string, number] tuples in Gmail's protocol but are never labels.
    // (Other id-shaped garbage is filtered by isValidCount + the known-label set.)
    if (/^\d+$/.test(label)) return false;

    return true;
}

/** A plausible unread count: a non-negative integer within a sane bound. */
function isValidCount(count: number): boolean {
    return Number.isInteger(count) && count >= 0 && count <= 100000;
}

/**
 * When the content script has told us which labels the user actually has tabs
 * for, only those are reported. Before that set arrives, accept anything that
 * passed the structural checks.
 */
function isKnownLabel(labelId: string): boolean {
    if (!knownLabels || knownLabels.size === 0) return true;
    return knownLabels.has(normalizeToken(labelId));
}

// Start interception
interceptXHR();
console.log('Gmail Tabs: pageWorld.js loaded and intercepting XHR');
