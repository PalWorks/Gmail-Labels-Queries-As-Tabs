export { };
/**
 * rules.test.ts
 *
 * Unit tests for the Apps Script generator module.
 * Tests script generation for all 4 action types, Sheet logging,
 * edge cases, and output validity.
 */

import { generateAppsScript, tabToGmailLabel } from '../src/modules/rules';
import { Tab, Rule } from '../src/utils/storage';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const TABS: Tab[] = [
    { id: 'tab-1', title: 'Newsletters', type: 'label', value: 'newsletters' },
    { id: 'tab-2', title: 'Bank Notifications', type: 'label', value: 'bank-notifications' },
    { id: 'tab-3', title: 'Spam Letters', type: 'label', value: 'spam-letters' },
    { id: 'tab-4', title: 'Archive Target', type: 'label', value: 'archive-target' },
];

function makeRule(overrides: Partial<Rule> & Pick<Rule, 'tabId' | 'action'>): Rule {
    return {
        daysOld: 30,
        enabled: true,
        ...overrides,
    };
}

// ---------------------------------------------------------------------------
// Script generation — Action types
// ---------------------------------------------------------------------------

describe('generateAppsScript', () => {
    test('generates script with trash action', () => {
        const rules: Rule[] = [makeRule({ tabId: 'tab-1', action: 'trash', daysOld: 14 })];
        const script = generateAppsScript(TABS, rules, 'test@gmail.com');

        expect(script).toContain("label: 'newsletters'");
        expect(script).toContain('daysOld: 14');
        expect(script).toContain("action: 'trash'");
        expect(script).toContain('moveToTrash');
        expect(script).toContain('autoCleanup');
    });

    test('generates script with archive action', () => {
        const rules: Rule[] = [makeRule({ tabId: 'tab-2', action: 'archive', daysOld: 60 })];
        const script = generateAppsScript(TABS, rules, 'test@gmail.com');

        expect(script).toContain("action: 'archive'");
        expect(script).toContain('moveThreadsToArchive');
    });

    test('generates script with markRead action', () => {
        const rules: Rule[] = [makeRule({ tabId: 'tab-1', action: 'markRead', daysOld: 45 })];
        const script = generateAppsScript(TABS, rules, 'test@gmail.com');

        expect(script).toContain("action: 'markRead'");
        expect(script).toContain('markThreadsRead');
    });

    test('generates script with moveToLabel action including target', () => {
        const rules: Rule[] = [
            makeRule({
                tabId: 'tab-1',
                action: 'moveToLabel',
                daysOld: 90,
                targetLabel: 'Archive-Newsletters',
            }),
        ];
        const script = generateAppsScript(TABS, rules, 'test@gmail.com');

        expect(script).toContain("action: 'moveToLabel'");
        expect(script).toContain("targetLabel: 'Archive-Newsletters'");
        expect(script).toContain('getUserLabelByName');
        expect(script).toContain('addLabel');
        expect(script).toContain('removeLabel');
    });

    // ---------------------------------------------------------------------------
    // Filtering behavior
    // ---------------------------------------------------------------------------

    test('skips disabled rules', () => {
        const rules: Rule[] = [
            makeRule({ tabId: 'tab-1', action: 'trash', enabled: false }),
            makeRule({ tabId: 'tab-2', action: 'archive', enabled: true }),
        ];
        const script = generateAppsScript(TABS, rules, 'test@gmail.com');

        expect(script).not.toContain("label: 'newsletters'");
        expect(script).toContain("label: 'bank-notifications'");
    });

    test('skips rules with no matching tab', () => {
        const rules: Rule[] = [makeRule({ tabId: 'nonexistent-tab', action: 'trash' })];
        const script = generateAppsScript(TABS, rules, 'test@gmail.com');

        // Should still produce a valid script, just with empty RULES array
        expect(script).toContain('var RULES = [');
        expect(script).toContain('autoCleanup');
    });

    test('handles multiple rules across tabs', () => {
        const rules: Rule[] = [
            makeRule({ tabId: 'tab-1', action: 'trash', daysOld: 14 }),
            makeRule({ tabId: 'tab-2', action: 'archive', daysOld: 60 }),
            makeRule({ tabId: 'tab-3', action: 'markRead', daysOld: 7 }),
        ];
        const script = generateAppsScript(TABS, rules, 'test@gmail.com');

        expect(script).toContain("label: 'newsletters'");
        expect(script).toContain("label: 'bank-notifications'");
        expect(script).toContain("label: 'spam-letters'");
    });

    // ---------------------------------------------------------------------------
    // Special characters
    // ---------------------------------------------------------------------------

    test('escapes special characters in label names', () => {
        const tabs: Tab[] = [{ id: 'special', title: "Tab's Name", type: 'label', value: "it's-a-label" }];
        const rules: Rule[] = [makeRule({ tabId: 'special', action: 'trash' })];
        const script = generateAppsScript(tabs, rules, 'test@gmail.com');

        // Single quotes should be escaped
        expect(script).toContain("it\\'s-a-label");
        expect(script).not.toContain("it's-a-label");
    });

    // ---------------------------------------------------------------------------
    // Sheet logging
    // ---------------------------------------------------------------------------

    test('includes Sheet logging when sheetUrl is provided', () => {
        const rules: Rule[] = [makeRule({ tabId: 'tab-1', action: 'trash' })];
        const sheetUrl = 'https://docs.google.com/spreadsheets/d/abc123/edit';
        const script = generateAppsScript(TABS, rules, 'test@gmail.com', sheetUrl);

        expect(script).toContain('SHEET_URL');
        expect(script).toContain('logToSheet');
        expect(script).toContain('SpreadsheetApp.openByUrl');
        expect(script).toContain(sheetUrl);
    });

    test('omits Sheet logging when sheetUrl is not provided', () => {
        const rules: Rule[] = [makeRule({ tabId: 'tab-1', action: 'trash' })];
        const script = generateAppsScript(TABS, rules, 'test@gmail.com');

        expect(script).not.toContain('SHEET_URL');
        expect(script).not.toContain('logToSheet');
        expect(script).not.toContain('SpreadsheetApp');
    });

    // ---------------------------------------------------------------------------
    // Script structure validity
    // ---------------------------------------------------------------------------

    test('generated script is syntactically structured', () => {
        const rules: Rule[] = [
            makeRule({ tabId: 'tab-1', action: 'trash', daysOld: 14 }),
            makeRule({ tabId: 'tab-2', action: 'archive', daysOld: 30 }),
        ];
        const script = generateAppsScript(TABS, rules, 'test@gmail.com');

        // Must have function declaration
        expect(script).toContain('function autoCleanup()');
        // Must have RULES array
        expect(script).toContain('var RULES = [');
        // Must have error handling
        expect(script).toContain('try {');
        expect(script).toContain('catch (e)');
        // Must have Logger
        expect(script).toContain('Logger.log');
        // Must reference GmailApp
        expect(script).toContain('GmailApp.search');
        // Must include setup instructions
        expect(script).toContain('Setup Instructions');
    });

    test('includes generation date in header', () => {
        const rules: Rule[] = [makeRule({ tabId: 'tab-1', action: 'trash' })];
        const script = generateAppsScript(TABS, rules, 'test@gmail.com');
        const today = new Date().toISOString().split('T')[0];

        expect(script).toContain(`Generated on: ${today}`);
    });

    test('includes tab title as comment in rules array', () => {
        const rules: Rule[] = [makeRule({ tabId: 'tab-1', action: 'trash' })];
        const script = generateAppsScript(TABS, rules, 'test@gmail.com');

        expect(script).toContain('/* Newsletters */');
    });

    test('includes account identity and runtime guard', () => {
        const rules: Rule[] = [makeRule({ tabId: 'tab-1', action: 'trash' })];
        const script = generateAppsScript(TABS, rules, 'work@gmail.com');

        expect(script).toContain('Generated for: work@gmail.com');
        expect(script).toContain("var EXPECTED_USER = 'work@gmail.com'");
        expect(script).toContain('Session.getActiveUser().getEmail()');
        expect(script).toContain('Aborting');
    });
});

// ---------------------------------------------------------------------------
// tabToGmailLabel + non-label tab handling (A2)
// ---------------------------------------------------------------------------

describe('tabToGmailLabel', () => {
    test('returns the value for label tabs', () => {
        expect(tabToGmailLabel({ id: 'a', title: 'Work', type: 'label', value: 'Work' })).toBe('Work');
    });

    test('decodes the label name for #label/ hash tabs', () => {
        expect(tabToGmailLabel({ id: 'b', title: 'Team', type: 'hash', value: '#label/Team+Updates' })).toBe(
            'Team Updates'
        );
    });

    test('returns null for system/search hash tabs', () => {
        expect(tabToGmailLabel({ id: 'c', title: 'Inbox', type: 'hash', value: '#inbox' })).toBeNull();
        expect(tabToGmailLabel({ id: 'd', title: 'Starred', type: 'hash', value: '#starred' })).toBeNull();
        expect(tabToGmailLabel({ id: 'e', title: 'Unread', type: 'hash', value: '#search/is:unread' })).toBeNull();
    });

    test('returns null for empty label values', () => {
        expect(tabToGmailLabel({ id: 'f', title: 'Blank', type: 'label', value: '   ' })).toBeNull();
    });
});

describe('generateAppsScript with non-label tabs', () => {
    test('skips rules whose tab does not resolve to a label', () => {
        const tabs: Tab[] = [
            { id: 'inbox', title: 'Inbox', type: 'hash', value: '#inbox' },
            { id: 'work', title: 'Work', type: 'label', value: 'Work' },
        ];
        const rules: Rule[] = [
            makeRule({ tabId: 'inbox', action: 'trash' }),
            makeRule({ tabId: 'work', action: 'archive' }),
        ];
        const script = generateAppsScript(tabs, rules, 'test@gmail.com');

        // The #inbox rule is dropped; only the real label produces a config line.
        expect(script).not.toContain("label: '#inbox'");
        expect(script).toContain("label: 'Work'");
    });

    test('resolves #label/ hash tabs to their label name in the query config', () => {
        const tabs: Tab[] = [{ id: 'h', title: 'Team', type: 'hash', value: '#label/Team+Updates' }];
        const rules: Rule[] = [makeRule({ tabId: 'h', action: 'markRead' })];
        const script = generateAppsScript(tabs, rules, 'test@gmail.com');

        expect(script).toContain("label: 'Team Updates'");
    });
});

// ---------------------------------------------------------------------------
// Script generation — untrusted strings
// ---------------------------------------------------------------------------
//
// Tab titles and labels are user data, and an imported config can carry
// anything. The generated script is pasted into Apps Script and run under the
// user's own Google account, so nothing in it may break out of its context.

describe('generateAppsScript escaping', () => {
    test('a title containing */ cannot close the comment it sits in', () => {
        const tabs: Tab[] = [
            { id: 'evil', title: 'Work */ ; DriveApp.getFiles(); /*', type: 'label', value: 'work' },
        ];
        const script = generateAppsScript(tabs, [makeRule({ tabId: 'evil', action: 'archive' })], 'u@gmail.com');

        // The payload must not appear as live code between the config line and
        // the end of its comment.
        expect(script).not.toContain('*/ ; DriveApp.getFiles();');
        expect(script).toContain('* / ; DriveApp.getFiles(); / *');

        // Every block comment opened in the generated script is closed exactly
        // once, so nothing downstream is swallowed or exposed.
        const opens = (script.match(/\/\*/g) || []).length;
        const closes = (script.match(/\*\//g) || []).length;
        expect(opens).toBe(closes);
    });

    test('a label containing a quote cannot close the string it sits in', () => {
        const tabs: Tab[] = [
            { id: 'q', title: 'Quote', type: 'label', value: "work'; DriveApp.getFiles(); var x='" },
        ];
        const script = generateAppsScript(tabs, [makeRule({ tabId: 'q', action: 'trash' })], 'u@gmail.com');

        expect(script).toContain("\\'");
        expect(script).not.toMatch(/label: 'work'; DriveApp/);
    });

    test('line terminators in a label are escaped, including U+2028 and U+2029', () => {
        const tabs: Tab[] = [
            { id: 'nl', title: 'Lines', type: 'label', value: 'a\nb\rc d e' },
        ];
        const script = generateAppsScript(tabs, [makeRule({ tabId: 'nl', action: 'trash' })], 'u@gmail.com');

        const configLine = script.split('\n').find((l) => l.includes('label:'))!;
        expect(configLine).toContain('\\n');
        expect(configLine).toContain('\\r');
        expect(configLine).toContain('\\u2028');
        expect(configLine).toContain('\\u2029');
    });

    test('a multi-line title cannot spill out of its comment', () => {
        const tabs: Tab[] = [
            { id: 'ml', title: 'First line\nDriveApp.getFiles();', type: 'label', value: 'work' },
        ];
        const script = generateAppsScript(tabs, [makeRule({ tabId: 'ml', action: 'trash' })], 'u@gmail.com');

        const configLine = script.split('\n').find((l) => l.includes('label:'))!;
        expect(configLine).toContain('First line DriveApp.getFiles();');
    });
});
