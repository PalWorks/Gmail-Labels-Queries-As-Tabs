export {};
/**
 * rulesProperty.test.ts
 *
 * Property tests for the Apps Script generator.
 *
 * The generator drops user data into four different languages at once: a
 * JavaScript string literal, a JavaScript block comment, a Gmail search query,
 * and a Google Sheets URL. Each has its own escaping rules and no escaper is
 * obviously right by inspection. Two shipped bugs came out of exactly that: a
 * tab title containing a close-comment sequence ended the comment early and
 * injected statements into a script the user runs under their own Google
 * account, and an unquoted label
 * containing a space made `label:Old Stuff` search for `label:Old AND Stuff`
 * and trash mail that was never in the label.
 *
 * So instead of picking a few hostile strings by hand, generate thousands from
 * an alphabet of everything that has ever broken one of those four contexts,
 * and assert the invariants that must hold for all of them.
 *
 * Note on `new Function`: executing generated code from hostile input is the
 * point of this file, not an oversight. A static check cannot tell whether an
 * injected statement would run; only running it can. The canary globals below
 * exist precisely to catch the case where it does. This runs in the jest
 * process against our own generator's output, never in the extension.
 */

import { generateAppsScript, MAX_THREADS_PER_RUN } from '../src/modules/rules';
import { Tab, Rule } from '../src/utils/storage';

// ---------------------------------------------------------------------------
// Hostile input generation
// ---------------------------------------------------------------------------

/**
 * Every fragment here has broken, or could break, one of the four contexts.
 * The canary fragments would define a global if they ever escaped into code.
 */
const HOSTILE_FRAGMENTS = [
    // Comment context
    '*/',
    '/*',
    '*/ globalThis.PWNED_COMMENT = 1; /*',
    '**/',
    '/**/',
    // String context
    "'",
    '"',
    '\\',
    "\\'",
    "'; globalThis.PWNED_STRING = 1; var x='",
    '\\\\',
    // Line terminators, including the two JavaScript treats as such
    '\n',
    '\r',
    '\r\n',
    '\u2028',
    '\u2029',
    // Template and markup
    '${globalThis.PWNED_TEMPLATE = 1}',
    '`',
    '</script>',
    '<!--',
    // Gmail search grammar
    ' ',
    '  ',
    'OR',
    'in:anywhere',
    '" OR in:anywhere "',
    'label:other',
    '-from:me',
    '{a b}',
    '(',
    ')',
    // Ordinary things that are not attacks but break naive code anyway
    'Old Stuff',
    'Parent/Child',
    'Ünïcödé',
    '日本語',
    '🎉',
    'a'.repeat(40),
    ';',
    '//',
    ',',
    ':',
] as const;

/** Deterministic PRNG so a failure is reproducible from the seed alone. */
function mulberry32(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function hostileString(rand: () => number): string {
    const pieces = 1 + Math.floor(rand() * 4);
    let out = '';
    for (let i = 0; i < pieces; i++) {
        out += HOSTILE_FRAGMENTS[Math.floor(rand() * HOSTILE_FRAGMENTS.length)];
    }
    return out;
}

// ---------------------------------------------------------------------------
// Evaluating the generated script
// ---------------------------------------------------------------------------

interface EvaluatedScript {
    RULES: Array<{ label: string; daysOld: number; action: string; targetLabel?: string }>;
    EXPECTED_USER: string;
    MAX_THREADS_PER_RUN: number;
    buildQuery: (rule: { label: string; daysOld: number }) => string;
}

const CANARIES = ['PWNED_COMMENT', 'PWNED_STRING', 'PWNED_TEMPLATE'] as const;

function clearCanaries(): void {
    CANARIES.forEach((name) => {
        delete (globalThis as Record<string, unknown>)[name];
    });
}

/**
 * Run the generated script's top level and hand back what it defined.
 *
 * Only the top level runs: everything that touches GmailApp, Session or
 * SpreadsheetApp lives inside function bodies that are never called here.
 * That top level is exactly where an injected statement would execute.
 */
function evaluateScript(source: string): EvaluatedScript {
    const factory = new Function(
        `${source}\nreturn { RULES: RULES, EXPECTED_USER: EXPECTED_USER, MAX_THREADS_PER_RUN: MAX_THREADS_PER_RUN, buildQuery: buildQuery };`
    );
    return factory() as EvaluatedScript;
}

function makeCase(label: string, title: string, targetLabel?: string): { tabs: Tab[]; rules: Rule[] } {
    const tabs: Tab[] = [{ id: 'tab-1', title, type: 'label', value: label }];
    const rules: Rule[] = [
        {
            tabId: 'tab-1',
            action: targetLabel === undefined ? 'trash' : 'moveToLabel',
            daysOld: 30,
            enabled: true,
            ...(targetLabel === undefined ? {} : { targetLabel }),
        },
    ];
    return { tabs, rules };
}

// ---------------------------------------------------------------------------
// Properties
// ---------------------------------------------------------------------------

describe('generated Apps Script survives hostile input', () => {
    const CASES = 1000;

    afterEach(clearCanaries);

    test(`parses, round-trips and injects nothing across ${CASES} generated cases`, () => {
        const rand = mulberry32(0xc0ffee);

        for (let i = 0; i < CASES; i++) {
            const label = hostileString(rand);
            const title = hostileString(rand);
            const account = `${hostileString(rand)}@example.com`;
            const useTarget = rand() < 0.5;
            const targetLabel = useTarget ? hostileString(rand) : undefined;

            // A label that trims to nothing is dropped by design, so there is
            // no rule to assert on.
            if (!label.trim()) continue;

            const { tabs, rules } = makeCase(label, title, targetLabel);
            const source = generateAppsScript(tabs, rules, account);
            const context = `case ${i} label=${JSON.stringify(label)} title=${JSON.stringify(title)}`;

            let evaluated: EvaluatedScript;
            try {
                evaluated = evaluateScript(source);
            } catch (e) {
                throw new Error(`${context}: generated script does not parse or run — ${(e as Error).message}`);
            }

            // 1. Nothing escaped into executable code.
            for (const canary of CANARIES) {
                if ((globalThis as Record<string, unknown>)[canary] !== undefined) {
                    throw new Error(`${context}: injected code ran and set ${canary}`);
                }
            }

            // 2. The data survived the round trip byte for byte. This is what
            //    proves the escaping is lossless as well as safe.
            expect(evaluated.RULES).toHaveLength(1);
            expect(evaluated.RULES[0].label).toBe(label.trim());
            expect(evaluated.EXPECTED_USER).toBe(account);
            if (targetLabel !== undefined) {
                expect(evaluated.RULES[0].targetLabel).toBe(targetLabel);
            }

            // 3. The search is a single quoted label term followed by the age
            //    filter — never a bare label that Gmail would split on a space.
            const query = evaluated.buildQuery(evaluated.RULES[0]);
            const expectedTerm = `label:"${label.trim().replace(/"/g, '')}"`;
            expect(query).toBe(`${expectedTerm} older_than:30d`);

            // 4. Gmail sees exactly two quotes: the ones we opened and closed.
            expect((query.match(/"/g) ?? []).length).toBe(2);
        }
    });

    test('a Sheet URL is escaped the same way', () => {
        const rand = mulberry32(0xbadbeef);

        for (let i = 0; i < 200; i++) {
            const sheetUrl = `https://docs.google.com/spreadsheets/d/${hostileString(rand)}/edit`;
            const { tabs, rules } = makeCase('Receipts', 'Receipts');
            const source = generateAppsScript(tabs, rules, 'a@b.com', sheetUrl);

            let evaluated: { SHEET_URL: string };
            try {
                evaluated = new Function(`${source}\nreturn { SHEET_URL: SHEET_URL };`)() as { SHEET_URL: string };
            } catch (e) {
                throw new Error(`sheet case ${i} ${JSON.stringify(sheetUrl)}: ${(e as Error).message}`);
            }

            expect(evaluated.SHEET_URL).toBe(sheetUrl);
            for (const canary of CANARIES) {
                expect((globalThis as Record<string, unknown>)[canary]).toBeUndefined();
            }
        }
    });
});

// ---------------------------------------------------------------------------
// The specific defects, pinned so they cannot come back quietly
// ---------------------------------------------------------------------------

describe('the label is never left unquoted in the Gmail search', () => {
    test('a multi-word label searches as one term', () => {
        const { tabs, rules } = makeCase('Old Stuff', 'Old Stuff');
        const evaluated = evaluateScript(generateAppsScript(tabs, rules, 'a@b.com'));

        expect(evaluated.buildQuery(evaluated.RULES[0])).toBe('label:"Old Stuff" older_than:30d');
    });

    test('the unquoted form is gone from the generated source', () => {
        const { tabs, rules } = makeCase('Old Stuff', 'Old Stuff');
        const source = generateAppsScript(tabs, rules, 'a@b.com');

        expect(source).not.toContain("'label:' + rule.label");
        expect(source).toContain('label:"');
    });

    test('a label carrying a search operator cannot widen the query', () => {
        const { tabs, rules } = makeCase('Foo" OR in:anywhere "', 'attack');
        const evaluated = evaluateScript(generateAppsScript(tabs, rules, 'a@b.com'));
        const query = evaluated.buildQuery(evaluated.RULES[0]);

        // Quotes are stripped, so the operator is inert text inside one term.
        expect((query.match(/"/g) ?? []).length).toBe(2);
        expect(query).toBe('label:"Foo OR in:anywhere " older_than:30d');
    });
});

describe('destructive actions are bounded and verified', () => {
    test('the search is capped', () => {
        const { tabs, rules } = makeCase('Receipts', 'Receipts');
        const source = generateAppsScript(tabs, rules, 'a@b.com');

        expect(source).toContain('GmailApp.search(query, 0, MAX_THREADS_PER_RUN)');
        expect(evaluateScript(source).MAX_THREADS_PER_RUN).toBe(MAX_THREADS_PER_RUN);
    });

    test('every thread is checked for the exact label before it is touched', () => {
        const { tabs, rules } = makeCase('Receipts', 'Receipts');
        const source = generateAppsScript(tabs, rules, 'a@b.com');

        expect(source).toContain('threadHasLabel');
        // The filter must run before the action switch, not after it.
        expect(source.indexOf('matched.filter')).toBeLessThan(source.indexOf('switch (rule.action)'));
    });

    test('threadHasLabel compares names exactly', () => {
        const { tabs, rules } = makeCase('Old', 'Old');
        const source = generateAppsScript(tabs, rules, 'a@b.com');
        const fn = new Function(`${source}\nreturn threadHasLabel;`)() as (
            thread: { getLabels: () => Array<{ getName: () => string }> },
            name: string
        ) => boolean;

        const thread = (...names: string[]) => ({
            getLabels: () => names.map((n) => ({ getName: () => n })),
        });

        expect(fn(thread('Old'), 'Old')).toBe(true);
        expect(fn(thread('Old Stuff'), 'Old')).toBe(false);
        expect(fn(thread('old'), 'Old')).toBe(false);
        expect(fn(thread('Other', 'Old'), 'Old')).toBe(true);
        expect(fn(thread(), 'Old')).toBe(false);
    });
});
