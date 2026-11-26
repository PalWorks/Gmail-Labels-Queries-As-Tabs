// SPDX-License-Identifier: AGPL-3.0-only
export {};
/**
 * unread.test.ts
 *
 * Unit tests for the unread count module.
 * Covers normalizeLabel(), buildLabelMapFromDOM(), handleUnreadUpdates(),
 * the sidebar reader that badges follow, and the Atom feed fallback.
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
    findSidebarLink,
    readSidebarCount,
    refreshCountsFromSidebar,
    watchSidebarCounts,
    feedNameForLabel,
    sidebarViewKey,
    updateUnreadCount,
    clearUnreadCountCache,
    computeKnownLabelTokens,
    resolveFeedLabel,
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

/**
 * One row of Gmail's sidebar as measured on 2026-11-26: the count sits beside
 * the link, in the row, not inside the link.
 */
function gmailRow(href: string, count: string | null, aria?: string): string {
    return `<div class="aim"><div class="TO"><div class="TN"><div class="aio"><span class="nU"><a href="https://mail.google.com/mail/u/0/#${href}"${
        aria ? ` aria-label="${aria}"` : ''
    }>x</a></span>${count === null ? '' : `<div class="bsU">${count}</div>`}</div></div></div></div>`;
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

describe("Gmail's sidebar is the count a badge shows", () => {
    const tab = (type: 'label' | 'hash', value: string): Tab => ({ id: 't', title: 'x', type, value });

    test('the inbox shows the number Gmail shows, read beside the link', () => {
        document.body.innerHTML = gmailRow('inbox', '9', 'Inbox 9 unread');
        expect(readSidebarCount(findSidebarLink(tab('hash', '#inbox'))!)).toBe('9');
    });

    test('a nested label with a space is found by its decoded name', () => {
        document.body.innerHTML = gmailRow('label/Delete/Professional+Newsletters', '7');
        expect(readSidebarCount(findSidebarLink(tab('label', 'Delete/Professional Newsletters'))!)).toBe('7');
    });

    test('a pinned #label/ view in Gmail encoding finds the same row', () => {
        document.body.innerHTML = gmailRow('label/Work%2FClients', '6');
        expect(readSidebarCount(findSidebarLink(tab('hash', '#label/Work%2FClients'))!)).toBe('6');
    });

    test('a row with no number means no badge, not a fallback', () => {
        document.body.innerHTML = gmailRow('label/Family', null);
        expect(readSidebarCount(findSidebarLink(tab('label', 'Family'))!)).toBe('');
    });

    test('the number is read in any language, the aria-label only as a last resort', () => {
        document.body.innerHTML = gmailRow('inbox', '1.234', 'Posteingang 1.234 ungelesen');
        expect(readSidebarCount(findSidebarLink(tab('hash', '#inbox'))!)).toBe('1.234');
    });

    test('text that is not a number is not shown', () => {
        document.body.innerHTML = gmailRow('inbox', 'New');
        expect(readSidebarCount(findSidebarLink(tab('hash', '#inbox'))!)).toBe('');
    });

    test("a parent row does not take a child row's count", () => {
        document.body.innerHTML = `<div class="aim"><div class="TO"><a href="#label/Parent">p</a>
            <div class="TO"><a href="#label/Parent%2FChild">c</a><div class="bsU">4</div></div></div></div>`;
        expect(readSidebarCount(findSidebarLink(tab('label', 'Parent'))!)).toBe('');
        expect(readSidebarCount(findSidebarLink(tab('label', 'Parent/Child'))!)).toBe('4');
    });

    test('searches have no sidebar row; system views and categories do', () => {
        expect(sidebarViewKey(tab('hash', '#search/is%3Aunread'))).toBeNull();
        expect(sidebarViewKey(tab('hash', '#category/updates'))).toBe('category/updates');
        expect(sidebarViewKey(tab('label', 'Inbox'))).toBe('inbox');
    });

    test('refreshCountsFromSidebar updates every badge Gmail counts and leaves the rest', () => {
        document.body.innerHTML = gmailRow('inbox', '9') + gmailRow('label/Work', '3');
        createMockTabBar([
            { value: '#inbox', type: 'hash' },
            { value: 'Work', type: 'label' },
            { value: '#search/is%3Aunread', type: 'hash' },
        ]);
        const spans = document.querySelectorAll('#gmail-labels-as-tabs-bar .unread-count');
        spans[2].textContent = 'kept';
        refreshCountsFromSidebar();
        expect([...spans].map((s) => s.textContent)).toEqual(['9', '3', 'kept']);
    });

    test('the watcher fires once on finding the sidebar and again when a count changes', async () => {
        jest.useFakeTimers();
        try {
            document.body.innerHTML = gmailRow('inbox', '9');
            const onChange = jest.fn();
            const stop = watchSidebarCounts(onChange);
            jest.advanceTimersByTime(300);
            expect(onChange).toHaveBeenCalledTimes(1);
            document.querySelector('.bsU')!.textContent = '10';
            await Promise.resolve();
            jest.advanceTimersByTime(300);
            expect(onChange).toHaveBeenCalledTimes(2);
            stop();
            document.querySelector('.bsU')!.textContent = '11';
            await Promise.resolve();
            jest.advanceTimersByTime(300);
            expect(onChange).toHaveBeenCalledTimes(2);
        } finally {
            jest.useRealTimers();
        }
    });
});

describe('handleUnreadUpdates', () => {
    test('updates the badge of a label Gmail\'s sidebar does not show', () => {
        createMockTabBar([{ value: 'Work', type: 'label' }]);

        handleUnreadUpdates([{ label: 'Work', count: 3 }]);

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
        createMockTabBar([{ value: 'Work', type: 'label' }]);

        handleUnreadUpdates([{ label: 'Work', count: 0 }]);

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
            { value: 'Work', type: 'label' },
            { value: '#starred', type: 'hash' },
        ]);

        handleUnreadUpdates([
            { label: 'Work', count: 2 },
            { label: '^t', count: 4 },
        ]);

        const bar = document.getElementById('gmail-labels-as-tabs-bar')!;
        const counts = bar.querySelectorAll('.unread-count');
        expect(counts[0].textContent).toBe('2');
        expect(counts[1].textContent).toBe('4');
    });

    test("never puts the sync protocol's inbox figure on the inbox tab", () => {
        // ^i counts every category; Gmail shows Primary. 446 against 9, measured.
        document.body.innerHTML = gmailRow('inbox', '9');
        createMockTabBar([{ value: '#inbox', type: 'hash' }]);
        const span = document.querySelector('#gmail-labels-as-tabs-bar .unread-count')!;
        span.textContent = '9';
        handleUnreadUpdates([{ label: '^i', count: 446 }]);
        expect(span.textContent).toBe('9');
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

    test('fetches the Atom feed for a label Gmail\'s sidebar does not show', async () => {
        const tab: Tab = { id: 't', title: 'Work', type: 'label', value: 'Work' };
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
        const tab: Tab = { id: 't', title: 'Work', type: 'label', value: 'Work' };
        await updateUnreadCount(tab, makeTabEl());
        await updateUnreadCount(tab, makeTabEl());
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    test('coalesces concurrent requests for the same label into one fetch', async () => {
        const tab: Tab = { id: 't', title: 'Work', type: 'label', value: 'Work' };
        await Promise.all([
            updateUnreadCount(tab, makeTabEl()),
            updateUnreadCount(tab, makeTabEl()),
            updateUnreadCount(tab, makeTabEl()),
        ]);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    test('passes an abort signal so a stalled feed cannot hang forever', async () => {
        const tab: Tab = { id: 't', title: 'Work', type: 'label', value: 'Work' };
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

            const tab: Tab = { id: 't', title: 'Work', type: 'label', value: 'Work' };
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

    const work: Tab = { id: 't', title: 'Work', type: 'label', value: 'Work' };

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
        await updateUnreadCount(work, good);
        expect(good.querySelector('.unread-count')!.textContent).toBe('12');

        jest.useFakeTimers();
        (global as any).fetch = jest.fn().mockRejectedValue(new Error('offline'));

        // Past the success TTL, so this really does re-fetch and really does fail.
        jest.advanceTimersByTime(31_000);
        const afterFailure = makeTabEl();
        await updateUnreadCount(work, afterFailure);
        expect(afterFailure.querySelector('.unread-count')!.textContent).toBe('12');
    });

    test('a failure is not cached as zero, so recovery is not blocked for the full TTL', async () => {
        jest.useFakeTimers();
        (global as any).fetch = jest.fn().mockRejectedValue(new Error('offline'));
        await updateUnreadCount(work, makeTabEl());

        const recovered = feedReturning(4);
        (global as any).fetch = recovered;

        // First backoff step is 5s, well short of the 30s success TTL.
        jest.advanceTimersByTime(6_000);
        const el = makeTabEl();
        await updateUnreadCount(work, el);

        expect(recovered).toHaveBeenCalledTimes(1);
        expect(el.querySelector('.unread-count')!.textContent).toBe('4');
    });

    test('backs off further on each consecutive failure', async () => {
        jest.useFakeTimers();
        const failing = jest.fn().mockRejectedValue(new Error('offline'));
        (global as any).fetch = failing;

        await updateUnreadCount(work, makeTabEl());
        expect(failing).toHaveBeenCalledTimes(1);

        // Inside the 5s window: no second attempt.
        jest.advanceTimersByTime(4_000);
        await updateUnreadCount(work, makeTabEl());
        expect(failing).toHaveBeenCalledTimes(1);

        // Past it: second attempt, which pushes the window out to 10s.
        jest.advanceTimersByTime(2_000);
        await updateUnreadCount(work, makeTabEl());
        expect(failing).toHaveBeenCalledTimes(2);

        jest.advanceTimersByTime(6_000);
        await updateUnreadCount(work, makeTabEl());
        expect(failing).toHaveBeenCalledTimes(2);

        jest.advanceTimersByTime(5_000);
        await updateUnreadCount(work, makeTabEl());
        expect(failing).toHaveBeenCalledTimes(3);
    });

    test('an http error is a failure, not a count of zero', async () => {
        (global as any).fetch = feedReturning(7);
        const el1 = makeTabEl();
        await updateUnreadCount(work, el1);
        expect(el1.querySelector('.unread-count')!.textContent).toBe('7');

        jest.useFakeTimers();
        (global as any).fetch = jest.fn().mockResolvedValue({ ok: false, text: async () => '' });
        jest.advanceTimersByTime(31_000);

        const el2 = makeTabEl();
        await updateUnreadCount(work, el2);
        expect(el2.querySelector('.unread-count')!.textContent).toBe('7');
    });

    test('a genuine zero is still a zero, not a failure', async () => {
        (global as any).fetch = feedReturning(0);
        const el = makeTabEl();
        await updateUnreadCount(work, el);
        expect(el.querySelector('.unread-count')!.textContent).toBe('');

        // No failure recorded, so the normal 30s TTL applies rather than a
        // 5s backoff: a second render must not re-fetch.
        const before = ((global as any).fetch as jest.Mock).mock.calls.length;
        await updateUnreadCount(work, makeTabEl());
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

// ---------------------------------------------------------------------------
// Audit fixes: live counts survive a redraw, hash labels decode, '%' in names
// ---------------------------------------------------------------------------

describe('live XHR counts and the feed cache', () => {
    function makeTabEl(): HTMLElement {
        const el = document.createElement('div');
        const span = document.createElement('span');
        span.className = 'unread-count';
        el.appendChild(span);
        return el;
    }

    const work: Tab = { id: 't', title: 'Work', type: 'label', value: 'Work' };

    beforeEach(() => {
        clearUnreadCountCache();
        (global as any).fetch = jest.fn().mockResolvedValue({
            ok: true,
            text: async () => '<feed><fullcount>9</fullcount></feed>',
        });
    });

    test('a redraw inside the TTL shows the live count, not the older feed count', async () => {
        await updateUnreadCount(work, makeTabEl());

        createMockTabBar([{ value: 'Work', type: 'label' }]);
        handleUnreadUpdates([{ label: 'Work', count: 3 }]);

        const redrawn = makeTabEl();
        await updateUnreadCount(work, redrawn);
        expect(redrawn.querySelector('.unread-count')!.textContent).toBe('3');
        expect((global as any).fetch).toHaveBeenCalledTimes(1);
    });

    test('a feed fetch that started before a live update does not overwrite it', async () => {
        let resolveFeed!: (v: unknown) => void;
        (global as any).fetch = jest.fn(
            () =>
                new Promise((resolve) => {
                    resolveFeed = resolve;
                })
        );

        const el = makeTabEl();
        const pending = updateUnreadCount(work, el);
        await microtasks();

        createMockTabBar([{ value: 'Work', type: 'label' }]);
        handleUnreadUpdates([{ label: 'Work', count: 3 }]);

        resolveFeed({ ok: true, text: async () => '<feed><fullcount>9</fullcount></feed>' });
        await pending;
        expect(el.querySelector('.unread-count')!.textContent).toBe('3');

        const redrawn = makeTabEl();
        await updateUnreadCount(work, redrawn);
        expect(redrawn.querySelector('.unread-count')!.textContent).toBe('3');
    });
});

describe('pinned #label/ hash tabs fetch the right feed', () => {
    beforeEach(() => {
        clearUnreadCountCache();
        (global as any).fetch = jest.fn().mockResolvedValue({
            ok: true,
            text: async () => '<feed><fullcount>1</fullcount></feed>',
        });
    });

    function makeTabEl(): HTMLElement {
        const el = document.createElement('div');
        const span = document.createElement('span');
        span.className = 'unread-count';
        el.appendChild(span);
        return el;
    }

    test.each([
        ['#label/My+Label', 'feed/atom/My-Label'],
        ['#label/Parent%2FChild', 'feed/atom/Parent-Child'],
    ])('%s is decoded once, then named the way the feed names it', async (value, expected) => {
        const tab: Tab = { id: 't', title: 'x', type: 'hash', value };
        await updateUnreadCount(tab, makeTabEl());
        const url = (global as any).fetch.mock.calls[0][0] as string;
        expect(url.endsWith(expected)).toBe(true);
    });

    test('resolveFeedLabel keeps a malformed escape rather than throw', () => {
        expect(resolveFeedLabel({ id: 't', title: 'x', type: 'hash', value: '#label/100%' })).toBe('100%');
    });
});

describe('normalizeLabel with a literal percent sign', () => {
    test('does not throw and matches on the raw name', () => {
        expect(() => normalizeLabel('100% Done')).not.toThrow();
        expect(normalizeLabel('100% Done')).toBe('100% done');
    });
});

describe('the Atom feed fallback', () => {
    test('names a label the way the feed does: every slash and space is a dash', () => {
        expect(feedNameForLabel('Delete/Professional Newsletters')).toBe('Delete-Professional-Newsletters');
        expect(feedNameForLabel('Loan & Insurance')).toBe('Loan-&-Insurance');
    });

    test('the inbox and sent have no feed fallback', () => {
        expect(resolveFeedLabel({ id: 't', title: 'x', type: 'hash', value: '#inbox' })).toBeNull();
        expect(resolveFeedLabel({ id: 't', title: 'x', type: 'label', value: 'Inbox' })).toBeNull();
        expect(resolveFeedLabel({ id: 't', title: 'x', type: 'hash', value: '#sent' })).toBeNull();
    });

    test('a label with a sidebar row is never fetched', async () => {
        clearUnreadCountCache();
        (global as any).fetch = jest.fn();
        document.body.innerHTML = gmailRow('label/Work', '5');
        const el = document.createElement('div');
        el.innerHTML = '<span class="unread-count"></span>';
        await updateUnreadCount({ id: 't', title: 'Work', type: 'label', value: 'Work' }, el);
        expect((global as any).fetch).not.toHaveBeenCalled();
        expect(el.textContent).toBe('5');
    });
});
