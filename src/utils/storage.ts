/**
 * storage.ts
 *
 * Typed access to the extension's settings, stored per Gmail account in
 * chrome.storage.sync under `account_<email>`.
 *
 * Concurrency
 * -----------
 * Every surface writes here: the options page, and the in-Gmail modals, drag
 * handlers and tab manager in *every open Gmail tab*. The old shape was a
 * read-modify-write against a single key with a shallow merge, so two writers
 * touching two unrelated tabs still clobbered each other.
 *
 * Writes now go through `mutateSettings`, which describes the change as a
 * serializable `SettingsOp` rather than a finished object, and applies it:
 *
 *   1. in the service worker, which is a single JavaScript context and keeps
 *      one promise chain per account — strictly serialized, no race; or
 *   2. locally with an optimistic `rev` check and bounded retry, when the
 *      worker cannot be reached.
 *
 * `applyOp` is pure and does the actual work in both cases, so the two paths
 * can never disagree. Ops are idempotent, which matters because a lost
 * worker response makes the caller fall back and apply the op a second time.
 *
 * What this does NOT fix: chrome.storage.sync replicates through Chrome Sync,
 * which resolves conflicts per key as last-writer-wins with no hook for us.
 * Two devices editing the same account offline will still lose one side. See
 * ADR-013.
 */

import { TabColor, normalizeTabColor } from './colors';
import { ignoreChromeError } from '../modules/extensionContext';

export interface Tab {
    id: string;
    title: string; // Display Name
    type: 'label' | 'hash'; // 'label' for legacy/simple, 'hash' for custom views
    value: string; // The label name or full hash string
    color?: TabColor; // Optional palette token; absent = default styling
}

// Legacy interface for migration
interface LegacyTabLabel {
    name: string;
    id: string;
    displayName?: string;
}

export type Theme = 'system' | 'light' | 'dark';

export type RuleAction = 'trash' | 'archive' | 'markRead' | 'moveToLabel';

export interface Rule {
    tabId: string; // Links to Tab.id
    action: RuleAction;
    daysOld: number; // Threshold in days
    enabled: boolean;
    targetLabel?: string; // Only for 'moveToLabel' action
}

export interface Settings {
    tabs: Tab[];
    rules: Rule[];
    // Legacy support for migration
    labels?: LegacyTabLabel[];
    theme: Theme;
    showUnreadCount: boolean;
    /**
     * Optimistic-concurrency token, bumped on every successful write. Absent in
     * anything written before v1.5, which reads as 0. Never set by callers:
     * `mutateSettings` owns it, and `applyOp` strips it from merge patches.
     */
    rev?: number;
}

// Theme is a browser-wide (per-window, all-accounts) preference, stored in
// chrome.storage.local so it applies to every Gmail account in the profile
// and does NOT sync across devices. The per-account Settings.theme field is
// retained only for backward compatibility and one-time migration seeding.
const GLOBAL_THEME_KEY = 'globalTheme';

const DEFAULT_SETTINGS: Settings = {
    tabs: [
        {
            id: 'default-inbox',
            title: 'Inbox',
            type: 'hash',
            value: '#inbox',
        },
        {
            id: 'default-sent',
            title: 'Sent',
            type: 'hash',
            value: '#sent',
        },
    ],
    rules: [],
    theme: 'light',
    showUnreadCount: true,
    rev: 0,
};

/**
 * Drop a tab's color unless it is a known palette token. Storage is the trust
 * boundary: sanitizing on read means no render path has to reason about a junk
 * token (which would otherwise become a dead CSS class, or worse, be
 * interpolated into markup).
 */
function sanitizeTabColor(tab: Tab): Tab {
    const color = normalizeTabColor(tab.color);
    if (color) return { ...tab, color };
    const cleaned = { ...tab };
    delete cleaned.color;
    return cleaned;
}

function getAccountKey(accountId: string): string {
    return `account_${accountId}`;
}

/**
 * The chrome.storage.sync key an account's settings live under. Exported so a
 * page can tell its own account's `onChanged` events from another's.
 */
export function accountStorageKey(accountId: string): string {
    return getAccountKey(accountId);
}

/**
 * Helper to safely check for runtime errors (like context invalidation)
 */
function checkRuntimeError(reject: (reason?: any) => void): boolean {
    if (chrome.runtime.lastError) {
        const msg = chrome.runtime.lastError.message;
        console.warn('Gmail Tabs: Storage Error:', msg);
        if (msg && msg.includes('Extension context invalidated')) {
            console.error('Gmail Tabs: Extension context invalidated. Please refresh the page.');
            // Rejecting might still cause unhandled promise rejections in some chains,
            // but it's better than a hard crash.
            // Alternatively, we could resolve with default values to keep the UI alive but non-functional.
            // Let's reject so the caller knows something went wrong.
            reject(new Error('Extension context invalidated'));
        } else {
            reject(new Error(msg));
        }
        return true;
    }
    return false;
}

/**
 * Retrieves the current settings for a specific account.
 */
export async function getSettings(accountId: string): Promise<Settings> {
    return new Promise((resolve, reject) => {
        const key = getAccountKey(accountId);
        try {
            chrome.storage.sync.get([key], (items) => {
                if (checkRuntimeError(reject)) return;
                const stored = items[key];
                // Deep-clone defaults to avoid shared reference mutation
                // (e.g., pushing to rules[] would mutate DEFAULT_SETTINGS)
                const defaults: Settings = {
                    tabs: [...DEFAULT_SETTINGS.tabs.map((t) => ({ ...t }))],
                    rules: [...DEFAULT_SETTINGS.rules.map((r) => ({ ...r }))],
                    theme: DEFAULT_SETTINGS.theme,
                    showUnreadCount: DEFAULT_SETTINGS.showUnreadCount,
                    rev: 0,
                };
                const settings = { ...defaults, ...stored } as Settings;
                // Storage can be corrupt, hand-edited or written by a future
                // version. Everything downstream assumes these are arrays, and
                // a non-array here would throw inside a render path.
                if (!Array.isArray(settings.tabs)) settings.tabs = defaults.tabs;
                if (!Array.isArray(settings.rules)) settings.rules = [];
                if (typeof settings.rev !== 'number' || !Number.isFinite(settings.rev)) settings.rev = 0;
                // Storage is the trust boundary for colors: anything that is
                // not a known palette token becomes "no color" here, so no
                // render path ever has to reason about a junk token.
                settings.tabs = settings.tabs.map(sanitizeTabColor);
                resolve(settings);
            });
        } catch (e) {
            // Catch synchronous errors (e.g. context invalidated before call)
            console.warn('Gmail Tabs: Storage call failed', e);
            reject(e);
        }
    });
}

// ---------------------------------------------------------------------------
// Mutation ops
// ---------------------------------------------------------------------------

/**
 * A change to an account's settings, described as data so it can cross a
 * `chrome.runtime.sendMessage` boundary into the service worker.
 *
 * Every op must be idempotent. When the worker applies an op but its response
 * is lost, the caller falls back and applies the same op locally; applying it
 * twice has to be indistinguishable from applying it once.
 */
export type SettingsOp =
    | { kind: 'merge'; patch: Partial<Settings> }
    | { kind: 'addTab'; tab: Tab }
    | { kind: 'removeTab'; tabId: string }
    | { kind: 'updateTab'; tabId: string; updates: Partial<Tab> }
    | { kind: 'reorderTabs'; order: string[] }
    | { kind: 'setPrefs'; prefs: Partial<Pick<Settings, 'theme' | 'showUnreadCount'>> }
    | { kind: 'addRule'; rule: Rule }
    | { kind: 'upsertRule'; rule: Rule }
    | { kind: 'updateRule'; tabId: string; updates: Partial<Rule> }
    | { kind: 'removeRule'; tabId: string }
    | { kind: 'applyTemplate'; tab: Tab; rule: Rule };

/**
 * Apply an op to a settings object, returning a new one. Pure: never mutates
 * its input, never touches chrome APIs, and returns the *same reference* when
 * the op changes nothing so callers can skip a pointless write.
 */
export function applyOp(current: Settings, op: SettingsOp): Settings {
    switch (op.kind) {
        case 'merge': {
            const patch = { ...op.patch };
            // `rev` belongs to the write layer. Callers routinely pass a whole
            // Settings object they read earlier, which carries a stale rev.
            delete patch.rev;
            return { ...current, ...patch };
        }

        case 'addTab': {
            // Dedupe on id as well as value: id makes a repeated application a
            // no-op, value preserves the long-standing "no two tabs for the
            // same label" rule.
            if (current.tabs.some((t) => t.id === op.tab.id || t.value === op.tab.value)) return current;
            return { ...current, tabs: [...current.tabs, op.tab] };
        }

        case 'removeTab': {
            if (!current.tabs.some((t) => t.id === op.tabId)) return current;
            return {
                ...current,
                tabs: current.tabs.filter((t) => t.id !== op.tabId),
                // A rule without its tab can never run again — rules are keyed
                // by tab id and ids are UUIDs, so nothing will ever reclaim it.
                // Leaving it behind orphans the row in sync storage forever.
                rules: current.rules.filter((r) => r.tabId !== op.tabId),
            };
        }

        case 'updateTab': {
            if (!current.tabs.some((t) => t.id === op.tabId)) return current;
            return {
                ...current,
                tabs: current.tabs.map((t) => (t.id === op.tabId ? { ...t, ...op.updates, id: t.id } : t)),
            };
        }

        case 'reorderTabs': {
            const remaining = new Map(current.tabs.map((t) => [t.id, t]));
            const ordered: Tab[] = [];
            for (const id of op.order) {
                const tab = remaining.get(id);
                if (!tab) continue; // Deleted since the caller rendered its list.
                ordered.push(tab);
                remaining.delete(id);
            }
            // Tabs the caller never knew about keep their relative order and go
            // last. Ordering by id instead of writing the caller's array is the
            // whole point: a stale list can no longer delete a tab it
            // never saw.
            for (const tab of current.tabs) {
                if (remaining.has(tab.id)) ordered.push(tab);
            }
            return { ...current, tabs: ordered };
        }

        case 'setPrefs':
            return { ...current, ...op.prefs };

        case 'addRule': {
            if (current.rules.some((r) => r.tabId === op.rule.tabId)) return current;
            return { ...current, rules: [...current.rules, op.rule] };
        }

        case 'upsertRule': {
            const exists = current.rules.some((r) => r.tabId === op.rule.tabId);
            return {
                ...current,
                rules: exists
                    ? current.rules.map((r) => (r.tabId === op.rule.tabId ? { ...r, ...op.rule } : r))
                    : [...current.rules, op.rule],
            };
        }

        case 'updateRule': {
            if (!current.rules.some((r) => r.tabId === op.tabId)) return current;
            return {
                ...current,
                rules: current.rules.map((r) => (r.tabId === op.tabId ? { ...r, ...op.updates, tabId: r.tabId } : r)),
            };
        }

        case 'removeRule': {
            if (!current.rules.some((r) => r.tabId === op.tabId)) return current;
            return { ...current, rules: current.rules.filter((r) => r.tabId !== op.tabId) };
        }

        case 'applyTemplate': {
            // The caller resolves which tab a template targets (that needs the
            // label grammar, which lives in rules.ts and must not be imported
            // here). Match on id first so a resolved existing tab is reused,
            // then on value so a repeated application cannot create a twin.
            const existing =
                current.tabs.find((t) => t.id === op.tab.id) ?? current.tabs.find((t) => t.value === op.tab.value);
            const tab = existing ?? op.tab;
            const tabs = existing ? current.tabs : [...current.tabs, op.tab];
            const rule: Rule = { ...op.rule, tabId: tab.id };
            const hasRule = current.rules.some((r) => r.tabId === tab.id);
            return {
                ...current,
                tabs,
                // Replace wholesale rather than merge: applying a template
                // resets the tab's rule, so a stale `targetLabel` from a prior
                // 'moveToLabel' rule must not linger on a different action.
                rules: hasRule ? current.rules.map((r) => (r.tabId === tab.id ? rule : r)) : [...current.rules, rule],
            };
        }

        default: {
            // Unreachable for a well-typed caller, but an op crosses a message
            // boundary: a build mismatch between a Gmail tab and a just-updated
            // service worker can deliver a kind this version has never heard
            // of. Falling off the switch would return undefined, and
            // `{ ...undefined }` would write an empty object over the account's
            // tabs and rules. Fail loudly instead.
            const unknown: never = op;
            throw new Error(`Unknown settings op: ${JSON.stringify(unknown)}`);
        }
    }
}

// ---------------------------------------------------------------------------
// Write path
// ---------------------------------------------------------------------------

/** Message action the service worker answers with a serialized mutation. */
export const MUTATE_SETTINGS_ACTION = 'MUTATE_SETTINGS';

export interface MutateSettingsMessage {
    action: typeof MUTATE_SETTINGS_ACTION;
    accountId: string;
    op: SettingsOp;
}

export type MutateSettingsResponse = { ok: true; settings: Settings } | { ok: false; error: string };

/**
 * A worker that is alive always answers in single-digit milliseconds. This only
 * exists because a service worker from a previous extension version can hold
 * the message channel open and never reply, which would otherwise hang a save
 * forever.
 */
const WORKER_RESPONSE_TIMEOUT_MS = 5_000;

/** How many times the local fallback re-reads and retries before giving up. */
const LOCAL_MUTATE_ATTEMPTS = 3;

function writeSettingsObject(accountId: string, settings: Settings): Promise<void> {
    const key = getAccountKey(accountId);
    return new Promise((resolve, reject) => {
        try {
            chrome.storage.sync.set({ [key]: settings }, () => {
                if (checkRuntimeError(reject)) return;
                resolve();
            });
        } catch (e) {
            reject(e);
        }
    });
}

/**
 * Apply an op in this context, guarding with the `rev` token.
 *
 * This is the fallback path, and it is honest about what it is: re-reading
 * immediately before writing narrows the window to a single microtask, it does
 * not close it. chrome.storage exposes no compare-and-swap. The service-worker
 * path is what actually removes the race; this runs when the worker cannot be
 * reached, and inside the worker itself where the queue already serializes.
 */
export async function mutateLocally(accountId: string, op: SettingsOp): Promise<Settings> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < LOCAL_MUTATE_ATTEMPTS; attempt++) {
        const current = await getSettings(accountId);
        const baseRev = current.rev ?? 0;
        const next = applyOp(current, op);

        // Belt and braces around the same hazard applyOp's default case
        // guards: nothing may write a value that is not a settings object.
        if (!next || !Array.isArray(next.tabs) || !Array.isArray(next.rules)) {
            throw new Error(`Refusing to write malformed settings for op "${(op as { kind?: string }).kind}"`);
        }

        // applyOp returns its input unchanged when the op is a no-op (adding a
        // tab that already exists, removing one that is gone). Writing anyway
        // would burn a sync write and wake every other tab's storage listener.
        if (next === current) return current;

        const verify = await getSettings(accountId);
        if ((verify.rev ?? 0) !== baseRev) {
            lastError = new Error('Settings changed while saving');
            continue;
        }

        const written: Settings = { ...next, rev: baseRev + 1 };
        await writeSettingsObject(accountId, written);
        return written;
    }

    throw lastError ?? new Error('Could not save settings');
}

/** True when this context has a service worker it could message. */
function canReachServiceWorker(): boolean {
    try {
        // No `window` means we already are the worker. Messaging ourselves
        // would deadlock on our own listener.
        if (typeof window === 'undefined') return false;
        return typeof chrome?.runtime?.sendMessage === 'function';
    } catch {
        return false;
    }
}

async function mutateViaServiceWorker(accountId: string, op: SettingsOp): Promise<Settings | null> {
    if (!canReachServiceWorker()) return null;

    let pending: unknown;
    try {
        const message: MutateSettingsMessage = { action: MUTATE_SETTINGS_ACTION, accountId, op };
        pending = chrome.runtime.sendMessage(message);
    } catch {
        // Extension context invalidated mid-navigation, or no worker at all.
        return null;
    }

    // Callers that stub sendMessage (and Chrome's callback form) return
    // something that is not a promise. Nothing to await: use the local path.
    if (!pending || typeof (pending as Promise<unknown>).then !== 'function') return null;

    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        const response = (await Promise.race([
            pending as Promise<MutateSettingsResponse | undefined>,
            new Promise<undefined>((resolve) => {
                timer = setTimeout(() => resolve(undefined), WORKER_RESPONSE_TIMEOUT_MS);
            }),
        ])) as MutateSettingsResponse | undefined;

        if (response && response.ok) return response.settings;
    } catch {
        // No listener registered, or the worker threw. Fall through.
    } finally {
        if (timer !== undefined) clearTimeout(timer);
    }

    return null;
}

/**
 * The single write entry point. Prefers the service worker, which serializes
 * every writer in the profile onto one queue per account; falls back to an
 * optimistic local write when the worker is unreachable.
 *
 * Returns the settings as written, including the new `rev`, so a caller can
 * recognise its own change when `chrome.storage.onChanged` fires.
 */
export async function mutateSettings(accountId: string, op: SettingsOp): Promise<Settings> {
    // An empty id would write to the key `account_`, which then shows up in
    // getAllAccounts() as a nameless account nobody can select or remove.
    if (!accountId) throw new Error('mutateSettings called without an account id');

    const viaWorker = await mutateViaServiceWorker(accountId, op);
    if (viaWorker) return viaWorker;
    return mutateLocally(accountId, op);
}

/**
 * Serializes mutations per account within a single context. The service worker
 * uses this so that concurrent messages from different Gmail tabs are applied
 * one after another against a freshly read value.
 */
export function createMutationQueue(): (accountId: string, op: SettingsOp) => Promise<Settings> {
    const chains = new Map<string, Promise<unknown>>();

    return (accountId, op) => {
        const previous = chains.get(accountId) ?? Promise.resolve();
        // Run after the previous mutation whether it resolved or rejected: one
        // caller's failure must not strand everyone behind it.
        const next = previous.then(
            () => mutateLocally(accountId, op),
            () => mutateLocally(accountId, op)
        );
        // Park a non-rejecting handle so the chain never surfaces an unhandled
        // rejection, while the caller still receives the real error.
        chains.set(
            accountId,
            next.catch(() => undefined)
        );
        return next;
    };
}

// ---------------------------------------------------------------------------
// Account registration
// ---------------------------------------------------------------------------

// One registration attempt per account per page: init paths can fire more than
// once (retries, SPA navigation) and there is no point racing ourselves.
const registrationsInFlight = new Map<string, Promise<void>>();

/**
 * Make sure this account exists in storage.
 *
 * Reading settings returns defaults without writing anything, so an account
 * the user never customised was invisible to `getAllAccounts()` — the options
 * page said "No accounts found" for someone who had been using the extension
 * happily for weeks. Registering on first Gmail load fixes that; it writes the
 * defaults once and is a no-op afterwards.
 */
export async function ensureAccountRegistered(accountId: string): Promise<void> {
    const inFlight = registrationsInFlight.get(accountId);
    if (inFlight) return inFlight;

    const run = (async () => {
        try {
            const key = getAccountKey(accountId);
            if (await accountExists(key)) return;
            // The write itself is serialized by mutateSettings, so a second
            // Gmail tab starting at the same instant cannot lose anything: the
            // worst case is writing the same defaults twice.
            await mutateSettings(accountId, { kind: 'merge', patch: {} });
        } catch (e) {
            // Best effort only. This is a convenience for the options page, so
            // a failed write (quota, context invalidated) must never abort
            // Gmail initialisation: the bar matters more than the listing.
            console.warn('Gmail Tabs: Could not register account', accountId, e);
        }
    })().finally(() => {
        registrationsInFlight.delete(accountId);
    });

    registrationsInFlight.set(accountId, run);
    return run;
}

/** True when this account already has a stored settings object. */
async function accountExists(key: string): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
        try {
            chrome.storage.sync.get([key], (items) => {
                resolve(!chrome.runtime.lastError && items[key] !== undefined);
            });
        } catch {
            resolve(true); // Storage unavailable: do not write blindly.
        }
    });
}

/**
 * Retrieves all stored accounts (keys starting with account_).
 */
export async function getAllAccounts(): Promise<string[]> {
    return new Promise((resolve, reject) => {
        try {
            chrome.storage.sync.get(null, (items) => {
                if (checkRuntimeError(reject)) return;
                const accounts = Object.keys(items)
                    .filter((k) => k.startsWith('account_'))
                    .map((k) => k.replace('account_', ''));
                resolve(accounts);
            });
        } catch (e) {
            reject(e);
        }
    });
}

// ---------------------------------------------------------------------------
// Public mutators
// ---------------------------------------------------------------------------

/**
 * Shallow-merges a patch into an account's settings.
 *
 * Prefer a specific op: a shallow merge replaces `tabs` and `rules` wholesale,
 * so passing a whole object read a while ago still discards anything another
 * surface changed in the meantime. This exists for genuine whole-object writes
 * (import, legacy migration) and for preferences.
 */
export async function saveSettings(accountId: string, newSettings: Partial<Settings>): Promise<Settings> {
    try {
        return await mutateSettings(accountId, { kind: 'merge', patch: newSettings });
    } catch (e) {
        console.warn('Gmail Tabs: Save settings failed', e);
        throw e;
    }
}

/**
 * Adds a new tab to the list for a specific account. Duplicate values are
 * ignored, as they always were.
 */
export async function addTab(
    accountId: string,
    title: string,
    value: string,
    type: 'label' | 'hash' = 'label'
): Promise<Settings> {
    const tab: Tab = {
        // Generated here rather than in the reducer so `applyOp` stays pure and
        // so re-applying a lost op is a no-op instead of a duplicate row.
        id: crypto.randomUUID(),
        title: title.trim(),
        value: value.trim(),
        type,
    };
    return mutateSettings(accountId, { kind: 'addTab', tab });
}

/**
 * Removes a tab by ID, along with the rule that pointed at it.
 */
export async function removeTab(accountId: string, tabId: string): Promise<Settings> {
    return mutateSettings(accountId, { kind: 'removeTab', tabId });
}

/**
 * Updates an existing tab for a specific account.
 */
export async function updateTab(accountId: string, tabId: string, updates: Partial<Tab>): Promise<Settings> {
    return mutateSettings(accountId, { kind: 'updateTab', tabId, updates });
}

/**
 * Reorders tabs to match `newTabs`.
 *
 * Only the ids are sent. Callers build this array from what they have rendered,
 * which can be minutes out of date — the options page renders five tabs, a
 * Gmail tab adds a sixth, and a drag in the options page used to write the
 * five-tab array straight over the top. Ordering by id reorders what actually
 * exists and appends anything the caller had not seen.
 */
export async function updateTabOrder(accountId: string, newTabs: Tab[]): Promise<Settings> {
    return mutateSettings(accountId, { kind: 'reorderTabs', order: newTabs.map((t) => t.id) });
}

/** Updates the account-level preferences that are not tabs or rules. */
export async function savePreferences(
    accountId: string,
    prefs: Partial<Pick<Settings, 'theme' | 'showUnreadCount'>>
): Promise<Settings> {
    return mutateSettings(accountId, { kind: 'setPrefs', prefs });
}

// ---------------------------------------------------------------------------
// Rule CRUD
// ---------------------------------------------------------------------------

/**
 * Adds a rule for a tab. A tab that already has a rule keeps it.
 */
export async function addRule(accountId: string, rule: Rule): Promise<Settings> {
    return mutateSettings(accountId, { kind: 'addRule', rule });
}

/**
 * Adds a rule for a tab, replacing any rule already attached to it.
 */
export async function upsertRule(accountId: string, rule: Rule): Promise<Settings> {
    return mutateSettings(accountId, { kind: 'upsertRule', rule });
}

/**
 * Updates an existing rule by tabId.
 */
export async function updateRule(accountId: string, tabId: string, updates: Partial<Rule>): Promise<Settings> {
    return mutateSettings(accountId, { kind: 'updateRule', tabId, updates });
}

/**
 * Removes a rule by tabId.
 */
export async function removeRule(accountId: string, tabId: string): Promise<Settings> {
    return mutateSettings(accountId, { kind: 'removeRule', tabId });
}

/**
 * Returns rules enriched with tab metadata (title, value) for script generation.
 * Only returns enabled rules that have a matching tab.
 */
export async function getRulesForExport(
    accountId: string
): Promise<Array<Rule & { tabTitle: string; tabValue: string }>> {
    const settings = await getSettings(accountId);
    return settings.rules
        .filter((r) => r.enabled)
        .map((r) => {
            const tab = settings.tabs.find((t) => t.id === r.tabId);
            return tab ? { ...r, tabTitle: tab.title, tabValue: tab.value } : null;
        })
        .filter((r): r is Rule & { tabTitle: string; tabValue: string } => r !== null);
}

// ---------------------------------------------------------------------------
// Global Theme (per-window, all accounts — chrome.storage.local)
// ---------------------------------------------------------------------------

/**
 * Reads the browser-wide theme preference. Falls back to 'light' if unset
 * or unavailable. This value is shared by every Gmail account in the profile.
 */
export async function getGlobalTheme(): Promise<Theme> {
    return new Promise((resolve) => {
        try {
            chrome.storage.local.get([GLOBAL_THEME_KEY], (items) => {
                if (chrome.runtime.lastError) {
                    resolve('light');
                    return;
                }
                const t = items[GLOBAL_THEME_KEY];
                resolve(t === 'light' || t === 'dark' || t === 'system' ? t : 'light');
            });
        } catch {
            resolve('light');
        }
    });
}

/**
 * Persists the browser-wide theme preference. Because it lives in
 * chrome.storage.local, every Gmail tab's storage listener fires and
 * re-applies the theme, keeping all accounts in sync within the window.
 */
export async function setGlobalTheme(theme: Theme): Promise<void> {
    return new Promise((resolve, reject) => {
        try {
            chrome.storage.local.set({ [GLOBAL_THEME_KEY]: theme }, () => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                    return;
                }
                resolve();
            });
        } catch (e) {
            reject(e);
        }
    });
}

/** The storage key used for the global theme (exported for listener checks). */
export const GLOBAL_THEME_STORAGE_KEY = GLOBAL_THEME_KEY;

// ---------------------------------------------------------------------------
// Pending onboarding tour (chrome.storage.local)
// ---------------------------------------------------------------------------

/** Set on install; consumed by the first Gmail tab that sees it. */
const PENDING_ONBOARDING_KEY = 'pendingOnboarding';

/** Exported for listener checks and tests. */
export const PENDING_ONBOARDING_STORAGE_KEY = PENDING_ONBOARDING_KEY;

/**
 * Flag the tour to run in the next Gmail tab that initialises.
 *
 * The service worker cannot simply message an open Gmail tab on install: that
 * tab is still running no content script at all until it reloads, so the
 * message goes nowhere. It reloads those tabs and leaves this behind instead,
 * and the freshly injected script picks it up.
 */
export async function setPendingOnboarding(value: boolean): Promise<void> {
    return new Promise((resolve, reject) => {
        try {
            chrome.storage.local.set({ [PENDING_ONBOARDING_KEY]: value }, () => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                    return;
                }
                resolve();
            });
        } catch (e) {
            reject(e);
        }
    });
}

/**
 * Read the flag and clear it in the same breath.
 *
 * Clearing on read is what stops the tour opening in all four of someone's
 * Gmail tabs at once. It is not atomic across tabs, but the write lands well
 * before a second tab finishes loading Gmail, and showing it twice is a far
 * smaller failure than never clearing it.
 *
 * Never rejects: onboarding must not be able to break start-up.
 */
export async function takePendingOnboarding(): Promise<boolean> {
    return new Promise((resolve) => {
        try {
            chrome.storage.local.get([PENDING_ONBOARDING_KEY], (items) => {
                if (chrome.runtime.lastError || !items || items[PENDING_ONBOARDING_KEY] !== true) {
                    resolve(false);
                    return;
                }
                try {
                    chrome.storage.local.remove(PENDING_ONBOARDING_KEY, () => {
                        void chrome.runtime.lastError; // best-effort clear
                        resolve(true);
                    });
                } catch {
                    resolve(true);
                }
            });
        } catch {
            resolve(false);
        }
    });
}

/**
 * Seeds the global theme once, on first run after the per-account → global
 * migration. Priority: existing global value (no-op) > legacy sync 'theme'
 * key (from old welcome page) > the account's own per-account theme.
 * The legacy sync 'theme' key is cleaned up if consumed.
 */
export async function migrateThemeToGlobalIfNeeded(accountId: string): Promise<void> {
    const alreadySet = await new Promise<boolean>((resolve) => {
        try {
            chrome.storage.local.get([GLOBAL_THEME_KEY], (items) => {
                resolve(items[GLOBAL_THEME_KEY] !== undefined);
            });
        } catch {
            resolve(false);
        }
    });
    if (alreadySet) return;

    // Legacy welcome-page theme lived under a global sync 'theme' key.
    const legacyTheme = await new Promise<Theme | null>((resolve) => {
        try {
            chrome.storage.sync.get(['theme'], (items) => {
                const t = items.theme;
                resolve(t === 'light' || t === 'dark' || t === 'system' ? t : null);
            });
        } catch {
            resolve(null);
        }
    });

    if (legacyTheme) {
        await setGlobalTheme(legacyTheme);
        try {
            // Rejects rather than throws when the context has gone, so the
            // catch below never saw it. The stale key is harmless either way.
            ignoreChromeError(chrome.storage.sync.remove('theme'));
        } catch {
            /* best-effort cleanup */
        }
        return;
    }

    // Otherwise seed from the current account's per-account theme.
    try {
        const settings = await getSettings(accountId);
        await setGlobalTheme(settings.theme);
    } catch {
        await setGlobalTheme('light');
    }
}

// ---------------------------------------------------------------------------
// Legacy Migration
// ---------------------------------------------------------------------------

/**
 * Helper to migrate legacy global settings to a specific account.
 * Should be called once when an account is first detected if no settings exist for it.
 */
export async function migrateLegacySettingsIfNeeded(accountId: string): Promise<void> {
    const key = getAccountKey(accountId);

    // Check if account settings already exist
    const exists = await new Promise<boolean>((resolve) => {
        chrome.storage.sync.get(key, (items) => {
            resolve(!!items[key]);
        });
    });

    if (exists) return;

    // Check for legacy top-level settings
    await new Promise<void>((resolve, reject) => {
        chrome.storage.sync.get(['tabs', 'labels', 'theme', 'showUnreadCount'], async (items) => {
            try {
                // If we have legacy data (tabs or labels)
                if (items.tabs || items.labels) {
                    console.log(`Migrating legacy settings to account: ${accountId}`);

                    let tabs: Tab[] = items.tabs || [];

                    // Handle very old 'labels' format migration if needed
                    if (items.labels && (!tabs || tabs.length === 0)) {
                        tabs = (items.labels as LegacyTabLabel[]).map((l) => ({
                            id: l.id,
                            title: l.displayName || l.name,
                            type: 'label',
                            value: l.name,
                        }));
                    }

                    const newSettings: Settings = {
                        tabs: tabs,
                        rules: [],
                        theme: items.theme || 'light',
                        showUnreadCount: items.showUnreadCount !== undefined ? items.showUnreadCount : true,
                    };

                    await saveSettings(accountId, newSettings);
                }
                resolve();
            } catch (e) {
                reject(e);
            }
        });
    });
}
