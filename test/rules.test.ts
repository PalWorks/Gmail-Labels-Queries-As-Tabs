export {};
/**
 * rules.test.ts
 *
 * Unit tests for the Apps Script generator module.
 * Tests script generation for all 4 action types, Sheet logging,
 * edge cases, and output validity.
 */

import { generateAppsScript } from '../src/modules/rules';
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
        const script = generateAppsScript(TABS, rules);

        expect(script).toContain("label: 'newsletters'");
        expect(script).toContain('daysOld: 14');
        expect(script).toContain("action: 'trash'");
        expect(script).toContain('moveToTrash');
        expect(script).toContain('autoCleanup');
    });

    test('generates script with archive action', () => {
        const rules: Rule[] = [makeRule({ tabId: 'tab-2', action: 'archive', daysOld: 60 })];
        const script = generateAppsScript(TABS, rules);

        expect(script).toContain("action: 'archive'");
        expect(script).toContain('moveThreadsToArchive');
    });

    test('generates script with markRead action', () => {
        const rules: Rule[] = [makeRule({ tabId: 'tab-1', action: 'markRead', daysOld: 45 })];
        const script = generateAppsScript(TABS, rules);

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
        const script = generateAppsScript(TABS, rules);

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
        const script = generateAppsScript(TABS, rules);

        expect(script).not.toContain("label: 'newsletters'");
        expect(script).toContain("label: 'bank-notifications'");
    });

    test('skips rules with no matching tab', () => {
        const rules: Rule[] = [makeRule({ tabId: 'nonexistent-tab', action: 'trash' })];
        const script = generateAppsScript(TABS, rules);

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
        const script = generateAppsScript(TABS, rules);

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
        const script = generateAppsScript(tabs, rules);

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
        const script = generateAppsScript(TABS, rules, sheetUrl);

        expect(script).toContain('SHEET_URL');
        expect(script).toContain('logToSheet');
        expect(script).toContain('SpreadsheetApp.openByUrl');
        expect(script).toContain(sheetUrl);
    });

    test('omits Sheet logging when sheetUrl is not provided', () => {
        const rules: Rule[] = [makeRule({ tabId: 'tab-1', action: 'trash' })];
        const script = generateAppsScript(TABS, rules);

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
        const script = generateAppsScript(TABS, rules);

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
        const script = generateAppsScript(TABS, rules);
        const today = new Date().toISOString().split('T')[0];

        expect(script).toContain(`Generated on: ${today}`);
    });

    test('includes tab title as comment in rules array', () => {
        const rules: Rule[] = [makeRule({ tabId: 'tab-1', action: 'trash' })];
        const script = generateAppsScript(TABS, rules);

        expect(script).toContain('/* Newsletters */');
    });
});
