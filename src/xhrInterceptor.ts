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

// Helper to dispatch events back to the content script (isolated world)
function dispatchUnreadUpdate(updates: UnreadUpdate[]) {
    if (!updates || updates.length === 0) return;

    const event = new CustomEvent('gmailTabs:unreadUpdate', {
        detail: updates
    });
    document.dispatchEvent(event);
}

// Helper to parse Gmail's JSON (which often starts with )]}' or similar anti-hijacking prefixes)
function parseGmailJson(text: string): any {
    try {
        // Remove anti-hijacking prefix if present
        const cleanText = text.replace(/^\)]}'\n/, '');
        return JSON.parse(cleanText);
    } catch (e) {
        // console.warn('Gmail Tabs: Failed to parse JSON', e);
        return null;
    }
}

// Main interception logic
function interceptXHR() {
    const XHR = XMLHttpRequest.prototype;
    const originalOpen = XHR.open;
    const originalSend = XHR.send;

    // We don't strictly need to intercept open, but it's good for tracking URL
    XHR.open = function (method: string, url: string | URL) {
        // @ts-ignore
        this._url = url.toString();
        // @ts-ignore
        return originalOpen.apply(this, arguments);
    };

    XHR.send = function (body) {
        const xhr = this;

        // Add load listener to capture response
        this.addEventListener('load', function () {
            // @ts-ignore
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

        // @ts-ignore
        return originalSend.apply(this, arguments);
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

            // Filter out unlikely candidates (too short strings might be other flags, but labels can be short)
            // System labels start with ^ usually.
            if (isValidLabel(labelId)) {
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
    // Basic filter to avoid false positives
    // Gmail system labels: ^i, ^t, ^b, ^f, ^k, ^s, ^r, ^all, ^io_im
    // Custom labels: anything string

    // Exclude obvious non-labels
    if (!label) return false;
    if (label.includes('http')) return false;
    if (label.includes('gmail/att/')) return false; // Attachment paths
    if (label.includes('/')) {
        // Custom labels CAN have slashes (Nested/Label), but usually not starting with gmail/
        // Let's be careful. Real labels don't usually start with a slash.
        if (label.startsWith('/')) return false;
    }
    if (label.length > 80) return false; // Unlikely to be a label if extremely long

    // Reject if it looks like a file path or ID string that isn't a label
    // e.g. "1764..." (timestamps/IDs often appear as strings)
    // Real labels are usually either:
    // 1. System: ^...
    // 2. Internal: Label_...
    // 3. Custom: Human readable text

    return true;
}

// Start interception
interceptXHR();
console.log('Gmail Tabs: pageWorld.js loaded and intercepting XHR');
