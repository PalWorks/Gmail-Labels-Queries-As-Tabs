/**
 * options.ts
 *
 * Entry point for the Options page.
 * Handles hash-based routing between sections, loads settings
 * from chrome.storage.sync, and wires up UI controls.
 *
 * Settings section mirrors the Gmail modal:
 * Theme buttons, Add Tab (smart detection), Draggable tab list,
 * Show Unread Count, Export/Import, Uninstall, Connected account.
 */

import {
    getSettings,
    saveSettings,
    savePreferences,
    upsertRule,
    accountStorageKey,
    getAllAccounts,
    addTab,
    getGlobalTheme,
    setGlobalTheme,
    GLOBAL_THEME_STORAGE_KEY,
    Tab,
    Rule,
    Settings,
    Theme,
} from './utils/storage';
import {
    buildExportPayload,
    generateExportFilename,
    validateImportData,
    triggerDownload,
} from './utils/importExport';
import { escapeHtml } from './utils/tabListRenderer';
import { generateAppsScript, tabToGmailLabel } from './modules/rules';
import { RULE_TEMPLATES, RULE_TEMPLATES_ENABLED, RuleTemplate, applyRuleTemplate } from './modules/ruleTemplates';
import { setAppSettings, setUserEmail } from './modules/state';
import { DETECTED_GMAIL_THEME_KEY, ResolvedTheme } from './modules/theme';
import {
    FeedbackCategory,
    MAX_MESSAGE_CHARS,
    buildDiagnostics,
    submitFeedback,
    validateFeedback,
} from './modules/feedback';
import { renderManagedTabList, parseTabInput, isUrlLikeInput, deriveTitleFromUrl } from './modules/tabManager';

// ---------------------------------------------------------------------------
// Navigation & Routing
// ---------------------------------------------------------------------------

const SECTIONS = ['settings', 'rules', 'guide', 'privacy', 'contact', 'logs'] as const;
type SectionId = (typeof SECTIONS)[number];
// The account chip stays on every section: which account you are editing is
// context you need on the Rules page as much as on Settings, and losing it
// when you navigate is how people edit the wrong account.

function navigateToSection(sectionId: SectionId): void {
    document.querySelectorAll('.nav-item').forEach((item) => {
        item.classList.toggle('active', item.getAttribute('data-section') === sectionId);
    });
    SECTIONS.forEach((id) => {
        const el = document.getElementById(`section-${id}`);
        if (el) el.classList.toggle('hidden', id !== sectionId);
    });

}

function handleHashChange(): void {
    const hash = window.location.hash.replace('#', '') as SectionId;
    navigateToSection(SECTIONS.includes(hash) ? hash : 'settings');
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let currentAccountId: string | null = null;
let currentSettings: Settings | null = null;
// Theme is browser-wide (shared by all accounts), not part of currentSettings.
let currentTheme: Theme = 'light';
// Count only, for opt-in feedback diagnostics; addresses never leave the page.
let knownAccountCount = 0;

// ---------------------------------------------------------------------------
// Settings Loading
// ---------------------------------------------------------------------------

async function loadSettings(): Promise<void> {
    try {
        const accounts = await getAllAccounts();

        if (accounts.length === 0) {
            populateAccountSelector([]);
            showEmptyState(
                'settings-tab-list',
                'No account yet. Open Gmail in a tab and the extension will set this up automatically.'
            );
            return;
        }

        // Default to first account, or keep current selection if already set
        if (!currentAccountId || !accounts.includes(currentAccountId)) {
            currentAccountId = accounts[0];
        }

        knownAccountCount = accounts.length;
        populateAccountSelector(accounts);

        // Bridge local state into the shared state module so shared
        // drag-and-drop handlers can access the account ID.
        setUserEmail(currentAccountId);

        currentSettings = await getSettings(currentAccountId);
        setAppSettings(currentSettings);

        currentTheme = await getGlobalTheme();
        await loadDetectedGmailTheme();
        renderThemeButtons(currentTheme);
        applyThemeToPage(currentTheme);
        renderSettingsTabList(currentSettings.tabs);
        renderPreferences(currentSettings);
        renderRulesList(currentSettings.tabs, currentSettings.rules);
    } catch (e) {
        console.error('Options: Failed to load settings', e);
        showEmptyState('settings-tab-list', 'Failed to load settings. Please try again.');
    }
}

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------

function renderThemeButtons(activeTheme: string): void {
    const group = document.getElementById('settings-theme-group');
    if (!group) return;

    group.querySelectorAll('.theme-btn').forEach((btn) => {
        btn.classList.toggle('active', btn.getAttribute('data-theme') === activeTheme);
    });
}

// Last theme Gmail reported for this profile. The options page has no Gmail
// DOM to sample, so in 'system' mode it mirrors what the content script saw
// rather than the OS, which can disagree with the user's Gmail theme.
let detectedGmailTheme: ResolvedTheme | null = null;

/** Load the theme Gmail last reported. Safe when storage is unavailable. */
async function loadDetectedGmailTheme(): Promise<void> {
    detectedGmailTheme = await new Promise<ResolvedTheme | null>((resolve) => {
        try {
            chrome.storage.local.get([DETECTED_GMAIL_THEME_KEY], (items) => {
                if (chrome.runtime.lastError) {
                    resolve(null);
                    return;
                }
                const t = items[DETECTED_GMAIL_THEME_KEY];
                resolve(t === 'light' || t === 'dark' ? t : null);
            });
        } catch {
            resolve(null);
        }
    });
}

/** Resolve 'system' for this page: Gmail's theme first, OS only as fallback. */
function resolveSystemThemeForPage(): ResolvedTheme {
    if (detectedGmailTheme) return detectedGmailTheme;
    try {
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    } catch {
        return 'light';
    }
}

function applyThemeToPage(theme: string): void {
    document.body.classList.remove('theme-light', 'theme-dark');
    const resolved = theme === 'light' || theme === 'dark' ? theme : resolveSystemThemeForPage();
    document.body.classList.add(resolved === 'dark' ? 'theme-dark' : 'theme-light');
    updateSidebarThemeIcon(theme);
}

function setupThemeButtons(): void {
    const group = document.getElementById('settings-theme-group');
    if (!group) return;

    group.addEventListener('click', async (e) => {
        const btn = (e.target as HTMLElement).closest('.theme-btn') as HTMLElement | null;
        if (!btn) return;
        const theme = btn.getAttribute('data-theme') as Theme;
        if (!theme) return;

        await setGlobalTheme(theme);
        currentTheme = theme;
        renderThemeButtons(theme);
        applyThemeToPage(theme);
    });
}

// Sidebar theme toggle
function setupSidebarThemeToggle(): void {
    const toggleBtn = document.getElementById('sidebar-theme-toggle');
    if (!toggleBtn) return;

    toggleBtn.addEventListener('click', async () => {
        const next: Theme = currentTheme === 'dark' ? 'light' : 'dark';

        await setGlobalTheme(next);
        currentTheme = next;
        renderThemeButtons(next);
        applyThemeToPage(next);
    });
}

/**
 * Apply the stored theme before account data loads, so the page never flashes
 * the wrong mode (and is themed at all when no account exists yet).
 */
async function applyStoredThemeEarly(): Promise<void> {
    currentTheme = await getGlobalTheme();
    await loadDetectedGmailTheme();
    renderThemeButtons(currentTheme);
    applyThemeToPage(currentTheme);
}

/**
 * Stamp the sidebar version from the manifest. Hardcoding it here meant the
 * page kept claiming an old version after every release bump.
 */
function renderVersionTag(): void {
    const el = document.getElementById('version-tag');
    if (!el) return;
    try {
        el.textContent = 'v' + chrome.runtime.getManifest().version;
    } catch {
        el.textContent = '';
    }
}

function updateSidebarThemeIcon(theme: string): void {
    const moon = document.getElementById('theme-icon-moon');
    const sun = document.getElementById('theme-icon-sun');
    if (!moon || !sun) return;

    if (theme === 'light') {
        moon.classList.add('hidden');
        sun.classList.remove('hidden');
    } else {
        moon.classList.remove('hidden');
        sun.classList.add('hidden');
    }
}

// ---------------------------------------------------------------------------
// Add Tab (Smart Detection)
// ---------------------------------------------------------------------------

function setupAddTab(): void {
    const input = document.getElementById('settings-add-input') as HTMLInputElement | null;
    const titleInput = document.getElementById('settings-add-title') as HTMLInputElement | null;
    const titleGroup = document.getElementById('settings-add-title-group');
    const addBtn = document.getElementById('settings-add-btn') as HTMLButtonElement | null;
    const errorEl = document.getElementById('settings-add-error');

    if (!input || !titleInput || !titleGroup || !addBtn || !errorEl) return;

    input.addEventListener('input', () => {
        const value = input.value.trim();

        if (isUrlLikeInput(value)) {
            titleGroup.classList.remove('hidden');
            if (!titleInput.value) {
                const derived = deriveTitleFromUrl(value);
                if (derived) titleInput.value = derived;
            }
        } else if (!titleInput.value) {
            titleGroup.classList.add('hidden');
        }

        addBtn.disabled = value === '';
        errorEl.classList.add('hidden');
    });

    addBtn.addEventListener('click', async () => {
        if (!currentAccountId) return;
        const raw = input.value.trim();
        if (!raw) return;

        const { type, value } = parseTabInput(raw);
        const title = type === 'hash' ? titleInput.value.trim() || value : value;

        try {
            await addTab(currentAccountId, title, value, type);
            currentSettings = await getSettings(currentAccountId);
            renderSettingsTabList(currentSettings.tabs);
            renderRulesList(currentSettings.tabs, currentSettings.rules);

            // Clear inputs
            input.value = '';
            titleInput.value = '';
            titleGroup.classList.add('hidden');
            addBtn.disabled = true;
        } catch (e: any) {
            errorEl.textContent = e.message || 'Failed to add tab';
            errorEl.classList.remove('hidden');
        }
    });
}

// ---------------------------------------------------------------------------
// Settings Tab List (Draggable)
// ---------------------------------------------------------------------------

function renderSettingsTabList(tabs: Tab[]): void {
    const list = document.getElementById('settings-tab-list');
    if (!list) return;

    renderManagedTabList({
        listEl: list,
        tabs,
        getAccountId: () => currentAccountId,
        enableColorPicker: true,
        // The options page has no Gmail tab bar to re-render.
        renderTabBar: () => {},
        reRender: async () => {
            if (!currentAccountId) return;
            currentSettings = await getSettings(currentAccountId);
            setAppSettings(currentSettings);
            renderSettingsTabList(currentSettings.tabs);
            renderRulesList(currentSettings.tabs, currentSettings.rules);
        },
    });
}

// ---------------------------------------------------------------------------
// Preferences
// ---------------------------------------------------------------------------

function setupPreferences(): void {
    const unreadCheck = document.getElementById('pref-unread') as HTMLInputElement | null;
    if (!unreadCheck) return;

    unreadCheck.addEventListener('change', async () => {
        if (!currentAccountId) return;
        const next = await savePreferences(currentAccountId, { showUnreadCount: unreadCheck.checked });
        currentSettings = next;
    });
}

function renderPreferences(settings: Settings): void {
    const unreadCheck = document.getElementById('pref-unread') as HTMLInputElement | null;
    if (unreadCheck) {
        unreadCheck.checked = settings.showUnreadCount;
    }
}

// ---------------------------------------------------------------------------
// Export / Import / Uninstall
// ---------------------------------------------------------------------------

function setupDataControls(): void {
    // Export
    document.getElementById('settings-export-btn')?.addEventListener('click', async () => {
        if (!currentAccountId || !currentSettings) return;

        const payload = buildExportPayload(
            currentAccountId,
            currentSettings.tabs,
            currentSettings.rules,
            await getGlobalTheme()
        );
        const json = JSON.stringify(payload, null, 2);
        const filename = generateExportFilename(currentAccountId);

        const result = await triggerDownload(filename, json);
        if (result.success) {
            const btn = document.getElementById('settings-export-btn');
            if (btn) {
                btn.textContent = '\u2705 Exported!';
                setTimeout(() => {
                    btn.textContent = 'Export Config';
                }, 2000);
            }
        }
    });

    // Import
    document.getElementById('settings-import-btn')?.addEventListener('click', () => {
        showImportDialog();
    });

    // Uninstall
    document.getElementById('settings-uninstall-btn')?.addEventListener('click', () => {
        if (
            confirm(
                'Are you sure you want to uninstall this extension? Export your settings first if you want to keep them.'
            )
        ) {
            chrome.runtime.sendMessage({ action: 'UNINSTALL_SELF' });
        }
    });
}

function showImportDialog(): void {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.json';

    fileInput.addEventListener('change', (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (evt) => {
            try {
                const data = JSON.parse(evt.target?.result as string);
                validateImportData(data);

                if (data.email && currentAccountId && data.email !== currentAccountId) {
                    alert(
                        `This configuration belongs to "${data.email}" but you are signed in as "${currentAccountId}". Import rejected.`
                    );
                    return;
                }

                const ruleCount = Array.isArray(data.rules) ? data.rules.length : 0;
                const summary =
                    `Import ${data.tabs.length} tabs` +
                    (ruleCount ? ` and ${ruleCount} rules` : '') +
                    '? This will replace your current tabs and rules.';

                if (confirm(summary)) {
                    const patch: Partial<Settings> = { tabs: data.tabs };
                    if (Array.isArray(data.rules)) patch.rules = data.rules;
                    await saveSettings(currentAccountId!, patch);

                    if (data.theme === 'light' || data.theme === 'dark' || data.theme === 'system') {
                        await setGlobalTheme(data.theme);
                        currentTheme = data.theme;
                        renderThemeButtons(currentTheme);
                        applyThemeToPage(currentTheme);
                    }

                    currentSettings = await getSettings(currentAccountId!);
                    renderSettingsTabList(currentSettings.tabs);
                    renderRulesList(currentSettings.tabs, currentSettings.rules);

                    const btn = document.getElementById('settings-import-btn');
                    if (btn) {
                        btn.textContent = '\u2705 Imported!';
                        setTimeout(() => {
                            btn.textContent = 'Import Config';
                        }, 2000);
                    }
                }
            } catch (err: any) {
                alert('Error importing: ' + err.message);
            }
        };
        reader.readAsText(file);
    });

    fileInput.click();
}

// ---------------------------------------------------------------------------
// Rule Templates (one-click starter presets, feature-flagged)
// ---------------------------------------------------------------------------

function renderRuleTemplates(): void {
    const card = document.getElementById('rule-templates-card');
    const grid = document.getElementById('rule-templates-grid');
    if (!card || !grid) return;

    // Feature flag off → keep the card hidden and render nothing.
    if (!RULE_TEMPLATES_ENABLED) {
        card.classList.add('hidden');
        return;
    }
    card.classList.remove('hidden');

    grid.innerHTML = RULE_TEMPLATES.map(
        (t) => `
        <div class="rule-template-card" data-template-id="${escapeHtml(t.id)}">
            <span class="rt-title">${escapeHtml(t.icon)} ${escapeHtml(t.name)}</span>
            <span class="rt-desc">${escapeHtml(t.description)}</span>
            <span class="rt-meta">label:${escapeHtml(t.labelName)} · ${escapeHtml(t.action)} · ${escapeHtml(String(t.daysOld))}d</span>
            <button class="btn-secondary rt-apply" data-template-id="${escapeHtml(t.id)}">Apply</button>
        </div>
    `
    ).join('');

    grid.querySelectorAll<HTMLButtonElement>('.rt-apply').forEach((btn) => {
        btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-template-id');
            const template = RULE_TEMPLATES.find((t) => t.id === id);
            if (template) applyTemplate(template, btn);
        });
    });
}

async function applyTemplate(template: RuleTemplate, btn: HTMLButtonElement): Promise<void> {
    if (!currentAccountId) return;
    try {
        await applyRuleTemplate(currentAccountId, template);
        currentSettings = await getSettings(currentAccountId);
        setAppSettings(currentSettings);
        renderSettingsTabList(currentSettings.tabs);
        renderRulesList(currentSettings.tabs, currentSettings.rules);

        btn.textContent = '✅ Applied';
        btn.classList.add('applied');
        setTimeout(() => {
            btn.textContent = 'Apply';
            btn.classList.remove('applied');
        }, 2000);
    } catch (e) {
        console.error('Options: Failed to apply template', e);
        btn.textContent = '⚠️ Failed';
        setTimeout(() => {
            btn.textContent = 'Apply';
        }, 2000);
    }
}

// ---------------------------------------------------------------------------
// Automation Rules
// ---------------------------------------------------------------------------

function renderRulesList(tabs: Tab[], rules: Rule[]): void {
    const container = document.getElementById('rules-list');
    if (!container) return;

    if (tabs.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">\ud83d\udccb</div>
                <p>No tabs configured yet. Go to Settings and add tabs first.</p>
            </div>
        `;
        return;
    }

    // Automation rules run as Gmail "label:" searches, so they only apply to
    // tabs that resolve to a real label (label tabs and #label/ hash tabs).
    // System/search hash tabs (#inbox, #starred, #search/...) are excluded.
    const ruleTabs = tabs.filter((tab) => tabToGmailLabel(tab) !== null);

    if (ruleTabs.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">\ud83c\udff7\ufe0f</div>
                <p>No label tabs yet. Automation rules apply to Gmail labels. Add a label tab in Settings to configure a rule.</p>
            </div>
        `;
        return;
    }

    const ruleMap = new Map(rules.map((r) => [r.tabId, r]));

    container.innerHTML = `
        <div class="rule-row rule-row-header">
            <span>Tab</span>
            <span>Action</span>
            <span>After (days)</span>
            <span>Enabled</span>
        </div>
        ${ruleTabs
            .map((tab) => {
                const rule = ruleMap.get(tab.id);
                const action = rule?.action || 'trash';
                const daysOld = rule?.daysOld ?? 30;
                const enabled = rule?.enabled ?? false;
                const targetLabel = rule?.targetLabel || '';

                return `
                <div class="rule-row" data-tab-id="${escapeHtml(tab.id)}">
                    <span class="rule-tab-name">${escapeHtml(tab.title)}</span>
                    <select class="input-select rule-action" data-tab-id="${escapeHtml(tab.id)}">
                        <option value="trash" ${action === 'trash' ? 'selected' : ''}>\ud83d\uddd1 Trash</option>
                        <option value="archive" ${action === 'archive' ? 'selected' : ''}>\ud83d\udce6 Archive</option>
                        <option value="markRead" ${action === 'markRead' ? 'selected' : ''}>✉️ Mark Read</option>
                        <option value="moveToLabel" ${action === 'moveToLabel' ? 'selected' : ''}>\ud83c\udff7 Move to Label</option>
                    </select>
                    <input type="number" class="input-number rule-days" data-tab-id="${escapeHtml(tab.id)}" value="${escapeHtml(String(daysOld))}" min="1" max="365">
                    <label class="toggle-switch">
                        <input type="checkbox" class="rule-enabled" data-tab-id="${escapeHtml(tab.id)}" ${enabled ? 'checked' : ''}>
                        <span class="toggle-slider"></span>
                    </label>
                </div>
                ${action === 'moveToLabel'
                        ? `
                    <div class="rule-target-row" data-tab-id="${escapeHtml(tab.id)}-target">
                        <span class="label">\u21b3 Target label:</span>
                        <input type="text" class="input-text rule-target-label" data-tab-id="${escapeHtml(tab.id)}" value="${escapeHtml(targetLabel)}" placeholder="e.g. Archive/Newsletters">
                    </div>
                `
                        : ''
                    }
            `;
            })
            .join('')}
    `;

    // Remove prior listener to prevent duplicates on re-render
    container.removeEventListener('change', handleRuleChange);
    container.addEventListener('change', handleRuleChange);
}

/**
 * Debounce window for the free-text and numeric rule fields.
 *
 * `change` fires on commit rather than per keystroke, so the write rate is
 * already low, but a number input's spinner can be clicked rapidly and
 * chrome.storage.sync allows only 120 writes a minute. Coalescing costs
 * nothing and removes the ceiling as a concern.
 */
const RULE_WRITE_DEBOUNCE_MS = 250;

interface PendingWrite {
    timer: ReturnType<typeof setTimeout>;
    run: () => Promise<void>;
}
const pendingRuleWrites = new Map<string, PendingWrite>();

/**
 * Commit anything still sitting in the debounce window.
 *
 * Called when the page is hidden, because a tab closed 100ms after the last
 * edit would otherwise drop it, and losing a setting to save a storage write
 * is a bad trade.
 */
function flushPendingRuleWrites(): void {
    const queued = Array.from(pendingRuleWrites.values());
    pendingRuleWrites.clear();
    queued.forEach(({ timer, run }) => {
        clearTimeout(timer);
        void run().catch((err) => console.error('Options: failed to save rule', err));
    });
}

async function handleRuleChange(e: Event): Promise<void> {
    const target = e.target as HTMLElement;
    const tabId = target.getAttribute('data-tab-id');
    if (!tabId || !currentAccountId) return;

    const updates: Partial<Rule> = {};
    let redrawRow = false;

    if (target.classList.contains('rule-action')) {
        updates.action = (target as HTMLSelectElement).value as Rule['action'];
        // Switching action shows or hides the target-label input.
        redrawRow = true;
    }
    if (target.classList.contains('rule-days')) {
        updates.daysOld = parseInt((target as HTMLInputElement).value, 10) || 30;
    }
    if (target.classList.contains('rule-enabled')) {
        updates.enabled = (target as HTMLInputElement).checked;
    }
    if (target.classList.contains('rule-target-label')) {
        updates.targetLabel = (target as HTMLInputElement).value;
    }
    if (Object.keys(updates).length === 0) return;

    const write = async (): Promise<void> => {
        const accountId = currentAccountId;
        if (!accountId) return;
        // Read fresh rather than trusting the rendered state: another surface
        // may have changed this rule since the page last drew it.
        const settings = await getSettings(accountId);
        const existing = settings.rules.find((r) => r.tabId === tabId);
        const base: Rule = existing ?? { tabId, action: 'trash', daysOld: 30, enabled: false };

        const next = await upsertRule(accountId, { ...base, ...updates, tabId });
        currentSettings = next;
        if (redrawRow) renderRulesList(next.tabs, next.rules);
    };

    const debounced = target.classList.contains('rule-days') || target.classList.contains('rule-target-label');
    if (!debounced) {
        await write();
        return;
    }

    const key = `${tabId}:${target.className}`;
    const queued = pendingRuleWrites.get(key);
    if (queued) clearTimeout(queued.timer);
    pendingRuleWrites.set(key, {
        run: write,
        timer: setTimeout(() => {
            pendingRuleWrites.delete(key);
            void write().catch((err) => console.error('Options: failed to save rule', err));
        }, RULE_WRITE_DEBOUNCE_MS),
    });
}

// ---------------------------------------------------------------------------
// Script Generation
// ---------------------------------------------------------------------------

function setupScriptGeneration(): void {
    const btn = document.getElementById('generate-script-btn');
    const sheetUrlInput = document.getElementById('sheet-url') as HTMLInputElement | null;

    if (!btn) return;

    btn.addEventListener('click', async () => {
        if (!currentSettings) return;

        const sheetUrl = sheetUrlInput?.value?.trim() || undefined;
        const enabledRules = currentSettings.rules.filter((r) => r.enabled);

        if (enabledRules.length === 0) {
            btn.textContent = '\u26a0\ufe0f No enabled rules. Enable at least one!';
            btn.classList.remove('success');
            setTimeout(() => {
                btn.textContent = '\ud83d\ude80 Generate & Copy Script';
            }, 3000);
            return;
        }

        const script = generateAppsScript(currentSettings.tabs, currentSettings.rules, currentAccountId!, sheetUrl);

        try {
            await navigator.clipboard.writeText(script);
            btn.textContent = '\u2705 Copied to clipboard!';
            btn.classList.add('success');
        } catch {
            btn.textContent = '\u26a0\ufe0f Copy failed. Please try again.';
        }

        setTimeout(() => {
            btn.textContent = '\ud83d\ude80 Generate & Copy Script';
            btn.classList.remove('success');
        }, 3000);
    });

    const guideLink = document.getElementById('view-guide-link');
    if (guideLink) {
        guideLink.addEventListener('click', (e) => {
            e.preventDefault();
            window.location.hash = '#guide';
        });
    }
}

// ---------------------------------------------------------------------------
// Account Selector
// ---------------------------------------------------------------------------

function populateAccountSelector(accounts: string[]): void {
    const select = document.getElementById('account-select') as HTMLSelectElement | null;
    const bar = document.getElementById('account-selector-bar');
    if (!select) return;

    select.innerHTML = '';

    // No account yet: say so in the chip itself rather than leaving an empty
    // dropdown that looks broken.
    if (accounts.length === 0) {
        const option = document.createElement('option');
        option.textContent = 'No account yet — open Gmail';
        select.appendChild(option);
        select.disabled = true;
        bar?.classList.add('is-empty');
        return;
    }

    select.disabled = false;
    bar?.classList.remove('is-empty');
    bar?.classList.toggle('is-single', accounts.length === 1);

    accounts.forEach((email) => {
        const option = document.createElement('option');
        option.value = email;
        option.textContent = email;
        if (email === currentAccountId) option.selected = true;
        select.appendChild(option);
    });
}

function setupAccountSwitcher(): void {
    const select = document.getElementById('account-select') as HTMLSelectElement | null;
    if (!select) return;

    select.addEventListener('change', async () => {
        const newAccountId = select.value;
        if (!newAccountId || newAccountId === currentAccountId) return;

        currentAccountId = newAccountId;
        setUserEmail(currentAccountId);

        currentSettings = await getSettings(currentAccountId);
        setAppSettings(currentSettings);

        // Theme is global, so it stays put when switching accounts.
        renderSettingsTabList(currentSettings.tabs);
        renderPreferences(currentSettings);
        renderRulesList(currentSettings.tabs, currentSettings.rules);
    });
}

// ---------------------------------------------------------------------------
// Feedback form (Support & Feedback)
// ---------------------------------------------------------------------------

function setStatus(el: HTMLElement, message: string, kind: 'error' | 'success' | 'none'): void {
    el.textContent = message;
    el.classList.remove('is-error', 'is-success');
    if (kind !== 'none') el.classList.add(kind === 'error' ? 'is-error' : 'is-success');
}

function setupFeedbackForm(): void {
    const form = document.getElementById('feedback-form') as HTMLFormElement | null;
    if (!form) return;

    const categoryEl = document.getElementById('feedback-category') as HTMLSelectElement;
    const messageEl = document.getElementById('feedback-message') as HTMLTextAreaElement;
    const emailEl = document.getElementById('feedback-email') as HTMLInputElement;
    const diagnosticsEl = document.getElementById('feedback-diagnostics') as HTMLInputElement;
    const honeypotEl = document.getElementById('feedback-website') as HTMLInputElement;
    const submitBtn = document.getElementById('feedback-submit') as HTMLButtonElement;
    const statusEl = document.getElementById('feedback-status') as HTMLElement;
    const countEl = document.getElementById('feedback-count') as HTMLElement;

    messageEl.addEventListener('input', () => {
        countEl.textContent = `${messageEl.value.length} / ${MAX_MESSAGE_CHARS}`;
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        // A bot filled the honeypot: accept visually, send nothing.
        if (honeypotEl.value.trim()) {
            setStatus(statusEl, 'Thanks, your feedback is on its way.', 'success');
            form.reset();
            return;
        }

        const input = {
            category: categoryEl.value as FeedbackCategory,
            message: messageEl.value,
            replyTo: emailEl.value,
        };

        const problem = validateFeedback(input);
        if (problem) {
            setStatus(statusEl, problem, 'error');
            (problem.includes('email') ? emailEl : messageEl).focus();
            return;
        }

        submitBtn.disabled = true;
        setStatus(statusEl, 'Sending…', 'none');

        const result = await submitFeedback({
            ...input,
            diagnostics: diagnosticsEl.checked
                ? buildDiagnostics({
                      tabCount: currentSettings?.tabs.length ?? 0,
                      ruleCount: currentSettings?.rules.length ?? 0,
                      accountCount: knownAccountCount,
                  })
                : undefined,
        });

        submitBtn.disabled = false;

        if (result.ok) {
            setStatus(statusEl, 'Thanks. Your feedback is on its way.', 'success');
            messageEl.value = '';
            countEl.textContent = `0 / ${MAX_MESSAGE_CHARS}`;
        } else {
            setStatus(statusEl, result.error, 'error');
        }
    });
}

// ---------------------------------------------------------------------------
// Settings Sync (react to edits made in a Gmail tab while this page is open)
// ---------------------------------------------------------------------------

interface FocusSnapshot {
    selector: string;
    start: number | null;
    end: number | null;
}

/** Escape a value for use inside an attribute selector. */
function escapeSelectorValue(value: string): string {
    const api = (globalThis as { CSS?: { escape?: (v: string) => string } }).CSS;
    if (api && typeof api.escape === 'function') return api.escape(value);
    return value.replace(/["\\]/g, '\\$&');
}

/**
 * Remember enough about the focused control to find it again after a
 * re-render. Without this, a change arriving from a Gmail tab would yank the
 * caret out of whatever the user is typing here.
 */
function captureFocus(): FocusSnapshot | null {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return null;
    const tabId = el.getAttribute('data-tab-id');
    if (!tabId) return null;
    const cls = Array.from(el.classList).find((c) => c.startsWith('rule-') || c.startsWith('tab-'));
    if (!cls) return null;

    let start: number | null = null;
    let end: number | null = null;
    try {
        // Throws on input types that have no text selection (number, checkbox).
        const input = el as HTMLInputElement;
        start = input.selectionStart;
        end = input.selectionEnd;
    } catch {
        /* not a text input */
    }

    return { selector: `.${cls}[data-tab-id="${escapeSelectorValue(tabId)}"]`, start, end };
}

function restoreFocus(snapshot: FocusSnapshot | null): void {
    if (!snapshot) return;
    const el = document.querySelector<HTMLElement>(snapshot.selector);
    if (!el) return;
    el.focus();
    if (snapshot.start === null) return;
    try {
        (el as HTMLInputElement).setSelectionRange(snapshot.start, snapshot.end ?? snapshot.start);
    } catch {
        /* not a text input */
    }
}

/** Re-read this account's settings and redraw everything that shows them. */
async function reloadCurrentAccount(): Promise<void> {
    if (!currentAccountId) return;
    const snapshot = captureFocus();
    currentSettings = await getSettings(currentAccountId);
    setAppSettings(currentSettings);
    renderSettingsTabList(currentSettings.tabs);
    renderPreferences(currentSettings);
    renderRulesList(currentSettings.tabs, currentSettings.rules);
    restoreFocus(snapshot);
}

/**
 * Follow changes another surface makes to the account being edited.
 *
 * Until v1.5 this page listened only to storage.local, for the theme. Its
 * in-memory settings therefore went stale the moment anything changed in a
 * Gmail tab and stayed stale indefinitely, which is what turned a race into
 * real data loss: the page would render five tabs, Gmail would add a sixth,
 * and a drag here would write the five-tab array straight over the top.
 * Ordering by id fixed the write; this fixes the staleness that caused it.
 */
function setupSettingsSync(): void {
    if (!chrome.storage?.onChanged) return;
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'sync' || !currentAccountId) return;

        const change = changes[accountStorageKey(currentAccountId)];
        if (!change) {
            // Some other account was created or edited: the selector should
            // show a newly registered account without a manual reload.
            if (Object.keys(changes).some((k) => k.startsWith('account_'))) {
                void refreshAccountListIfChanged();
            }
            return;
        }

        // Skip our own writes. `rev` is bumped on every successful write, so
        // storage already matching what we hold means there is nothing to do.
        const incomingRev = (change.newValue as Settings | undefined)?.rev;
        if (typeof incomingRev === 'number' && incomingRev === currentSettings?.rev) return;

        void reloadCurrentAccount().catch((e) => console.error('Options: failed to sync settings', e));
    });
}

/** Repopulate the account selector when the set of accounts actually changed. */
async function refreshAccountListIfChanged(): Promise<void> {
    try {
        const accounts = await getAllAccounts();
        if (accounts.length === knownAccountCount) return;
        knownAccountCount = accounts.length;
        populateAccountSelector(accounts);
    } catch (e) {
        console.warn('Options: could not refresh the account list', e);
    }
}

// ---------------------------------------------------------------------------
// Theme Sync (react to global theme changes made elsewhere)
// ---------------------------------------------------------------------------

function setupThemeSync(): void {
    if (!chrome.storage?.onChanged) return;
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;

        // Gmail reported a different rendered theme: follow it while the
        // preference is 'system'.
        if (changes[DETECTED_GMAIL_THEME_KEY]) {
            const d = changes[DETECTED_GMAIL_THEME_KEY].newValue;
            detectedGmailTheme = d === 'light' || d === 'dark' ? d : null;
            if (currentTheme === 'system') applyThemeToPage('system');
        }

        if (!changes[GLOBAL_THEME_STORAGE_KEY]) return;
        const t = changes[GLOBAL_THEME_STORAGE_KEY].newValue;
        if (t === 'light' || t === 'dark' || t === 'system') {
            currentTheme = t;
            renderThemeButtons(t);
            applyThemeToPage(t);
        }
    });
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function showEmptyState(containerId: string, message: string): void {
    const el = document.getElementById(containerId);
    if (el) {
        el.innerHTML = `<li class="empty-state"><p>${escapeHtml(message)}</p></li>`;
    }
}

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
    // Hash-based routing
    window.addEventListener('hashchange', handleHashChange);
    handleHashChange();

    // Nav clicks
    document.querySelectorAll('.nav-item').forEach((item) => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const section = (item as HTMLElement).getAttribute('data-section');
            if (section) window.location.hash = `#${section}`;
        });
    });

    // Settings controls
    setupThemeButtons();
    setupSidebarThemeToggle();
    setupAccountSwitcher();
    setupThemeSync();
    setupSettingsSync();
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') flushPendingRuleWrites();
    });
    setupPreferences();
    setupAddTab();
    setupDataControls();
    setupFeedbackForm();

    // Page chrome that must render even with no Gmail account set up yet.
    renderVersionTag();
    applyStoredThemeEarly();

    // Load data
    renderRuleTemplates();
    loadSettings();
    setupScriptGeneration();
});
