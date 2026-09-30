export {};
/**
 * ruleTemplates.test.ts
 *
 * Unit tests for the one-click rule-template feature: definition integrity and
 * the applyRuleTemplate upsert behavior (create tab + rule, reuse, update).
 */

import {
    RULE_TEMPLATES,
    RULE_TEMPLATES_ENABLED,
    RuleTemplate,
    applyRuleTemplate,
    describeTemplateScope,
} from '../src/modules/ruleTemplates';
import { generateAppsScript } from '../src/modules/rules';
import { getSettings, saveSettings, RuleAction } from '../src/utils/storage';
import { isValidTabColor } from '../src/utils/colors';

const mockStorage: Record<string, any> = {};

function makeArea(store: Record<string, any>) {
    return {
        get: jest.fn((keys: string | string[] | null, cb: (items: Record<string, any>) => void) => {
            if (keys === null) return cb({ ...store });
            const arr = typeof keys === 'string' ? [keys] : keys;
            const res: Record<string, any> = {};
            arr.forEach((k) => {
                if (store[k] !== undefined) res[k] = store[k];
            });
            cb(res);
        }),
        set: jest.fn((items: Record<string, any>, cb: () => void) => {
            Object.assign(store, items);
            cb();
        }),
        remove: jest.fn((key: string, cb?: () => void) => {
            delete store[key];
            cb?.();
        }),
    };
}

beforeAll(() => {
    (global as any).chrome = {
        storage: { sync: makeArea(mockStorage), local: makeArea({}) },
        runtime: { lastError: null },
    };
    if (!globalThis.crypto?.randomUUID) {
        Object.defineProperty(globalThis, 'crypto', {
            value: { randomUUID: () => 'uuid-' + Math.random().toString(36).slice(2) },
            writable: true,
        });
    }
});

beforeEach(() => {
    Object.keys(mockStorage).forEach((k) => delete mockStorage[k]);
    jest.clearAllMocks();
    (global as any).chrome.runtime.lastError = null;
});

const ACCOUNT = 'user@gmail.com';

/** A template aimed at a user label, as most of them are. */
const LABEL_TEMPLATE = RULE_TEMPLATES.find((t) => t.id === 'tidy-newsletters') as RuleTemplate;

function templateById(id: string): RuleTemplate {
    return RULE_TEMPLATES.find((t) => t.id === id) as RuleTemplate;
}

describe('RULE_TEMPLATES definitions', () => {
    test('feature flag is a boolean', () => {
        expect(typeof RULE_TEMPLATES_ENABLED).toBe('boolean');
    });

    test('each template is well-formed', () => {
        const validActions: RuleAction[] = ['trash', 'archive', 'markRead', 'moveToLabel'];
        const ids = new Set<string>();
        RULE_TEMPLATES.forEach((t) => {
            expect(t.id).toBeTruthy();
            expect(ids.has(t.id)).toBe(false);
            ids.add(t.id);
            expect(t.labelName.trim().length).toBeGreaterThan(0);
            expect(validActions).toContain(t.action);
            expect(t.daysOld).toBeGreaterThan(0);
            if (t.color !== undefined) expect(isValidTabColor(t.color)).toBe(true);
        });
    });
});

describe('applyRuleTemplate', () => {
    test('creates a label tab and an enabled rule on a fresh account', async () => {
        const template = LABEL_TEMPLATE;
        const result = await applyRuleTemplate(ACCOUNT, template);

        expect(result.createdTab).toBe(true);
        expect(result.createdRule).toBe(true);

        const settings = await getSettings(ACCOUNT);
        const tab = settings.tabs.find((t) => t.id === result.tabId);
        expect(tab).toBeDefined();
        expect(tab!.type).toBe('label');
        expect(tab!.value).toBe(template.labelName);
        expect(tab!.color).toBe(template.color);

        const rule = settings.rules.find((r) => r.tabId === result.tabId);
        expect(rule).toBeDefined();
        expect(rule!.enabled).toBe(true);
        expect(rule!.action).toBe(template.action);
        expect(rule!.daysOld).toBe(template.daysOld);
    });

    test('does not duplicate the tab when applied twice', async () => {
        const template = LABEL_TEMPLATE;
        const first = await applyRuleTemplate(ACCOUNT, template);
        const second = await applyRuleTemplate(ACCOUNT, template);

        expect(second.createdTab).toBe(false);
        expect(second.tabId).toBe(first.tabId);

        const settings = await getSettings(ACCOUNT);
        const matching = settings.tabs.filter((t) => t.value === template.labelName);
        expect(matching).toHaveLength(1);
        const rules = settings.rules.filter((r) => r.tabId === first.tabId);
        expect(rules).toHaveLength(1);
    });

    test('reuses an existing label tab that maps to the same Gmail label', async () => {
        // Seed a tab that already targets the template's label.
        const template = LABEL_TEMPLATE;
        await saveSettings(ACCOUNT, {
            tabs: [{ id: 'existing', title: 'My Promos', type: 'label', value: template.labelName }],
            rules: [],
        });

        const result = await applyRuleTemplate(ACCOUNT, template);
        expect(result.createdTab).toBe(false);
        expect(result.tabId).toBe('existing');
        expect(result.createdRule).toBe(true);

        const settings = await getSettings(ACCOUNT);
        // Title of the pre-existing tab is preserved (not overwritten).
        expect(settings.tabs.find((t) => t.id === 'existing')!.title).toBe('My Promos');
    });

    test('clears a stale targetLabel when replacing a prior moveToLabel rule', async () => {
        const template = LABEL_TEMPLATE; // action: 'archive'
        // Seed a tab mapping to the template's label with a moveToLabel rule.
        await saveSettings(ACCOUNT, {
            tabs: [{ id: 'existing', title: 'Promos', type: 'label', value: template.labelName }],
            rules: [{ tabId: 'existing', action: 'moveToLabel', daysOld: 10, enabled: true, targetLabel: 'Old' }],
        });

        await applyRuleTemplate(ACCOUNT, template);

        const settings = await getSettings(ACCOUNT);
        const rule = settings.rules.find((r) => r.tabId === 'existing')!;
        expect(rule.action).toBe(template.action);
        expect(rule.targetLabel).toBeUndefined();
    });

    test('updates an existing rule instead of adding a second', async () => {
        const template = LABEL_TEMPLATE;
        const first = await applyRuleTemplate(ACCOUNT, template);

        // Disable the rule, then re-apply — it should be re-enabled, not duplicated.
        const settings = await getSettings(ACCOUNT);
        const rule = settings.rules.find((r) => r.tabId === first.tabId)!;
        rule.enabled = false;
        await saveSettings(ACCOUNT, { rules: settings.rules });

        const second = await applyRuleTemplate(ACCOUNT, template);
        expect(second.createdRule).toBe(false);

        const after = await getSettings(ACCOUNT);
        const rules = after.rules.filter((r) => r.tabId === first.tabId);
        expect(rules).toHaveLength(1);
        expect(rules[0].enabled).toBe(true);
    });
});

describe('category templates', () => {
    test('Promotions, Social and Updates target Gmail categories; the label templates stay labels', () => {
        expect(templateById('clean-promotions').category).toBe('promotions');
        expect(templateById('quiet-social').category).toBe('social');
        expect(templateById('clear-updates').category).toBe('updates');
        expect(templateById('tidy-newsletters').category).toBeUndefined();
        expect(templateById('archive-receipts').category).toBeUndefined();
    });

    test('applying one creates a #category/ hash tab, not a label tab', async () => {
        const result = await applyRuleTemplate(ACCOUNT, templateById('clean-promotions'));
        const settings = await getSettings(ACCOUNT);
        const tab = settings.tabs.find((t) => t.id === result.tabId)!;
        expect(tab).toMatchObject({ type: 'hash', value: '#category/promotions', title: 'Promotions' });
    });

    test('the rule it creates generates a category: search that finds mail', async () => {
        const result = await applyRuleTemplate(ACCOUNT, templateById('clean-promotions'));
        const settings = await getSettings(ACCOUNT);
        const script = generateAppsScript(settings.tabs, settings.rules, ACCOUNT);
        expect(script).toContain("category: 'promotions'");
        expect(script).not.toContain("label: 'Promotions'");
        expect(settings.rules.find((r) => r.tabId === result.tabId)).toMatchObject({ action: 'trash', enabled: true });
    });

    test('an existing category tab is reused, however its value is cased', async () => {
        await saveSettings(ACCOUNT, {
            tabs: [{ id: 'mine', title: 'Social stuff', type: 'hash', value: '#category/Social' }],
            rules: [],
        });
        const result = await applyRuleTemplate(ACCOUNT, templateById('quiet-social'));
        expect(result).toMatchObject({ tabId: 'mine', createdTab: false });
    });

    test('an old label tab from an earlier template is left alone, not migrated', async () => {
        await saveSettings(ACCOUNT, {
            tabs: [{ id: 'old', title: 'Updates', type: 'label', value: 'Updates' }],
            rules: [{ tabId: 'old', action: 'trash', daysOld: 60, enabled: true }],
        });
        const result = await applyRuleTemplate(ACCOUNT, templateById('clear-updates'));
        const settings = await getSettings(ACCOUNT);
        expect(result.createdTab).toBe(true);
        expect(settings.tabs.find((t) => t.id === 'old')).toMatchObject({ type: 'label', value: 'Updates' });
        expect(settings.rules.find((r) => r.tabId === 'old')).toBeDefined();
    });

    test('the card names the scope the rule actually searches', () => {
        expect(describeTemplateScope(templateById('clean-promotions'))).toBe('category:promotions');
        expect(describeTemplateScope(LABEL_TEMPLATE)).toBe('label:Newsletters');
    });
});
