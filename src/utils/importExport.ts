/**
 * importExport.ts
 *
 * Shared import/export utilities used by both the Gmail overlay (modals.ts)
 * and the options page (options.ts).
 *
 * Provides: payload construction, filename generation, validation, and
 * the download trigger via chrome.runtime.sendMessage.
 */

import { Tab, Rule, RuleAction, Theme, clampDaysOld } from './storage';
import { isValidTabColor } from './colors';

/**
 * The largest backup this accepts. A real one is a few kilobytes, and all of
 * it has to fit in one chrome.storage.sync item of about 8 KB, so anything
 * near this is not a backup of this extension.
 */
export const MAX_IMPORT_BYTES = 256 * 1024;

/** The longest tab title, tab value or target label an import keeps. */
export const MAX_IMPORT_TEXT_CHARS = 500;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExportData {
    version: number;
    timestamp: number;
    email: string;
    tabs: Tab[];
    rules?: Rule[];
    theme?: Theme;
}

export interface DownloadResult {
    success: boolean;
    downloadId?: number;
    error?: string;
}

// ---------------------------------------------------------------------------
// Payload & Filename
// ---------------------------------------------------------------------------

/**
 * Build a versioned export payload from the given email, tabs, and (optionally)
 * automation rules and the current theme. `rules`/`theme` are omitted from the
 * payload when not supplied, keeping backward-compatible v1 exports for callers
 * that only pass tabs.
 */
export function buildExportPayload(email: string, tabs: Tab[], rules?: Rule[], theme?: Theme): ExportData {
    const payload: ExportData = {
        version: 1,
        timestamp: Date.now(),
        email,
        tabs,
    };
    if (rules) payload.rules = rules;
    if (theme) payload.theme = theme;
    return payload;
}

/**
 * Generate a safe, timestamped filename for an export file.
 * Example: GmailTabs_user_gmail_com_2026-03-03.json
 */
export function generateExportFilename(email: string): string {
    const date = new Date().toISOString().split('T')[0];
    const sanitizedEmail = email.replace(/[^a-zA-Z0-9._-]/g, '_');
    return `GmailTabs_${sanitizedEmail}_${date}.json`;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validate imported JSON data and rebuild it from known fields. Returns the
 * tabs array on success. Throws a descriptive Error on validation failure.
 *
 * On success `data.tabs` and `data.rules` are replaced with the rebuilt
 * arrays, so a caller that goes on to read them gets the clean versions:
 *  - each tab is exactly {id, title, type, value, color?}, each rule exactly
 *    {tabId, action, daysOld, enabled, targetLabel?}. Anything else in the
 *    file is dropped rather than written into sync storage, where it would
 *    count against the 8 KB quota and be carried forward by every write.
 *  - an exact duplicate tab is dropped; a tab reusing another's id gets a
 *    fresh id, since rules and the tab bar both key on it.
 *  - a rule whose tab is not in the file is dropped, and so is a second rule
 *    for the same tab.
 *  - a backup with no rules imports as no rules. Importing replaces tabs, so
 *    keeping the old rules would leave them pointing at tabs that are gone.
 *  - `daysOld` is clamped to a whole number from 1 to 3650 rather than
 *    rejected: an old export with 365.5 in it should still restore, and the
 *    clamped value is what the options page would have saved anyway.
 *  - titles, values and target labels longer than MAX_IMPORT_TEXT_CHARS, and
 *    files larger than MAX_IMPORT_BYTES, are rejected.
 */
export function validateImportData(data: Record<string, unknown>): Tab[] {
    // Measured on the parsed value because not every caller has the raw file:
    // the in-Gmail import modal reads a pasted string. Re-serialising is the
    // same length as the compact original, give or take whitespace.
    let size = 0;
    try {
        size = JSON.stringify(data).length;
    } catch {
        throw new Error('Invalid format: the file could not be read as settings.');
    }
    if (size > MAX_IMPORT_BYTES) {
        throw new Error(`File too large: a settings backup is at most ${MAX_IMPORT_BYTES / 1024} KB.`);
    }

    if (!data.tabs || !Array.isArray(data.tabs)) {
        throw new Error('Invalid format: Missing "tabs" array.');
    }

    const rawTabs = data.tabs as Record<string, unknown>[];
    const tabs: Tab[] = [];
    for (let i = 0; i < rawTabs.length; i++) {
        const t = rawTabs[i];
        if (!t || typeof t !== 'object') {
            throw new Error(`Invalid tab at index ${i}: not an object.`);
        }
        if (typeof t.id !== 'string' || !(t.id as string).trim()) {
            throw new Error(`Invalid tab at index ${i}: missing or empty "id".`);
        }
        if (typeof t.title !== 'string' || !(t.title as string).trim()) {
            throw new Error(`Invalid tab at index ${i}: missing or empty "title".`);
        }
        if (t.type !== 'label' && t.type !== 'hash') {
            throw new Error(`Invalid tab at index ${i}: "type" must be "label" or "hash".`);
        }
        if (typeof t.value !== 'string' || !(t.value as string).trim()) {
            throw new Error(`Invalid tab at index ${i}: missing or empty "value".`);
        }
        checkLength(t.title as string, `tab at index ${i}`, 'title');
        checkLength(t.value as string, `tab at index ${i}`, 'value');

        const tab: Tab = { id: t.id as string, title: t.title as string, type: t.type, value: t.value as string };
        // `color` is optional. An unknown/malformed color silently falls back
        // to default (dropped) rather than rejecting an otherwise valid backup.
        if (t.color !== undefined && isValidTabColor(t.color)) tab.color = t.color;
        tabs.push(tab);
    }

    // Rules are optional. If present, validate shape so a malformed backup is
    // rejected rather than silently importing broken automation config.
    const rules: Rule[] = [];
    if (data.rules !== undefined) {
        if (!Array.isArray(data.rules)) {
            throw new Error('Invalid format: "rules" must be an array.');
        }
        const validActions: RuleAction[] = ['trash', 'archive', 'markRead', 'moveToLabel'];
        const rawRules = data.rules as Record<string, unknown>[];
        for (let i = 0; i < rawRules.length; i++) {
            const r = rawRules[i];
            if (!r || typeof r !== 'object') {
                throw new Error(`Invalid rule at index ${i}: not an object.`);
            }
            if (typeof r.tabId !== 'string' || !(r.tabId as string).trim()) {
                throw new Error(`Invalid rule at index ${i}: missing or empty "tabId".`);
            }
            if (typeof r.action !== 'string' || !validActions.includes(r.action as RuleAction)) {
                throw new Error(`Invalid rule at index ${i}: invalid "action".`);
            }
            if (typeof r.daysOld !== 'number' || !Number.isFinite(r.daysOld)) {
                throw new Error(`Invalid rule at index ${i}: "daysOld" must be a number.`);
            }
            if (typeof r.enabled !== 'boolean') {
                throw new Error(`Invalid rule at index ${i}: "enabled" must be a boolean.`);
            }
            if (r.targetLabel !== undefined && typeof r.targetLabel !== 'string') {
                throw new Error(`Invalid rule at index ${i}: "targetLabel" must be a string.`);
            }
            if (typeof r.targetLabel === 'string') checkLength(r.targetLabel, `rule at index ${i}`, 'targetLabel');

            const rule: Rule = {
                tabId: r.tabId as string,
                action: r.action as RuleAction,
                daysOld: clampDaysOld(r.daysOld),
                enabled: r.enabled,
            };
            if (typeof r.targetLabel === 'string') rule.targetLabel = r.targetLabel;
            rules.push(rule);
        }
    }

    const cleanTabs = dedupeTabs(tabs);
    sanitizeImportedIds(cleanTabs, rules);

    const tabIds = new Set(cleanTabs.map((t) => t.id));
    const ruled = new Set<string>();
    const cleanRules = rules.filter((r) => {
        if (!tabIds.has(r.tabId) || ruled.has(r.tabId)) return false;
        ruled.add(r.tabId);
        return true;
    });

    data.tabs = cleanTabs;
    data.rules = cleanRules;
    return cleanTabs;
}

function checkLength(value: string, where: string, field: string): void {
    if (value.length > MAX_IMPORT_TEXT_CHARS) {
        throw new Error(`Invalid ${where}: "${field}" is longer than ${MAX_IMPORT_TEXT_CHARS} characters.`);
    }
}

/**
 * Drop exact duplicate tabs and give a fresh id to a tab that reuses another
 * tab's id. The rules that pointed at a duplicated id stay with its first
 * holder: a backup cannot say which of two same-id tabs a rule meant, and
 * the first one is the one every earlier version would have matched.
 */
function dedupeTabs(tabs: Tab[]): Tab[] {
    const byId = new Map<string, Tab>();
    const out: Tab[] = [];
    for (const tab of tabs) {
        const holder = byId.get(tab.id);
        if (!holder) {
            byId.set(tab.id, tab);
            out.push(tab);
            continue;
        }
        if (JSON.stringify(holder) === JSON.stringify(tab)) continue;
        const renamed = { ...tab, id: crypto.randomUUID() };
        byId.set(renamed.id, renamed);
        out.push(renamed);
    }
    return out;
}

/**
 * True when two account ids name the same account. Gmail addresses are case
 * insensitive, and the address a backup carries may have been typed or
 * captured differently from the one this page detected.
 */
export function sameAccount(a: string, b: string): boolean {
    return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * Ids we are willing to put in markup without thinking about it again.
 * Everything this extension generates is a UUID or a `default-*` constant.
 */
const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Replace any tab id that is not plain, and repoint the rules that used it.
 *
 * A tab id travels straight into an HTML attribute (`data-tab-id="..."`), so an
 * imported backup carrying `id: 'x" onmouseover="…'` could inject markup into
 * the options page, which is an extension page with chrome.* access. The sinks
 * escape it too, but a backup is a file someone can be talked into opening, so
 * the value should never have been dangerous in the first place.
 *
 * Rewriting beats rejecting: a legacy export whose ids came from the very old
 * `labels` array still restores, it just gets fresh ids.
 */
function sanitizeImportedIds(tabs: Tab[], rules: Rule[]): void {
    const remapped = new Map<string, string>();

    tabs.forEach((t) => {
        const id = t.id;
        if (SAFE_ID.test(id)) return;
        const replacement = crypto.randomUUID();
        remapped.set(id, replacement);
        t.id = replacement;
    });

    if (remapped.size === 0) return;

    rules.forEach((r) => {
        const next = remapped.get(r.tabId);
        if (next) r.tabId = next;
    });
}

// ---------------------------------------------------------------------------
// Download Trigger
// ---------------------------------------------------------------------------

/**
 * Send a DOWNLOAD_FILE message to the background script.
 * Returns a promise that resolves with the background response.
 */
export function triggerDownload(filename: string, json: string): Promise<DownloadResult> {
    return new Promise((resolve) => {
        chrome.runtime.sendMessage(
            {
                action: 'DOWNLOAD_FILE',
                filename,
                data: json,
            },
            (response) => {
                if (chrome.runtime.lastError) {
                    console.error('Gmail Tabs: Download message failed', chrome.runtime.lastError);
                    resolve({
                        success: false,
                        error: chrome.runtime.lastError.message || 'Message failed',
                    });
                    return;
                }
                if (response && response.success) {
                    resolve({ success: true, downloadId: response.downloadId });
                } else {
                    resolve({
                        success: false,
                        error: response?.error || 'Unknown error',
                    });
                }
            }
        );
    });
}
