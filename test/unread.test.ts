export {};
/**
 * unread.test.ts
 *
 * Unit tests for the unread count module.
 * Covers normalizeLabel(), buildLabelMapFromDOM(), handleUnreadUpdates(),
 * and getUnreadCountFromDOM().
 */

// ---------------------------------------------------------------------------
// Mock Dependencies
// ---------------------------------------------------------------------------

jest.mock('../src/modules/state', () => ({
    TABS_BAR_ID: 'gmail-labels-as-tabs-bar',
}));

import {
    normalizeLabel,
    buildLabelMapFromDOM,
    handleUnreadUpdates,
    getUnreadCountFromDOM,
    updateUnreadCount,
    clearUnreadCountCache,
    computeKnownLabelTokens,
} from '../src/modules/unread';
import { Tab } from '../src/utils/storage';
import { microtasks } from './helpers/async';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a mock Gmail sidebar with label links. */
function createMockSidebar(labels: { title: string; href: string; ariaLabel?: string; childTitle?: string }[]): void {
    const nav = document.createElement('div');
    nav.setAttribute('role', 'navigation');

    labels.forEach(({ title, href, ariaLabel, childTitle }) => {
        const link = document.createElement('a');
        link.href = href;
        if (title) link.title = title;
        if (ariaLabel) link.setAttribute('aria-label', ariaLabel);
        if (childTitle) {
            const child = document.createElement('span');
            child.title = childTitle;
            link.appendChild(child);
        }
        nav.appendChild(link);
    });

    document.body.appendChild(nav);
}

/** Create a tabs bar with tab elements for handleUnreadUpdates testing. */
function createMockTabBar(tabs: { value: string; type: string }[]): void {
    const bar = document.createElement('div');
    bar.id = 'gmail-labels-as-tabs-bar';

    tabs.forEach((tab) => {
        const tabEl = document.createElement('div');
        tabEl.className = 'gmail-tab';
        tabEl.dataset.value = tab.value;
        tabEl.dataset.type = tab.type;

        const countSpan = document.createElement('span');
        countSpan.className = 'unread-count';
        tabEl.appendChild(countSpan);

        bar.appendChild(tabEl);
    });

    document.body.appendChild(bar);
}

/** Build a mock inbox/sent sidebar link with optional unread indicators. */
function createMockInboxLink(options: {
    href: string;
    ariaLabel?: string;
    title?: string;
    bsUText?: string;
    innerText?: string;
}): void {
    const nav = document.createElement('div');
    nav.setAttribute('role', 'navigation');

    const link = document.createElement('a');
    link.href = options.href;
    if (options.ariaLabel) link.setAttribute('aria-label', options.ariaLabel);
    if (options.title) link.title = options.title;
    if (options.bsUText) {
        const bsU = document.createElement('span');
        bsU.className = 'bsU';
        bsU.textContent = options.bsUText;
        link.appendChild(bsU);
    }
    if (options.innerText) {
        const textNode = document.createTextNode(options.innerText);
        link.appendChild(textNode);
    }

    nav.appendChild(link);
    document.body.appendChild(nav);
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
    document.body.innerHTML = '';
});

// ---------------------------------------------------------------------------
// normalizeLabel
// ---------------------------------------------------------------------------

describe('normalizeLabel', () => {
    test('normalizes slashes to spaces', () => {
        expect(normalizeLabel('Work/Tasks')).toBe('work tasks');
    });

    test('normalizes dashes to spaces', () => {
        expect(normalizeLabel('my-label')).toBe('my label');
    });

    test('normalizes underscores to spaces', () => {
        expect(normalizeLabel('my_label')).toBe('my label');
    });

    test('handles mixed case', () => {
        expect(normalizeLabel('My Label')).toBe('my label');
    });

    test('decodes URI encoded strings', () => {
        expect(normalizeLabel('My%20Label')).toBe('my label');
    });

    test('collapses multiple whitespace characters', () => {
        expect(normalizeLabel('my   label')).toBe('my label');
    });

    test('trims leading and trailing whitespace', () => {
        expect(normalizeLabel('  work  ')).toBe('work');
    });

    test('handles combined separators', () => {
        expect(normalizeLabel('Work/Sub_Task-Item')).toBe('work sub task item');
    });
});

// ---------------------------------------------------------------------------
// buildLabelMapFromDOM
// ---------------------------------------------------------------------------

describe('buildLabelMapFromDOM', () => {
    test('builds map from sidebar label links with title attribute', () => {
        createMockSidebar([
            { title: 'Work', href: 'https://mail.google.com/#label/Work' },
            { title: 'Personal', href: 'https://mail.google.com/#label/Personal' },
        ]);

        const map = buildLabelMapFromDOM();

        expect(map.get('work')).toBe('Work');
        expect(map.get('personal')).toBe('Personal');
    });

    test('falls back to child element title when link has no title', () => {
        createMockSidebar([
            { title: '', href: 'https://mail.google.com/#label/Projects', childTitle: 'Projects' },
        ]);

        const map = buildLabelMapFromDOM();

        expect(map.get('projects')).toBe('Projects');
    });

    test('falls back to aria-label when no title found', () => {
        createMockSidebar([
            { title: '', href: 'https://mail.google.com/#label/Updates', ariaLabel: 'Updates, 5 unread' },
        ]);

        const map = buildLabelMapFromDOM();

        // aria-label is split on comma, first part used as title
        expect(map.get('updates')).toBe('Updates');
    });

    test('returns empty map when no label links exist', () => {
        const map = buildLabelMapFromDOM();
        expect(map.size).toBe(0);
    });

    test('stores both title-based and id-based entries', () => {
        createMockSidebar([
            { title: 'Work', href: 'https://mail.google.com/#label/Work' },
        ]);

        const map = buildLabelMapFromDOM();

        // Both lowercase title and the decoded id should map to the id
        expect(map.has('work')).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// getUnreadCountFromDOM
// ---------------------------------------------------------------------------

describe('getUnreadCountFromDOM', () => {
    test('finds inbox count from .bsU element', () => {
        const tab: Tab = { id: 't1', title: 'Inbox', value: '#inbox', type: 'hash' };

        createMockInboxLink({
            href: '#inbox',
            ariaLabel: 'Inbox',
            bsUText: '5',
        });

        expect(getUnreadCountFromDOM(tab)).toBe('5');
    });

    test('parses inbox count from aria-label "N unread" pattern', () => {
        const tab: Tab = { id: 't1', title: 'Inbox', value: '#inbox', type: 'hash' };

        createMockInboxLink({
            href: '#inbox',
            ariaLabel: 'Inbox 3 unread',
        });

        expect(getUnreadCountFromDOM(tab)).toBe('3');
    });

    test('parses inbox count from title "(N)" pattern', () => {
        const tab: Tab = { id: 't1', title: 'Inbox', value: '#inbox', type: 'hash' };

        createMockInboxLink({
            href: '#inbox',
            ariaLabel: 'Inbox',
            title: 'Inbox (7)',
        });

        // aria-label match runs first: 'Inbox' has no number pattern,
        // so falls to title match
        expect(getUnreadCountFromDOM(tab)).toBe('7');
    });

    test('returns empty string when no count found for inbox', () => {
        const tab: Tab = { id: 't1', title: 'Inbox', value: '#inbox', type: 'hash' };

        createMockInboxLink({
            href: '#inbox',
            ariaLabel: 'Inbox',
        });

        expect(getUnreadCountFromDOM(tab)).toBe('');
    });

    test('finds label count from link with matching href', () => {
        const tab: Tab = { id: 't1', title: 'Work', value: 'Work', type: 'label' };

        const link = document.createElement('a');
        link.href = 'https://mail.google.com/#label/Work';
        link.setAttribute('aria-label', 'Work 2 unread');
        document.body.appendChild(link);

        expect(getUnreadCountFromDOM(tab)).toBe('2');
    });

    test('returns empty string for label with no matching link', () => {
        const tab: Tab = { id: 't1', title: 'NonExistent', value: 'NonExistent', type: 'label' };

        expect(getUnreadCountFromDOM(tab)).toBe('');
    });
});

// ---------------------------------------------------------------------------
// handleUnreadUpdates
// ---------------------------------------------------------------------------

describe('handleUnreadUpdates', () => {
    test('updates badge for system label ^i (inbox)', () => {
        createMockTabBar([{ value: '#inbox', type: 'hash' }]);

        // Need sidebar for buildLabelMapFromDOM called internally
        handleUnreadUpdates([{ label: '^i', count: 3 }]);

        const bar = document.getElementById('gmail-labels-as-tabs-bar')!;
        const countSpan = bar.querySelector('.unread-count');
        expect(countSpan?.textContent).toBe('3');
    });

    test('updates badge for system label ^t (starred)', () => {
        createMockTabBar([{ value: '#starred', type: 'hash' }]);

        handleUnreadUpdates([{ label: '^t', count: 7 }]);

        const bar = document.getElementById('gmail-labels-as-tabs-bar')!;
        const countSpan = bar.querySelector('.unread-count');
        expect(countSpan?.textContent).toBe('7');
    });

    test('clears badge when count is 0', () => {
        createMockTabBar([{ value: '#inbox', type: 'hash' }]);

        handleUnreadUpdates([{ label: '^i', count: 0 }]);

        const bar = document.getElementById('gmail-labels-as-tabs-bar')!;
        const countSpan = bar.querySelector('.unread-count');
        expect(countSpan?.textContent).toBe('');
    });

    test('does nothing when bar is absent', () => {
        // No bar in DOM
        expect(() => handleUnreadUpdates([{ label: '^i', count: 5 }])).not.toThrow();
    });

    test('handles multiple updates in one call', () => {
        createMockTabBar([
            { value: '#inbox', type: 'hash' },
            { value: '#starred', type: 'hash' },
        ]);

        handleUnreadUpdates([
            { label: '^i', count: 2 },
            { label: '^t', count: 4 },
        ]);

        const bar = document.getElementById('gmail-labels-as-tabs-bar')!;
        const counts = bar.querySelectorAll('.unread-count');
        expect(counts[0].textContent).toBe('2');
        expect(counts[1].textContent).toBe('4');
    });
});

// ---------------------------------------------------------------------------
// updateUnreadCount — Atom feed selection (A3)
// ---------------------------------------------------------------------------

describe('updateUnreadCount feed selection', () => {
    function makeTabEl(): HTMLElement {
        const el = document.createElement('div');
        const span = document.createElement('span');
        span.className = 'unread-count';
        el.appendChild(span);
        return el;
    }

    let fetchMock: jest.Mock;

    beforeEach(() => {
        clearUnreadCountCache();
        fetchMock = jest.fn().mockResolvedValue({
            ok: true,
            text: async () => '<feed><fullcount>9</fullcount></feed>',
        });
        (global as any).fetch = fetchMock;
    });

    test('fetches the Atom feed for the inbox tab and shows the count', async () => {
        const tab: Tab = { id: 't', title: 'Inbox', type: 'hash', value: '#inbox' };
        const el = makeTabEl();
        await updateUnreadCount(tab, el);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(el.querySelector('.unread-count')!.textContent).toBe('9');
    });

    test('does not fetch (nor show inbox count) for non-label hash tabs', async () => {
        const tab: Tab = { id: 't', title: 'Starred', type: 'hash', value: '#starred' };
        const el = makeTabEl();
        await updateUnreadCount(tab, el);

        expect(fetchMock).not.toHaveBeenCalled();
        expect(el.querySelector('.unread-count')!.textContent).toBe('');
    });

    test('serves a repeated request from cache without a second fetch', async () => {
        const tab: Tab = { id: 't', title: 'Inbox', type: 'hash', value: '#inbox' };
        await updateUnreadCount(tab, makeTabEl());
        await updateUnreadCount(tab, makeTabEl());
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    test('coalesces concurrent requests for the same label into one fetch', async () => {
        const tab: Tab = { id: 't', title: 'Inbox', type: 'hash', value: '#inbox' };
        await Promise.all([
            updateUnreadCount(tab, makeTabEl()),
            updateUnreadCount(tab, makeTabEl()),
            updateUnreadCount(tab, makeTabEl()),
        ]);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    test('passes an abort signal so a stalled feed cannot hang forever', async () => {
        const tab: Tab = { id: 't', title: 'Inbox', type: 'hash', value: '#inbox' };
        await updateUnreadCount(tab, makeTabEl());

        const init = fetchMock.mock.calls[0][1];
        expect(init?.signal).toBeInstanceOf(AbortSignal);
        expect(init.signal.aborted).toBe(false);
    });

    test('a stalled feed releases its in-flight slot once it times out', async () => {
        jest.useFakeTimers();
        try {
            // A fetch that only settles when its signal aborts, which is what a
            // dead connection looks like from here.
            const stalled = jest.fn(
                (_url: string, init: RequestInit) =>
                    new Promise((_resolve, reject) => {
                        init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
                    })
            );
            (global as any).fetch = stalled;

            const tab: Tab = { id: 't', title: 'Inbox', type: 'hash', value: '#inbox' };
            const first = updateUnreadCount(tab, makeTabEl());
            // The fetch waits for a concurrency slot before it starts its own
            // clock, so let that microtask land before advancing time.
            await microtasks();
            jest.advanceTimersByTime(10_000);
            await first;

            // The timed-out attempt settles as "no count", is recorded as a
            // failure and backed off. Past the backoff window the label
            // recovers on its own, which is the part that used to be
            // impossible: the in-flight slot never cleared, so every later
            // render re-awaited a promise that would never settle.
            (global as any).fetch = fetchMock;
            jest.advanceTimersByTime(6_000);
            await updateUnreadCount(tab, makeTabEl());
            expect(fetchMock).toHaveBeenCalledTimes(1);
        } finally {
            jest.useRealTimers();
        }
    });
});

// ---------------------------------------------------------------------------
// Slow and failing networks
// ---------------------------------------------------------------------------

describe('unread counts on a bad network', () => {
    function makeTabEl(): HTMLElement {
        const el = document.createElement('div');
        const span = document.createElement('span');
        span.className = 'unread-count';
        el.appendChild(span);
        return el;
    }

    const inbox: Tab = { id: 't', title: 'Inbox', type: 'hash', value: '#inbox' };

    function feedReturning(count: number): jest.Mock {
        return jest.fn().mockResolvedValue({
            ok: true,
            text: async () => `<feed><fullcount>${count}</fullcount></feed>`,
        });
    }

    beforeEach(() => {
        clearUnreadCountCache();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    test('a failure keeps the last count on screen instead of blanking it', async () => {
        // The old cache stored a failure as the number 0, so a single dropped
        // request made a busy label look empty for the next 30 seconds.
        (global as any).fetch = feedReturning(12);
        const good = makeTabEl();
        await updateUnreadCount(inbox, good);
        expect(good.querySelector('.unread-count')!.textContent).toBe('12');

        jest.useFakeTimers();
        (global as any).fetch = jest.fn().mockRejectedValue(new Error('offline'));

        // Past the success TTL, so this really does re-fetch and really does fail.
        jest.advanceTimersByTime(31_000);
        const afterFailure = makeTabEl();
        await updateUnreadCount(inbox, afterFailure);
        expect(afterFailure.querySelector('.unread-count')!.textContent).toBe('12');
    });

    test('a failure is not cached as zero, so recovery is not blocked for the full TTL', async () => {
        jest.useFakeTimers();
        (global as any).fetch = jest.fn().mockRejectedValue(new Error('offline'));
        await updateUnreadCount(inbox, makeTabEl());

        const recovered = feedReturning(4);
        (global as any).fetch = recovered;

        // First backoff step is 5s, well short of the 30s success TTL.
        jest.advanceTimersByTime(6_000);
        const el = makeTabEl();
        await updateUnreadCount(inbox, el);

        expect(recovered).toHaveBeenCalledTimes(1);
        expect(el.querySelector('.unread-count')!.textContent).toBe('4');
    });

    test('backs off further on each consecutive failure', async () => {
        jest.useFakeTimers();
        const failing = jest.fn().mockRejectedValue(new Error('offline'));
        (global as any).fetch = failing;

        await updateUnreadCount(inbox, makeTabEl());
        expect(failing).toHaveBeenCalledTimes(1);

        // Inside the 5s window: no second attempt.
        jest.advanceTimersByTime(4_000);
        await updateUnreadCount(inbox, makeTabEl());
        expect(failing).toHaveBeenCalledTimes(1);

        // Past it: second attempt, which pushes the window out to 10s.
        jest.advanceTimersByTime(2_000);
        await updateUnreadCount(inbox, makeTabEl());
        expect(failing).toHaveBeenCalledTimes(2);

        jest.advanceTimersByTime(6_000);
        await updateUnreadCount(inbox, makeTabEl());
        expect(failing).toHaveBeenCalledTimes(2);

        jest.advanceTimersByTime(5_000);
        await updateUnreadCount(inbox, makeTabEl());
        expect(failing).toHaveBeenCalledTimes(3);
    });

    test('an http error is a failure, not a count of zero', async () => {
        (global as any).fetch = feedReturning(7);
        const el1 = makeTabEl();
        await updateUnreadCount(inbox, el1);
        expect(el1.querySelector('.unread-count')!.textContent).toBe('7');

        jest.useFakeTimers();
        (global as any).fetch = jest.fn().mockResolvedValue({ ok: false, text: async () => '' });
        jest.advanceTimersByTime(31_000);

        const el2 = makeTabEl();
        await updateUnreadCount(inbox, el2);
        expect(el2.querySelector('.unread-count')!.textContent).toBe('7');
    });

    test('a genuine zero is still a zero, not a failure', async () => {
        (global as any).fetch = feedReturning(0);
        const el = makeTabEl();
        await updateUnreadCount(inbox, el);
        expect(el.querySelector('.unread-count')!.textContent).toBe('');

        // No failure recorded, so the normal 30s TTL applies rather than a
        // 5s backoff: a second render must not re-fetch.
        const before = ((global as any).fetch as jest.Mock).mock.calls.length;
        await updateUnreadCount(inbox, makeTabEl());
        expect(((global as any).fetch as jest.Mock).mock.calls.length).toBe(before);
    });

    test('never opens more than four feed connections at once', async () => {
        let inFlight = 0;
        let peak = 0;
        const release: Array<() => void> = [];

        (global as any).fetch = jest.fn(
            () =>
                new Promise((resolve) => {
                    inFlight++;
                    peak = Math.max(peak, inFlight);
                    release.push(() => {
                        inFlight--;
                        resolve({ ok: true, text: async () => '<feed><fullcount>1</fullcount></feed>' });
                    });
                })
        );

        const tabs: Tab[] = Array.from({ length: 12 }, (_, i) => ({
            id: `t${i}`,
            title: `L${i}`,
            type: 'label',
            value: `Label${i}`,
        }));

        const pending = tabs.map((t) => updateUnreadCount(t, makeTabEl()));

        // Let the first wave start, then drain one at a time.
        await microtasks(10);
        expect(peak).toBeLessThanOrEqual(4);

        while (release.length > 0) {
            release.shift()!();
            await microtasks(10);
            expect(peak).toBeLessThanOrEqual(4);
        }

        await Promise.all(pending);
        expect((global as any).fetch).toHaveBeenCalledTimes(12);
    });
});

// ---------------------------------------------------------------------------
// computeKnownLabelTokens (A4)
// ---------------------------------------------------------------------------

describe('computeKnownLabelTokens', () => {
    test('maps system hash tabs to internal ids and includes label names', () => {
        const tabs: Tab[] = [
            { id: '1', title: 'Inbox', type: 'hash', value: '#inbox' },
            { id: '2', title: 'Work', type: 'label', value: 'Work' },
            { id: '3', title: 'Team', type: 'hash', value: '#label/Team+Updates' },
        ];
        const tokens = computeKnownLabelTokens(tabs);
        expect(tokens).toContain('^i');
        expect(tokens).toContain('Work');
        expect(tokens).toContain('Team Updates');
    });

    test('ignores search/system hash tabs that map to no label', () => {
        const tabs: Tab[] = [{ id: '1', title: 'Unread', type: 'hash', value: '#search/is:unread' }];
        expect(computeKnownLabelTokens(tabs)).toEqual([]);
    });
});
