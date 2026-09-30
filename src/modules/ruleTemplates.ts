/**
 * ruleTemplates.ts
 *
 * One-click "starter preset" automation templates. Each template describes a
 * common cleanup rule; applying it creates the matching tab (if missing) AND
 * its enabled rule in a single atomic save. A template targets either a user
 * label (a label tab) or one of Gmail's inbox categories (a `#category/...`
 * hash tab, which the rule searches as `category:<name>`).
 *
 * This whole feature is gated behind RULE_TEMPLATES_ENABLED. Flip it to `false`
 * and the options page renders no template UI; no other code needs to change.
 * The module is otherwise dependency-light so it can be deleted wholesale if the
 * feature is ever dropped.
 */

import { getSettings, mutateSettings, Rule, RuleAction, Tab } from '../utils/storage';
import { TabColor } from '../utils/colors';
import { GmailCategory, tabToGmailCategory, tabToGmailLabel } from './rules';

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
    /**
     * The created tab's title. For a label template it is also the Gmail
     * label the tab targets and the rule's `label:` search.
     */
    labelName: string;
    /**
     * Set for a template aimed at one of Gmail's inbox categories. Promotions,
     * Social and Updates are categories, not labels: `label:"Promotions"`
     * finds nothing for almost everyone, so these templates create a
     * `#category/<name>` tab whose rule searches `category:<name>`.
     */
    category?: GmailCategory;
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
        category: 'promotions',
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
        category: 'social',
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
        category: 'updates',
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

/** The tab value a template's tab carries. */
export function templateTabValue(template: RuleTemplate): string {
    return template.category ? `#category/${template.category}` : template.labelName;
}

/** What the options page shows as the template's search scope. */
export function describeTemplateScope(template: RuleTemplate): string {
    return template.category ? `category:${template.category}` : `label:${template.labelName}`;
}

/**
 * Apply a template to an account: ensure a tab for it exists (a label tab for
 * `template.labelName`, or a `#category/...` tab for `template.category`),
 * then upsert an enabled rule on it.
 *
 * Someone who applied one of the category templates in an earlier version has
 * a label tab named Promotions, Social or Updates. That tab is left alone rather than migrated:
 * it may be a real label they use, and the category tab this creates sits
 * beside it.
 *
 * The whole change goes through a single `applyTemplate` op, so a tab is never
 * created without its rule, and a concurrent edit from a Gmail tab cannot be
 * overwritten by the tab and rule arrays this function read a moment ago.
 */
export async function applyRuleTemplate(accountId: string, template: RuleTemplate): Promise<ApplyTemplateResult> {
    const settings = await getSettings(accountId);

    // Resolving which tab maps to a Gmail label needs the label grammar, which
    // lives in rules.ts. Do it here and hand the reducer a concrete tab.
    const existing = settings.tabs.find((t) =>
        template.category ? tabToGmailCategory(t) === template.category : tabToGmailLabel(t) === template.labelName
    );

    const tab: Tab = existing ?? {
        id: crypto.randomUUID(),
        title: template.labelName,
        type: template.category ? 'hash' : 'label',
        value: templateTabValue(template),
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
