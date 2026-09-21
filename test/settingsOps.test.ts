export {};
/**
 * settingsOps.test.ts
 *
 * The concurrency layer: the pure `applyOp` reducer, the optimistic local
 * write path, and the per-account serialization the service worker uses.
 *
 * These tests exist because the old write path lost data. Every assertion
 * here maps to a way that happened.
 */

import {
    Settings,
    Tab,
    Rule,
    applyOp,
    mutateLocally,
    mutateSettings,
    createMutationQueue,
    getSettings,
    addTab,
    updateTabOrder,
    removeTab,
} from '../src/utils/storage';
import { installAsyncChrome } from './helpers/storageMock';

const ACCOUNT = 'user@gmail.com';
const KEY = `account_${ACCOUNT}`;

function tab(id: string, value = id): Tab {
    return { id, title: id, type: 'label', value };
}

function baseSettings(tabs: Tab[] = [], rules: Rule[] = []): Settings {
    return { tabs, rules, theme: 'light', showUnreadCount: true, rev: 0 };
}

// ---------------------------------------------------------------------------
// applyOp: pure reducer
// ---------------------------------------------------------------------------

describe('applyOp', () => {
    test('never mutates its input', () => {
        const current = baseSettings([tab('a')], [{ tabId: 'a', action: 'trash', daysOld: 30, enabled: true }]);
        const snapshot = JSON.parse(JSON.stringify(current));

        applyOp(current, { kind: 'addTab', tab: tab('b') });
        applyOp(current, { kind: 'removeTab', tabId: 'a' });
        applyOp(current, { kind: 'reorderTabs', order: ['a'] });
        applyOp(current, { kind: 'updateTab', tabId: 'a', updates: { title: 'x' } });
        applyOp(current, { kind: 'upsertRule', rule: { tabId: 'a', action: 'archive', daysOld: 1, enabled: false } });

        expect(current).toEqual(snapshot);
    });

    test('returns the same reference when the op changes nothing', () => {
        const current = baseSettings([tab('a')]);
        expect(applyOp(current, { kind: 'addTab', tab: tab('a') })).toBe(current);
        expect(applyOp(current, { kind: 'removeTab', tabId: 'gone' })).toBe(current);
        expect(applyOp(current, { kind: 'updateTab', tabId: 'gone', updates: {} })).toBe(current);
        expect(applyOp(current, { kind: 'removeRule', tabId: 'gone' })).toBe(current);
        expect(applyOp(current, { kind: 'updateRule', tabId: 'gone', updates: {} })).toBe(current);
    });

    test('addTab dedupes on value, as it always has', () => {
        const current = baseSettings([tab('a', 'Work')]);
        const next = applyOp(current, { kind: 'addTab', tab: tab('b', 'Work') });
        expect(next).toBe(current);
    });

    test('addTab dedupes on id, so a re-applied op is not a duplicate', () => {
        const current = baseSettings([tab('a', 'Work')]);
        const once = applyOp(current, { kind: 'addTab', tab: tab('b', 'Personal') });
        const twice = applyOp(once, { kind: 'addTab', tab: tab('b', 'Personal') });
        expect(twice.tabs).toHaveLength(2);
    });

    test('removeTab also removes the rule that pointed at the tab', () => {
        const current = baseSettings(
            [tab('a'), tab('b')],
            [
                { tabId: 'a', action: 'trash', daysOld: 30, enabled: true },
                { tabId: 'b', action: 'archive', daysOld: 60, enabled: true },
            ]
        );
        const next = applyOp(current, { kind: 'removeTab', tabId: 'a' });
        expect(next.tabs.map((t) => t.id)).toEqual(['b']);
        expect(next.rules.map((r) => r.tabId)).toEqual(['b']);
    });

    test('merge strips rev so a stale whole-object patch cannot rewind it', () => {
        const current = { ...baseSettings([tab('a')]), rev: 7 };
        const next = applyOp(current, { kind: 'merge', patch: { rev: 2, showUnreadCount: false } as Partial<Settings> });
        expect(next.rev).toBe(7);
        expect(next.showUnreadCount).toBe(false);
    });

    test('updateTab cannot change a tab id', () => {
        const current = baseSettings([tab('a')]);
        const next = applyOp(current, {
            kind: 'updateTab',
            tabId: 'a',
            updates: { id: 'hijacked', title: 'New' } as Partial<Tab>,
        });
        expect(next.tabs[0].id).toBe('a');
        expect(next.tabs[0].title).toBe('New');
    });

    describe('reorderTabs', () => {
        test('reorders by id', () => {
            const current = baseSettings([tab('a'), tab('b'), tab('c')]);
            const next = applyOp(current, { kind: 'reorderTabs', order: ['c', 'a', 'b'] });
            expect(next.tabs.map((t) => t.id)).toEqual(['c', 'a', 'b']);
        });

        test('keeps a tab the caller never saw', () => {
            // This is the data-loss reproduction: the options page rendered
            // three tabs, a Gmail tab added a fourth, and the drag used to
            // write the three-tab array straight over the top.
            const current = baseSettings([tab('a'), tab('b'), tab('c'), tab('added-elsewhere')]);
            const next = applyOp(current, { kind: 'reorderTabs', order: ['c', 'b', 'a'] });
            expect(next.tabs.map((t) => t.id)).toEqual(['c', 'b', 'a', 'added-elsewhere']);
        });

        test('ignores an id that has since been deleted', () => {
            const current = baseSettings([tab('a'), tab('b')]);
            const next = applyOp(current, { kind: 'reorderTabs', order: ['b', 'deleted', 'a'] });
            expect(next.tabs.map((t) => t.id)).toEqual(['b', 'a']);
        });

        test('unseen tabs keep their relative order', () => {
            const current = baseSettings([tab('a'), tab('x'), tab('b'), tab('y')]);
            const next = applyOp(current, { kind: 'reorderTabs', order: ['b', 'a'] });
            expect(next.tabs.map((t) => t.id)).toEqual(['b', 'a', 'x', 'y']);
        });
    });

    test('addRule leaves an existing rule alone, upsertRule replaces it', () => {
        const current = baseSettings([tab('a')], [{ tabId: 'a', action: 'trash', daysOld: 30, enabled: true }]);
        const added = applyOp(current, {
            kind: 'addRule',
            rule: { tabId: 'a', action: 'archive', daysOld: 1, enabled: false },
        });
        expect(added).toBe(current);

        const upserted = applyOp(current, {
            kind: 'upsertRule',
            rule: { tabId: 'a', action: 'archive', daysOld: 1, enabled: false },
        });
        expect(upserted.rules[0].action).toBe('archive');
    });

    test('applyTemplate replaces the rule wholesale so a stale targetLabel cannot linger', () => {
        const current = baseSettings(
            [tab('a', 'Receipts')],
            [{ tabId: 'a', action: 'moveToLabel', daysOld: 30, enabled: true, targetLabel: 'Old/Receipts' }]
        );
        const next = applyOp(current, {
            kind: 'applyTemplate',
            tab: tab('a', 'Receipts'),
            rule: { tabId: 'a', action: 'trash', daysOld: 90, enabled: true },
        });
        expect(next.rules[0]).toEqual({ tabId: 'a', action: 'trash', daysOld: 90, enabled: true });
        expect(next.rules[0].targetLabel).toBeUndefined();
    });

    test('throws on an op kind it does not know', () => {
        // An op crosses a message boundary, so a Gmail tab running an older
        // build can hand a just-updated worker a kind it has never seen.
        // Falling off the switch used to return undefined, and the write path
        // would then spread that over the account and erase it.
        const current = baseSettings([tab('a')]);
        expect(() => applyOp(current, { kind: 'from-the-future' } as never)).toThrow(/Unknown settings op/);
    });

    test('applyTemplate reuses a tab matched by value rather than making a twin', () => {
        const current = baseSettings([tab('existing', 'Receipts')]);
        const next = applyOp(current, {
            kind: 'applyTemplate',
            tab: tab('fresh-uuid', 'Receipts'),
            rule: { tabId: 'fresh-uuid', action: 'trash', daysOld: 90, enabled: true },
        });
        expect(next.tabs).toHaveLength(1);
        expect(next.rules[0].tabId).toBe('existing');
    });
});

// ---------------------------------------------------------------------------
// Write path
// ---------------------------------------------------------------------------

describe('write path', () => {
    let sync: Record<string, unknown>;

    beforeEach(() => {
        ({ sync } = installAsyncChrome({ latencyTurns: 2 }));
    });

    test('bumps rev on every write', async () => {
        const first = await mutateLocally(ACCOUNT, { kind: 'addTab', tab: tab('a') });
        expect(first.rev).toBe(1);
        const second = await mutateLocally(ACCOUNT, { kind: 'addTab', tab: tab('b') });
        expect(second.rev).toBe(2);
    });

    test('does not write at all when the op is a no-op', async () => {
        await mutateLocally(ACCOUNT, { kind: 'addTab', tab: tab('a') });
        const setMock = (global as any).chrome.storage.sync.set as jest.Mock;
        setMock.mockClear();

        const result = await mutateLocally(ACCOUNT, { kind: 'removeTab', tabId: 'not-there' });
        expect(setMock).not.toHaveBeenCalled();
        expect(result.rev).toBe(1);
    });

    test('gives up with a clear error when the value keeps changing underneath', async () => {
        await mutateLocally(ACCOUNT, { kind: 'addTab', tab: tab('a') });

        // Bump rev behind mutateLocally's back on every read, so its
        // pre-write verification can never match.
        const area = (global as any).chrome.storage.sync;
        const realGet = area.get;
        let reads = 0;
        area.get = jest.fn((keys: any, cb: any) => {
            realGet(keys, (items: Record<string, any>) => {
                reads++;
                if (reads % 2 === 0 && items[KEY]) {
                    (sync[KEY] as Settings).rev = ((sync[KEY] as Settings).rev ?? 0) + 1;
                }
                cb(items);
            });
        });

        await expect(mutateLocally(ACCOUNT, { kind: 'addTab', tab: tab('b') })).rejects.toThrow(
            /changed while saving/i
        );
        area.get = realGet;
    });

    test('refuses to write anything that is not a settings object', async () => {
        await mutateLocally(ACCOUNT, { kind: 'addTab', tab: tab('a') });
        await expect(mutateLocally(ACCOUNT, { kind: 'bogus' } as never)).rejects.toThrow();

        // Critically, the account survives intact.
        const settings = await getSettings(ACCOUNT);
        expect(settings.tabs.map((t) => t.id)).toContain('a');
    });

    test('an op applied twice leaves the same result as once', async () => {
        const op = { kind: 'addTab', tab: tab('a') } as const;
        await mutateLocally(ACCOUNT, op);
        await mutateLocally(ACCOUNT, op);
        const settings = await getSettings(ACCOUNT);
        expect(settings.tabs.filter((t) => t.id === 'a')).toHaveLength(1);
    });
});

// ---------------------------------------------------------------------------
// Serialization, which is what the service worker gives us
// ---------------------------------------------------------------------------

describe('concurrent writers', () => {
    beforeEach(() => {
        installAsyncChrome({ latencyTurns: 2 });
    });

    test('unserialized concurrent adds lose one of them', async () => {
        // Not a wish, a demonstration: this is what every surface did before
        // v1.5, and why the queue below exists.
        await Promise.all([
            mutateLocally(ACCOUNT, { kind: 'addTab', tab: tab('from-gmail') }),
            mutateLocally(ACCOUNT, { kind: 'addTab', tab: tab('from-options') }),
        ]).catch(() => undefined);

        const settings = await getSettings(ACCOUNT);
        // Defaults are two tabs; a clean run would leave four.
        expect(settings.tabs.length).toBeLessThan(4);
    });

    test('the queue keeps both concurrent adds', async () => {
        const queue = createMutationQueue();
        await Promise.all([
            queue(ACCOUNT, { kind: 'addTab', tab: tab('from-gmail') }),
            queue(ACCOUNT, { kind: 'addTab', tab: tab('from-options') }),
        ]);

        const settings = await getSettings(ACCOUNT);
        expect(settings.tabs.map((t) => t.id)).toEqual(
            expect.arrayContaining(['default-inbox', 'default-sent', 'from-gmail', 'from-options'])
        );
    });

    test('a reorder racing an add keeps the added tab', async () => {
        const queue = createMutationQueue();
        await queue(ACCOUNT, { kind: 'addTab', tab: tab('a') });
        await queue(ACCOUNT, { kind: 'addTab', tab: tab('b') });

        const stale = await getSettings(ACCOUNT);
        const staleOrder = stale.tabs.map((t) => t.id).reverse();

        await Promise.all([
            queue(ACCOUNT, { kind: 'addTab', tab: tab('added-during-drag') }),
            queue(ACCOUNT, { kind: 'reorderTabs', order: staleOrder }),
        ]);

        const settings = await getSettings(ACCOUNT);
        expect(settings.tabs.map((t) => t.id)).toContain('added-during-drag');
    });

    test('ten interleaved writers all land', async () => {
        const queue = createMutationQueue();
        await Promise.all(
            Array.from({ length: 10 }, (_, i) => queue(ACCOUNT, { kind: 'addTab', tab: tab(`t${i}`) }))
        );

        const settings = await getSettings(ACCOUNT);
        for (let i = 0; i < 10; i++) {
            expect(settings.tabs.map((t) => t.id)).toContain(`t${i}`);
        }
        expect(settings.rev).toBe(10);
    });

    test('one failing mutation does not strand the ones queued behind it', async () => {
        const queue = createMutationQueue();
        const area = (global as any).chrome.storage.sync;
        const realSet = area.set;

        let failNext = true;
        area.set = jest.fn((items: any, cb: any) => {
            if (failNext) {
                failNext = false;
                (global as any).chrome.runtime.lastError = { message: 'quota exceeded' };
                cb();
                (global as any).chrome.runtime.lastError = null;
                return;
            }
            realSet(items, cb);
        });

        const results = await Promise.allSettled([
            queue(ACCOUNT, { kind: 'addTab', tab: tab('doomed') }),
            queue(ACCOUNT, { kind: 'addTab', tab: tab('survivor') }),
        ]);

        area.set = realSet;
        expect(results[0].status).toBe('rejected');
        expect(results[1].status).toBe('fulfilled');

        const settings = await getSettings(ACCOUNT);
        expect(settings.tabs.map((t) => t.id)).toContain('survivor');
    });
});

// ---------------------------------------------------------------------------
// Service-worker routing
// ---------------------------------------------------------------------------

describe('mutateSettings routing', () => {
    beforeEach(() => {
        installAsyncChrome({ latencyTurns: 1 });
    });

    test('uses the service worker when it answers', async () => {
        const settings = { ...baseSettings([tab('from-worker')]), rev: 9 };
        const sendMessage = jest.fn().mockResolvedValue({ ok: true, settings });
        (global as any).chrome.runtime.sendMessage = sendMessage;

        const result = await mutateSettings(ACCOUNT, { kind: 'addTab', tab: tab('a') });

        expect(sendMessage).toHaveBeenCalledWith({
            action: 'MUTATE_SETTINGS',
            accountId: ACCOUNT,
            op: { kind: 'addTab', tab: tab('a') },
        });
        expect(result.rev).toBe(9);
        // The worker did the write; this context must not have written too.
        expect((global as any).chrome.storage.sync.set).not.toHaveBeenCalled();
    });

    test('falls back locally when sendMessage is not promise-shaped', async () => {
        (global as any).chrome.runtime.sendMessage = jest.fn(() => undefined);
        const result = await mutateSettings(ACCOUNT, { kind: 'addTab', tab: tab('a') });
        expect(result.tabs.map((t) => t.id)).toContain('a');
    });

    test('falls back locally when there is no listener', async () => {
        (global as any).chrome.runtime.sendMessage = jest
            .fn()
            .mockRejectedValue(new Error('Could not establish connection'));
        const result = await mutateSettings(ACCOUNT, { kind: 'addTab', tab: tab('a') });
        expect(result.tabs.map((t) => t.id)).toContain('a');
    });

    test('falls back locally when the worker reports failure', async () => {
        (global as any).chrome.runtime.sendMessage = jest.fn().mockResolvedValue({ ok: false, error: 'boom' });
        const result = await mutateSettings(ACCOUNT, { kind: 'addTab', tab: tab('a') });
        expect(result.tabs.map((t) => t.id)).toContain('a');
    });

    test('falls back locally when sendMessage throws synchronously', async () => {
        (global as any).chrome.runtime.sendMessage = jest.fn(() => {
            throw new Error('Extension context invalidated');
        });
        const result = await mutateSettings(ACCOUNT, { kind: 'addTab', tab: tab('a') });
        expect(result.tabs.map((t) => t.id)).toContain('a');
    });

    test('a lost worker response cannot duplicate the tab', async () => {
        // The worker applied the op, then its reply was dropped. The caller
        // falls back and applies the same op again.
        const workerSide = createMutationQueue();
        (global as any).chrome.runtime.sendMessage = jest.fn(async (msg: any) => {
            await workerSide(msg.accountId, msg.op);
            throw new Error('The message port closed before a response was received.');
        });

        const op = { kind: 'addTab', tab: tab('a') } as const;
        await mutateSettings(ACCOUNT, op);

        const settings = await getSettings(ACCOUNT);
        expect(settings.tabs.filter((t) => t.id === 'a')).toHaveLength(1);
    });
});

// ---------------------------------------------------------------------------
// The end-to-end reproduction from the plan
// ---------------------------------------------------------------------------

describe('the stale-reorder reproduction', () => {
    beforeEach(() => {
        installAsyncChrome({ latencyTurns: 1 });
    });

    test('a drag in the options page no longer deletes a tab added in Gmail', async () => {
        // 1. The options page loads and renders what exists.
        await addTab(ACCOUNT, 'Work', 'Work');
        await addTab(ACCOUNT, 'Personal', 'Personal');
        const asRenderedByOptions = (await getSettings(ACCOUNT)).tabs;

        // 2. A Gmail tab adds one the options page will never see.
        await addTab(ACCOUNT, 'Receipts', 'Receipts');

        // 3. The user drags in the options page, which still holds the old list.
        const dragged = [...asRenderedByOptions].reverse();
        await updateTabOrder(ACCOUNT, dragged);

        const after = await getSettings(ACCOUNT);
        expect(after.tabs.map((t) => t.value)).toContain('Receipts');
        expect(after.tabs).toHaveLength(asRenderedByOptions.length + 1);
    });

    test('removing a tab takes its rule with it', async () => {
        await addTab(ACCOUNT, 'Work', 'Work');
        const { tabs } = await getSettings(ACCOUNT);
        const work = tabs.find((t) => t.value === 'Work')!;

        const { mutateSettings: mutate } = await import('../src/utils/storage');
        await mutate(ACCOUNT, {
            kind: 'upsertRule',
            rule: { tabId: work.id, action: 'trash', daysOld: 30, enabled: true },
        });

        await removeTab(ACCOUNT, work.id);

        const after = await getSettings(ACCOUNT);
        expect(after.rules.find((r) => r.tabId === work.id)).toBeUndefined();
    });
});
