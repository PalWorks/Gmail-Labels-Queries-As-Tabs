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
    applyRuleTemplate,
} from '../src/modules/ruleTemplates';
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
        const template = RULE_TEMPLATES[0];
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
        const template = RULE_TEMPLATES[0];
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
        const template = RULE_TEMPLATES[0];
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
        const template = RULE_TEMPLATES[0]; // action: 'trash'
        // Seed a tab mapping to the template's label with a moveToLabel rule.
        await saveSettings(ACCOUNT, {
            tabs: [{ id: 'existing', title: 'Promos', type: 'label', value: template.labelName }],
            rules: [{ tabId: 'existing', action: 'moveToLabel', daysOld: 10, enabled: true, targetLabel: 'Old' }],
        });

        await applyRuleTemplate(ACCOUNT, template);

        const settings = await getSettings(ACCOUNT);
        const rule = settings.rules.find((r) => r.tabId === 'existing')!;
        expect(rule.action).toBe('trash');
        expect(rule.targetLabel).toBeUndefined();
    });

    test('updates an existing rule instead of adding a second', async () => {
        const template = RULE_TEMPLATES[0];
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
