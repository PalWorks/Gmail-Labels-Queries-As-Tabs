/**
 * ruleTemplates.ts
 *
 * One-click "starter preset" automation templates. Each template describes a
 * common cleanup rule; applying it creates the matching label tab (if missing)
 * AND its enabled rule in a single atomic save.
 *
 * This whole feature is gated behind RULE_TEMPLATES_ENABLED. Flip it to `false`
 * and the options page renders no template UI; no other code needs to change.
 * The module is otherwise dependency-light so it can be deleted wholesale if the
 * feature is ever dropped.
 */

import { getSettings, mutateSettings, Rule, RuleAction, Tab } from '../utils/storage';
import { TabColor } from '../utils/colors';
import { tabToGmailLabel } from './rules';

// ---------------------------------------------------------------------------
// Feature flag
// ---------------------------------------------------------------------------

/** Master switch for the entire rule-template feature. */
export const RULE_TEMPLATES_ENABLED = true;

// ---------------------------------------------------------------------------
// Template definitions
// ---------------------------------------------------------------------------

export interface RuleTemplate {
    id: string;
    /** Card title. */
    name: string;
    /** Leading emoji shown on the card. */
    icon: string;
    /** One-line explanation. */
    description: string;
    /** Gmail label the tab targets (and the rule's `label:` query). */
    labelName: string;
    action: RuleAction;
    daysOld: number;
    /** Optional palette token applied to the created tab. */
    color?: TabColor;
}

/**
 * Curated starter presets. Label names are common defaults the user can rename
 * afterward; applying a template only wires up the structure (tab + rule), it
 * never touches mail directly.
 */
export const RULE_TEMPLATES: readonly RuleTemplate[] = [
    {
        id: 'clean-promotions',
        name: 'Clean Promotions',
        icon: '🗑',
        description: 'Trash promotional mail older than 30 days.',
        labelName: 'Promotions',
        action: 'trash',
        daysOld: 30,
        color: 'orange',
    },
    {
        id: 'tidy-newsletters',
        name: 'Tidy Newsletters',
        icon: '📦',
        description: 'Archive newsletters after 14 days to keep the inbox lean.',
        labelName: 'Newsletters',
        action: 'archive',
        daysOld: 14,
        color: 'blue',
    },
    {
        id: 'quiet-social',
        name: 'Quiet Social',
        icon: '✉️',
        description: 'Mark social notifications read after 7 days.',
        labelName: 'Social',
        action: 'markRead',
        daysOld: 7,
        color: 'teal',
    },
    {
        id: 'archive-receipts',
        name: 'Archive Receipts',
        icon: '🧾',
        description: 'Archive receipts after 90 days but keep them searchable.',
        labelName: 'Receipts',
        action: 'archive',
        daysOld: 90,
        color: 'green',
    },
    {
        id: 'clear-updates',
        name: 'Clear Updates',
        icon: '🔔',
        description: 'Trash automated update emails after 60 days.',
        labelName: 'Updates',
        action: 'trash',
        daysOld: 60,
        color: 'purple',
    },
];

// ---------------------------------------------------------------------------
// Apply
// ---------------------------------------------------------------------------

export interface ApplyTemplateResult {
    tabId: string;
    createdTab: boolean;
    createdRule: boolean;
}

/**
 * Apply a template to an account: ensure a label tab for `template.labelName`
 * exists, then upsert an enabled rule on it.
 *
 * The whole change goes through a single `applyTemplate` op, so a tab is never
 * created without its rule, and a concurrent edit from a Gmail tab cannot be
 * overwritten by the tab and rule arrays this function read a moment ago.
 */
export async function applyRuleTemplate(accountId: string, template: RuleTemplate): Promise<ApplyTemplateResult> {
    const settings = await getSettings(accountId);

    // Resolving which tab maps to a Gmail label needs the label grammar, which
    // lives in rules.ts. Do it here and hand the reducer a concrete tab.
    const existing = settings.tabs.find((t) => tabToGmailLabel(t) === template.labelName);

    const tab: Tab = existing ?? {
        id: crypto.randomUUID(),
        title: template.labelName,
        type: 'label',
        value: template.labelName,
        color: template.color,
    };

    const rule: Rule = {
        tabId: tab.id,
        action: template.action,
        daysOld: template.daysOld,
        enabled: true,
    };

    const createdRule = !settings.rules.some((r) => r.tabId === tab.id);

    await mutateSettings(accountId, { kind: 'applyTemplate', tab, rule });

    return { tabId: tab.id, createdTab: !existing, createdRule };
}
