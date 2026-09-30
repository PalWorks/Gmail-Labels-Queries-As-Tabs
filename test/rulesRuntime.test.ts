export {};
/**
 * rulesRuntime.test.ts
 *
 * Runs the generated Apps Script against a fake GmailApp, because the
 * failures this covers only exist at run time: a rule that never gets past
 * the newest 200 threads, a batch call handed more than GmailApp accepts, and
 * a run that Apps Script kills at six minutes before it has logged anything.
 *
 * The fake GmailApp enforces the 100-thread batch limit the real one does, so
 * a script that passes an oversized array throws here exactly as it would in
 * the user's account.
 */

import {
    generateAppsScript,
    tabToGmailCategory,
    tabToRuleTarget,
    GMAIL_BATCH_LIMIT,
    TIME_BUDGET_MS,
} from '../src/modules/rules';
import { Tab, Rule } from '../src/utils/storage';

interface FakeThread {
    id: number;
    labels: string[];
    getLabels: () => Array<{ getName: () => string }>;
}

function thread(id: number, labels: string[]): FakeThread {
    return { id, labels, getLabels: () => labels.map((name) => ({ getName: () => name })) };
}

interface Harness {
    searches: string[];
    batches: Record<string, number[]>;
    trashedOneByOne: number;
    logs: string[];
    sheetRows: unknown[][];
}

/**
 * Evaluate a generated script and run autoCleanup() against fakes.
 *
 * `clock` is advanced by `tickPerBatch` on every batch call, so a test can
 * make time run out partway through without waiting for it.
 */
function run(
    source: string,
    options: { threadsFor?: (query: string) => FakeThread[]; tickPerBatch?: number; tickPerSearch?: number } = {}
): Harness {
    const h: Harness = { searches: [], batches: {}, trashedOneByOne: 0, logs: [], sheetRows: [] };
    let clock = 1_000_000;

    const batch = (name: string) => (threads: FakeThread[]) => {
        if (threads.length > GMAIL_BATCH_LIMIT) {
            throw new Error(`${name}: at most ${GMAIL_BATCH_LIMIT} threads per call, got ${threads.length}`);
        }
        (h.batches[name] ??= []).push(threads.length);
        clock += options.tickPerBatch ?? 0;
    };

    const label = (name: string) => ({
        getName: () => name,
        addToThreads: batch(`addToThreads:${name}`),
        removeFromThreads: batch(`removeFromThreads:${name}`),
    });

    const GmailApp = {
        search: (query: string, start: number, max: number) => {
            h.searches.push(query);
            clock += options.tickPerSearch ?? 0;
            const all = options.threadsFor ? options.threadsFor(query) : [];
            return all.slice(start, start + max).map((t) => {
                const copy = { ...t, moveToTrash: () => h.trashedOneByOne++ };
                return copy;
            });
        },
        moveThreadsToTrash: batch('moveThreadsToTrash'),
        moveThreadsToArchive: batch('moveThreadsToArchive'),
        markThreadsRead: batch('markThreadsRead'),
        getUserLabelByName: (name: string) => label(name),
        createLabel: (name: string) => label(name),
    };

    const Session = { getActiveUser: () => ({ getEmail: () => 'me@example.com' }) };
    const Logger = { log: (m: string) => h.logs.push(String(m)) };
    const SpreadsheetApp = {
        openByUrl: () => ({
            getActiveSheet: () => ({
                getLastRow: () => h.sheetRows.length,
                appendRow: (row: unknown[]) => h.sheetRows.push(row),
                getRange: () => ({ setFontWeight: () => undefined }),
            }),
        }),
    };
    class FakeDate extends Date {
        static now(): number {
            return clock;
        }
    }

    const factory = new Function(
        'GmailApp',
        'Session',
        'Logger',
        'SpreadsheetApp',
        'Date',
        `${source}\nautoCleanup();`
    );
    factory(GmailApp, Session, Logger, SpreadsheetApp, FakeDate);
    return h;
}

const LABEL_TAB: Tab = { id: 'news', title: 'Newsletters', type: 'label', value: 'Newsletters' };

function rule(action: Rule['action'], overrides: Partial<Rule> = {}): Rule {
    return { tabId: 'news', action, daysOld: 14, enabled: true, ...overrides };
}

function manyThreads(n: number, labels: string[] = ['Newsletters']): FakeThread[] {
    return Array.from({ length: n }, (_, i) => thread(i, labels));
}

describe('queries make progress past the newest threads', () => {
    test('archive only searches what is still in the inbox', () => {
        const h = run(generateAppsScript([LABEL_TAB], [rule('archive')], 'me@example.com'));
        expect(h.searches).toEqual(['label:"Newsletters" older_than:14d in:inbox']);
    });

    test('mark read only searches what is still unread', () => {
        const h = run(generateAppsScript([LABEL_TAB], [rule('markRead')], 'me@example.com'));
        expect(h.searches).toEqual(['label:"Newsletters" older_than:14d is:unread']);
    });

    test('trash and move to label keep the plain search', () => {
        const trash = run(generateAppsScript([LABEL_TAB], [rule('trash')], 'me@example.com'));
        expect(trash.searches).toEqual(['label:"Newsletters" older_than:14d']);
        const move = run(
            generateAppsScript([LABEL_TAB], [rule('moveToLabel', { targetLabel: 'Old' })], 'me@example.com')
        );
        expect(move.searches).toEqual(['label:"Newsletters" older_than:14d']);
    });
});

describe('batch calls stay within GmailApp limits', () => {
    test.each([
        ['archive', 'moveThreadsToArchive'],
        ['markRead', 'markThreadsRead'],
        ['trash', 'moveThreadsToTrash'],
    ] as const)('%s hands a full 200-thread run over in batches of 100', (action, method) => {
        const h = run(generateAppsScript([LABEL_TAB], [rule(action)], 'me@example.com'), {
            threadsFor: () => manyThreads(250),
        });
        expect(h.batches[method]).toEqual([100, 100]);
        expect(h.logs.some((l) => l.includes('200-thread cap'))).toBe(true);
    });

    test('trash no longer moves threads one call at a time', () => {
        const h = run(generateAppsScript([LABEL_TAB], [rule('trash')], 'me@example.com'), {
            threadsFor: () => manyThreads(5),
        });
        expect(h.trashedOneByOne).toBe(0);
        expect(h.batches.moveThreadsToTrash).toEqual([5]);
    });

    test('the exact-label check still runs before a batch', () => {
        const threads = [...manyThreads(3), thread(99, ['Newsletters-Old'])];
        const h = run(generateAppsScript([LABEL_TAB], [rule('trash')], 'me@example.com'), {
            threadsFor: () => threads,
        });
        expect(h.batches.moveThreadsToTrash).toEqual([3]);
        expect(h.logs.some((l) => l.includes('do not carry that label'))).toBe(true);
    });

    test('move to label adds and removes in batches too', () => {
        const h = run(
            generateAppsScript([LABEL_TAB], [rule('moveToLabel', { targetLabel: 'Old' })], 'me@example.com'),
            { threadsFor: () => manyThreads(150) }
        );
        expect(h.batches['addToThreads:Old']).toEqual([100, 50]);
        expect(h.batches['removeFromThreads:Newsletters']).toEqual([100, 50]);
    });
});

describe('the run stops before Apps Script stops it', () => {
    const tabs: Tab[] = [LABEL_TAB, { id: 'rec', title: 'Receipts', type: 'label', value: 'Receipts' }];
    const rules: Rule[] = [rule('archive'), { tabId: 'rec', action: 'archive', daysOld: 90, enabled: true }];

    test('no new batch starts once the budget is spent, and the log says the rest continues', () => {
        const h = run(generateAppsScript(tabs, rules, 'me@example.com', 'https://docs.google.com/x'), {
            threadsFor: () => manyThreads(200),
            tickPerBatch: TIME_BUDGET_MS + 1,
        });
        // One batch of the first rule, then out of time: no second batch, no
        // second rule.
        expect(h.batches.moveThreadsToArchive).toEqual([100]);
        expect(h.searches).toHaveLength(1);
        expect(h.logs.some((l) => l.includes('continue on the next run'))).toBe(true);
        expect(h.logs.some((l) => /1 rule\(s\) continue on the next run/.test(l))).toBe(true);
        // The summary and the Sheet log are still written, with the true count.
        expect(h.logs.some((l) => l.includes('Summary'))).toBe(true);
        expect(h.sheetRows.some((row) => row[1] === 'Newsletters' && row[3] === 100)).toBe(true);
    });

    test('a run inside the budget does every rule', () => {
        const h = run(generateAppsScript(tabs, rules, 'me@example.com'), {
            threadsFor: (q) => manyThreads(10, [q.includes('Receipts') ? 'Receipts' : 'Newsletters']),
            tickPerBatch: 1000,
        });
        expect(h.searches).toHaveLength(2);
        expect(h.batches.moveThreadsToArchive).toEqual([10, 10]);
    });
});

describe('Gmail categories', () => {
    const promotions: Tab = { id: 'promo', title: 'Promotions', type: 'hash', value: '#category/promotions' };

    test('a #category/ tab resolves to its category, and only the four Gmail searches', () => {
        expect(tabToGmailCategory(promotions)).toBe('promotions');
        expect(tabToGmailCategory({ ...promotions, value: '#category/Social' })).toBe('social');
        expect(tabToGmailCategory({ ...promotions, value: '#category/updates' })).toBe('updates');
        expect(tabToGmailCategory({ ...promotions, value: '#category/forums' })).toBe('forums');
        expect(tabToGmailCategory({ ...promotions, value: '#category/primary' })).toBeNull();
        expect(tabToGmailCategory({ ...promotions, type: 'label', value: 'Promotions' })).toBeNull();
        expect(tabToRuleTarget(promotions)).toEqual({ kind: 'category', category: 'promotions' });
        expect(tabToRuleTarget(LABEL_TAB)).toEqual({ kind: 'label', label: 'Newsletters' });
        expect(tabToRuleTarget({ id: 'i', title: 'Inbox', type: 'hash', value: '#inbox' })).toBeNull();
    });

    test('a category rule searches category:, not label:, and skips the label check', () => {
        const source = generateAppsScript(
            [promotions],
            [{ tabId: 'promo', action: 'trash', daysOld: 30, enabled: true }],
            'me@example.com'
        );
        expect(source).toContain("category: 'promotions'");
        expect(source).not.toContain("label: 'Promotions'");

        // Category threads carry no user label GmailApp can read back, which
        // is exactly why the label check has to be skipped for them.
        const h = run(source, { threadsFor: () => manyThreads(3, []) });
        expect(h.searches).toEqual(['category:promotions older_than:30d']);
        expect(h.batches.moveThreadsToTrash).toEqual([3]);
    });

    test('a category move excludes threads already in the target and removes no source label', () => {
        const h = run(
            generateAppsScript(
                [promotions],
                [{ tabId: 'promo', action: 'moveToLabel', daysOld: 30, enabled: true, targetLabel: 'Deals' }],
                'me@example.com'
            ),
            { threadsFor: () => manyThreads(2, []) }
        );
        expect(h.searches).toEqual(['category:promotions older_than:30d -label:"Deals"']);
        expect(h.batches['addToThreads:Deals']).toEqual([2]);
        expect(Object.keys(h.batches).some((k) => k.startsWith('removeFromThreads'))).toBe(false);
    });

    test('a category archive still only searches the inbox', () => {
        const h = run(
            generateAppsScript(
                [promotions],
                [{ tabId: 'promo', action: 'archive', daysOld: 7, enabled: true }],
                'me@example.com'
            )
        );
        expect(h.searches).toEqual(['category:promotions older_than:7d in:inbox']);
    });
});

describe('the onboarding demo matches the generator', () => {
    test('the demo search is the one an archive rule actually makes', () => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { DEMO_SCRIPT_LINES } = require('../src/modules/onboarding/wizardContent');
        const text = (DEMO_SCRIPT_LINES as Array<{ text: string }>).map((l) => l.text).join('\n');
        const h = run(generateAppsScript([LABEL_TAB], [rule('archive')], 'me@example.com'));
        expect(text).toContain(h.searches[0]);
        // No line hands GmailApp the whole 200-thread search result at once.
        expect(text).not.toMatch(/moveThreadsToArchive\(t\)/);
    });
});
