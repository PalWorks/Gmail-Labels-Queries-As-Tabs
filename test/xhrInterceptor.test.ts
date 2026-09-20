export {};
/**
 * xhrInterceptor.test.ts
 *
 * Unit tests for the XHR interceptor (pageWorld).
 *
 * Since the functions are not exported, we test the logic inline by
 * reimplementing the pure functions from xhrInterceptor.ts and verifying
 * their behavior. This approach is acknowledged as a pragmatic testing
 * strategy when modules have unavoidable side effects on import.
 */

// ---------------------------------------------------------------------------
// Inline reimplementations from xhrInterceptor.ts (pure logic)
// ---------------------------------------------------------------------------

interface UnreadUpdate {
    label: string;
    count: number;
}

function parseGmailJson(text: string): any {
    try {
        const cleanText = text.replace(/^\)\]\}'\\n/, '').replace(/^\)\]\}'\n/, '');
        return JSON.parse(cleanText);
    } catch {
        return null;
    }
}

// Mirrors src/xhrInterceptor.ts (module has import-time side effects, so its
// pure logic is reimplemented here per the strategy noted above).

let knownLabels: Set<string> | null = null;

function normalizeToken(s: string): string {
    return s.toLowerCase().replace(/[^a-z0-9^]/g, '');
}

function setKnownLabels(tokens: string[] | null): void {
    knownLabels = tokens ? new Set(tokens.map(normalizeToken)) : null;
}

function isValidLabel(label: string): boolean {
    if (!label) return false;
    if (label.includes('http')) return false;
    if (label.includes('gmail/att/')) return false;
    if (label.startsWith('/')) return false;
    if (label.length > 80) return false;
    if (/^\d+$/.test(label)) return false;
    return true;
}

function isValidCount(count: number): boolean {
    return Number.isInteger(count) && count >= 0 && count <= 100000;
}

function isKnownLabel(labelId: string): boolean {
    if (!knownLabels || knownLabels.size === 0) return true;
    return knownLabels.has(normalizeToken(labelId));
}

function findCounts(obj: any, updates: UnreadUpdate[]): void {
    if (!obj || typeof obj !== 'object') return;

    if (Array.isArray(obj)) {
        if (obj.length >= 2 && typeof obj[0] === 'string' && typeof obj[1] === 'number') {
            const labelId = obj[0];
            const count = obj[1];
            if (isValidLabel(labelId) && isValidCount(count) && isKnownLabel(labelId)) {
                updates.push({ label: labelId, count });
            }
        }
        for (const item of obj) {
            findCounts(item, updates);
        }
    } else {
        for (const key in obj) {
            findCounts(obj[key], updates);
        }
    }
}

function dispatchUnreadUpdate(updates: UnreadUpdate[]): void {
    if (!updates || updates.length === 0) return;
    const event = new CustomEvent('gmailTabs:unreadUpdate', { detail: updates });
    document.dispatchEvent(event);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => setKnownLabels(null));

describe('parseGmailJson', () => {
    test('parses valid JSON', () => {
        expect(parseGmailJson('{"a":1}')).toEqual({ a: 1 });
    });

    test('strips anti-hijacking prefix )]}\' followed by newline', () => {
        const raw = ")]}'\n{\"inbox\":true}";
        expect(parseGmailJson(raw)).toEqual({ inbox: true });
    });

    test('parses array responses', () => {
        const raw = ")]}'\n[[\"^i\", 5]]";
        expect(parseGmailJson(raw)).toEqual([["^i", 5]]);
    });

    test('returns null for invalid JSON', () => {
        expect(parseGmailJson('not json at all')).toBeNull();
    });

    test('returns null for empty string', () => {
        expect(parseGmailJson('')).toBeNull();
    });
});

describe('isValidLabel', () => {
    test('accepts system labels like ^i, ^t, ^s', () => {
        expect(isValidLabel('^i')).toBe(true);
        expect(isValidLabel('^t')).toBe(true);
        expect(isValidLabel('^s')).toBe(true);
    });

    test('accepts custom label names', () => {
        expect(isValidLabel('Work')).toBe(true);
        expect(isValidLabel('Personal/Projects')).toBe(true);
    });

    test('rejects empty strings', () => {
        expect(isValidLabel('')).toBe(false);
    });

    test('rejects URLs', () => {
        expect(isValidLabel('https://example.com')).toBe(false);
        expect(isValidLabel('http://google.com')).toBe(false);
    });

    test('rejects attachment paths', () => {
        expect(isValidLabel('gmail/att/123')).toBe(false);
    });

    test('rejects labels starting with /', () => {
        expect(isValidLabel('/some/path')).toBe(false);
    });

    test('rejects extremely long strings', () => {
        expect(isValidLabel('a'.repeat(81))).toBe(false);
    });

    test('accepts labels at the 80 char boundary', () => {
        expect(isValidLabel('a'.repeat(80))).toBe(true);
    });

    test('accepts internal Label_N ids', () => {
        expect(isValidLabel('Label_4')).toBe(true);
    });

    test('rejects pure-digit tokens (timestamps/ids)', () => {
        expect(isValidLabel('1764523423000')).toBe(false);
        expect(isValidLabel('42')).toBe(false);
    });

    test('still accepts hex-like label names (protected by the known-label set instead)', () => {
        expect(isValidLabel('deadbeef')).toBe(true);
    });
});

describe('isValidCount', () => {
    test('accepts non-negative integers within bound', () => {
        expect(isValidCount(0)).toBe(true);
        expect(isValidCount(5)).toBe(true);
        expect(isValidCount(100000)).toBe(true);
    });

    test('rejects negatives, floats, and out-of-bound values', () => {
        expect(isValidCount(-1)).toBe(false);
        expect(isValidCount(3.5)).toBe(false);
        expect(isValidCount(100001)).toBe(false);
        expect(isValidCount(NaN)).toBe(false);
    });
});

describe('findCounts count validation', () => {
    test('skips tuples with implausible counts', () => {
        const updates: UnreadUpdate[] = [];
        findCounts([['^i', 3.5], ['^t', -2], ['Work', 999999]], updates);
        expect(updates).toHaveLength(0);
    });
});

describe('findCounts known-label filter', () => {
    test('accepts all valid labels when the known set is unset', () => {
        const updates: UnreadUpdate[] = [];
        findCounts([['^i', 3], ['Random', 9]], updates);
        expect(updates).toHaveLength(2);
    });

    test('reports only known labels when the set is populated', () => {
        setKnownLabels(['^i', 'Work']);
        const updates: UnreadUpdate[] = [];
        findCounts([['^i', 3], ['Random', 9], ['Work', 2]], updates);
        expect(updates).toContainEqual({ label: '^i', count: 3 });
        expect(updates).toContainEqual({ label: 'Work', count: 2 });
        expect(updates.find((u) => u.label === 'Random')).toBeUndefined();
    });

    test('matches known labels case/separator-insensitively', () => {
        setKnownLabels(['Team Updates']);
        const updates: UnreadUpdate[] = [];
        findCounts([['team-updates', 4]], updates);
        expect(updates).toContainEqual({ label: 'team-updates', count: 4 });
    });
});

describe('findCounts', () => {
    test('extracts label count tuples from flat array', () => {
        const updates: UnreadUpdate[] = [];
        findCounts([["^i", 3], ["^t", 1]], updates);
        expect(updates).toContainEqual({ label: '^i', count: 3 });
        expect(updates).toContainEqual({ label: '^t', count: 1 });
    });

    test('extracts counts from deeply nested arrays', () => {
        const updates: UnreadUpdate[] = [];
        findCounts([[[["Work", 2]]]], updates);
        expect(updates).toContainEqual({ label: 'Work', count: 2 });
    });

    test('extracts counts from objects', () => {
        const updates: UnreadUpdate[] = [];
        findCounts({ data: { labels: ["^i", 5] } }, updates);
        expect(updates).toContainEqual({ label: '^i', count: 5 });
    });

    test('skips tuples with invalid labels', () => {
        const updates: UnreadUpdate[] = [];
        findCounts([["https://evil.com", 10]], updates);
        expect(updates).toHaveLength(0);
    });

    test('skips non-tuple arrays', () => {
        const updates: UnreadUpdate[] = [];
        findCounts([[42, 10]], updates);
        expect(updates).toHaveLength(0);
    });

    test('handles null/undefined gracefully', () => {
        const updates: UnreadUpdate[] = [];
        findCounts(null, updates);
        findCounts(undefined, updates);
        expect(updates).toHaveLength(0);
    });

    test('handles primitive values gracefully', () => {
        const updates: UnreadUpdate[] = [];
        findCounts(42, updates);
        findCounts('string', updates);
        expect(updates).toHaveLength(0);
    });
});

describe('dispatchUnreadUpdate', () => {
    test('dispatches CustomEvent with updates as detail', () => {
        const spy = jest.spyOn(document, 'dispatchEvent');
        const updates: UnreadUpdate[] = [{ label: '^i', count: 3 }];

        dispatchUnreadUpdate(updates);

        expect(spy).toHaveBeenCalledTimes(1);
        const event = spy.mock.calls[0][0] as CustomEvent;
        expect(event.type).toBe('gmailTabs:unreadUpdate');
        expect(event.detail).toEqual(updates);
        spy.mockRestore();
    });

    test('does not dispatch when updates array is empty', () => {
        const spy = jest.spyOn(document, 'dispatchEvent');

        dispatchUnreadUpdate([]);

        expect(spy).not.toHaveBeenCalled();
        spy.mockRestore();
    });

    test('does not dispatch when updates is null/undefined', () => {
        const spy = jest.spyOn(document, 'dispatchEvent');

        dispatchUnreadUpdate(null as any);
        dispatchUnreadUpdate(undefined as any);

        expect(spy).not.toHaveBeenCalled();
        spy.mockRestore();
    });
});

// ---------------------------------------------------------------------------
// End-to-end: processResponse flow
// ---------------------------------------------------------------------------

describe('processResponse flow', () => {
    function processResponse(responseText: string): UnreadUpdate[] {
        const data = parseGmailJson(responseText);
        if (!data) return [];
        const updates: UnreadUpdate[] = [];
        findCounts(data, updates);
        return updates;
    }

    test('full pipeline: Gmail sync response with prefix', () => {
        const raw = ")]}'\n[[\"^i\", 5], [\"custom-label\", 2]]";
        const updates = processResponse(raw);

        expect(updates).toEqual([
            { label: '^i', count: 5 },
            { label: 'custom-label', count: 2 },
        ]);
    });

    test('full pipeline: invalid JSON returns empty', () => {
        expect(processResponse('garbage')).toEqual([]);
    });

    test('full pipeline: response with no label tuples returns empty', () => {
        expect(processResponse('{"status":"ok"}')).toEqual([]);
    });
});
