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
    getAllAccounts,
    addTab,
    removeTab,
    updateTabOrder,
    Tab,
    Rule,
    Settings,
} from './utils/storage';
import {
    buildExportPayload,
    generateExportFilename,
    validateImportData,
    triggerDownload,
} from './utils/importExport';
import { renderTabListItems, escapeHtml } from './utils/tabListRenderer';
import { generateAppsScript } from './modules/rules';
import { setAppSettings, setUserEmail } from './modules/state';
import { createModalDragHandlers } from './modules/dragdrop';

// ---------------------------------------------------------------------------
// Navigation & Routing
// ---------------------------------------------------------------------------

const SECTIONS = ['settings', 'rules', 'guide', 'privacy', 'contact', 'logs'] as const;
type SectionId = (typeof SECTIONS)[number];

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

// ---------------------------------------------------------------------------
// Settings Loading
// ---------------------------------------------------------------------------

async function loadSettings(): Promise<void> {
    try {
        const accounts = await getAllAccounts();
        currentAccountId = accounts[0] || null;

        if (!currentAccountId) {
            showEmptyState('settings-tab-list', 'No accounts found. Open Gmail first to set up.');
            return;
        }

        // Bridge local state into the shared state module so shared
        // drag-and-drop handlers can access the account ID.
        setUserEmail(currentAccountId);

        // Show connected email
        const emailEl = document.getElementById('settings-account-email');
        if (emailEl) emailEl.textContent = currentAccountId;

        currentSettings = await getSettings(currentAccountId);
        setAppSettings(currentSettings);

        renderThemeButtons(currentSettings.theme);
        applyThemeToPage(currentSettings.theme);
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

function applyThemeToPage(theme: string): void {
    document.body.classList.remove('theme-light', 'theme-dark');
    if (theme === 'light') {
        document.body.classList.add('theme-light');
    } else if (theme === 'dark') {
        document.body.classList.add('theme-dark');
    } else {
        // System: check OS preference
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        if (!prefersDark) document.body.classList.add('theme-light');
    }
    updateSidebarThemeIcon(theme);
}

function setupThemeButtons(): void {
    const group = document.getElementById('settings-theme-group');
    if (!group) return;

    group.addEventListener('click', async (e) => {
        const btn = (e.target as HTMLElement).closest('.theme-btn') as HTMLElement | null;
        if (!btn || !currentAccountId) return;
        const theme = btn.getAttribute('data-theme') as Settings['theme'];
        if (!theme) return;

        await saveSettings(currentAccountId, { theme });
        if (currentSettings) currentSettings.theme = theme;
        renderThemeButtons(theme);
        applyThemeToPage(theme);
    });
}

// Sidebar theme toggle
function setupSidebarThemeToggle(): void {
    const toggleBtn = document.getElementById('sidebar-theme-toggle');
    if (!toggleBtn) return;

    toggleBtn.addEventListener('click', async () => {
        if (!currentAccountId || !currentSettings) return;
        const current = currentSettings.theme;
        const next: Settings['theme'] = current === 'dark' ? 'light' : 'dark';

        await saveSettings(currentAccountId, { theme: next });
        currentSettings.theme = next;
        renderThemeButtons(next);
        applyThemeToPage(next);
    });
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
        const isUrl = value.includes('http') || value.includes('mail.google.com') || value.startsWith('#');

        if (isUrl) {
            titleGroup.classList.remove('hidden');
            if (!titleInput.value) {
                if (value.includes('#search/')) {
                    titleInput.value = decodeURIComponent(value.split('#search/')[1] || '').replace(/\+/g, ' ');
                } else if (value.includes('#label/')) {
                    titleInput.value = decodeURIComponent(value.split('#label/')[1] || '').replace(/\+/g, ' ');
                }
            }
        } else {
            if (!titleInput.value) titleGroup.classList.add('hidden');
        }

        addBtn.disabled = value === '';
        errorEl.classList.add('hidden');
    });

    addBtn.addEventListener('click', async () => {
        if (!currentAccountId) return;
        const value = input.value.trim();
        if (!value) return;

        const isUrl = value.includes('http') || value.includes('mail.google.com') || value.startsWith('#');

        let tabValue: string;
        let tabType: 'label' | 'hash';
        let tabTitle: string;

        if (isUrl) {
            // Extract hash from URL or use directly
            if (value.includes('#')) {
                tabValue = '#' + value.split('#')[1];
            } else {
                tabValue = value;
            }
            tabType = 'hash';
            tabTitle = titleInput.value.trim() || tabValue;
        } else {
            tabValue = value;
            tabType = 'label';
            tabTitle = value;
        }

        try {
            await addTab(currentAccountId, tabTitle, tabValue, tabType);
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

    renderTabListItems(list, tabs, {
        onRemove: async (tabId) => {
            if (!currentAccountId) return;
            await removeTab(currentAccountId, tabId);
            currentSettings = await getSettings(currentAccountId);
            renderSettingsTabList(currentSettings.tabs);
            renderRulesList(currentSettings.tabs, currentSettings.rules);
        },
        onMoveUp: async (index) => {
            if (!currentAccountId || !currentSettings) return;
            const reordered = [...currentSettings.tabs];
            [reordered[index - 1], reordered[index]] = [reordered[index], reordered[index - 1]];
            await updateTabOrder(currentAccountId, reordered);
            currentSettings = await getSettings(currentAccountId);
            renderSettingsTabList(currentSettings.tabs);
        },
        onMoveDown: async (index) => {
            if (!currentAccountId || !currentSettings) return;
            const reordered = [...currentSettings.tabs];
            [reordered[index + 1], reordered[index]] = [reordered[index], reordered[index + 1]];
            await updateTabOrder(currentAccountId, reordered);
            currentSettings = await getSettings(currentAccountId);
            renderSettingsTabList(currentSettings.tabs);
        },
    });

    // Reuse shared drag-and-drop handlers from dragdrop.ts
    const refreshAfterDrop = async () => {
        if (!currentAccountId) return;
        currentSettings = await getSettings(currentAccountId);
        setAppSettings(currentSettings);
        renderSettingsTabList(currentSettings.tabs);
        renderRulesList(currentSettings.tabs, currentSettings.rules);
    };

    const dragHandlers = createModalDragHandlers(
        list as HTMLUListElement,
        refreshAfterDrop,
        () => { } // No Gmail tab bar to re-render on the options page
    );

    list.querySelectorAll<HTMLElement>('li[draggable]').forEach((li) => {
        li.addEventListener('dragstart', dragHandlers.handleModalDragStart as EventListener);
        li.addEventListener('dragover', dragHandlers.handleModalDragOver as unknown as EventListener);
        li.addEventListener('dragenter', dragHandlers.handleModalDragEnter as EventListener);
        li.addEventListener('dragleave', dragHandlers.handleModalDragLeave as EventListener);
        li.addEventListener('drop', dragHandlers.handleModalDrop as unknown as EventListener);
        li.addEventListener('dragend', dragHandlers.handleModalDragEnd as EventListener);
    });
}

// ---------------------------------------------------------------------------
// Preferences
// ---------------------------------------------------------------------------

function renderPreferences(settings: Settings): void {
    const unreadCheck = document.getElementById('pref-unread') as HTMLInputElement | null;

    if (unreadCheck) {
        unreadCheck.checked = settings.showUnreadCount;
        unreadCheck.addEventListener('change', async () => {
            if (!currentAccountId) return;
            await saveSettings(currentAccountId, { showUnreadCount: unreadCheck.checked });
        });
    }
}

// ---------------------------------------------------------------------------
// Export / Import / Uninstall
// ---------------------------------------------------------------------------

function setupDataControls(): void {
    // Export
    document.getElementById('settings-export-btn')?.addEventListener('click', async () => {
        if (!currentAccountId || !currentSettings) return;

        const payload = buildExportPayload(currentAccountId, currentSettings.tabs);
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

                if (confirm(`Import ${data.tabs.length} tabs? This will replace your current tabs.`)) {
                    await updateTabOrder(currentAccountId!, data.tabs);
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

    const ruleMap = new Map(rules.map((r) => [r.tabId, r]));

    container.innerHTML = `
        <div class="rule-row" style="font-weight:600;color:#718096;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;">
            <span>Tab</span>
            <span>Action</span>
            <span>After (days)</span>
            <span>Enabled</span>
        </div>
        ${tabs
            .map((tab) => {
                const rule = ruleMap.get(tab.id);
                const action = rule?.action || 'trash';
                const daysOld = rule?.daysOld ?? 30;
                const enabled = rule?.enabled ?? false;
                const targetLabel = rule?.targetLabel || '';

                return `
                <div class="rule-row" data-tab-id="${tab.id}">
                    <span class="rule-tab-name">${escapeHtml(tab.title)}</span>
                    <select class="input-select rule-action" data-tab-id="${tab.id}">
                        <option value="trash" ${action === 'trash' ? 'selected' : ''}>\ud83d\uddd1 Trash</option>
                        <option value="archive" ${action === 'archive' ? 'selected' : ''}>\ud83d\udce6 Archive</option>
                        <option value="markRead" ${action === 'markRead' ? 'selected' : ''}>✉️ Mark Read</option>
                        <option value="moveToLabel" ${action === 'moveToLabel' ? 'selected' : ''}>\ud83c\udff7 Move to Label</option>
                    </select>
                    <input type="number" class="input-number rule-days" data-tab-id="${tab.id}" value="${daysOld}" min="1" max="365">
                    <label class="toggle-switch">
                        <input type="checkbox" class="rule-enabled" data-tab-id="${tab.id}" ${enabled ? 'checked' : ''}>
                        <span class="toggle-slider"></span>
                    </label>
                </div>
                ${action === 'moveToLabel'
                        ? `
                    <div class="rule-target-row" data-tab-id="${tab.id}-target">
                        <span class="label">\u21b3 Target label:</span>
                        <input type="text" class="input-text rule-target-label" data-tab-id="${tab.id}" value="${escapeHtml(targetLabel)}" placeholder="e.g. Archive/Newsletters">
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

async function handleRuleChange(e: Event): Promise<void> {
    const target = e.target as HTMLElement;
    const tabId = target.getAttribute('data-tab-id');
    if (!tabId || !currentAccountId || !currentSettings) return;

    const settings = await getSettings(currentAccountId);
    let rule = settings.rules.find((r) => r.tabId === tabId);

    if (!rule) {
        rule = { tabId, action: 'trash', daysOld: 30, enabled: false };
        settings.rules.push(rule);
    }

    if (target.classList.contains('rule-action')) {
        rule.action = (target as HTMLSelectElement).value as Rule['action'];
        await saveSettings(currentAccountId, settings);
        currentSettings = await getSettings(currentAccountId);
        renderRulesList(currentSettings.tabs, currentSettings.rules);
        return;
    }

    if (target.classList.contains('rule-days')) {
        rule.daysOld = parseInt((target as HTMLInputElement).value, 10) || 30;
    }

    if (target.classList.contains('rule-enabled')) {
        rule.enabled = (target as HTMLInputElement).checked;
    }

    if (target.classList.contains('rule-target-label')) {
        rule.targetLabel = (target as HTMLInputElement).value;
    }

    await saveSettings(currentAccountId, settings);
    currentSettings = settings;
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

        const script = generateAppsScript(currentSettings.tabs, currentSettings.rules, sheetUrl);

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
// Utilities
// ---------------------------------------------------------------------------



function showEmptyState(containerId: string, message: string): void {
    const el = document.getElementById(containerId);
    if (el) {
        el.innerHTML = `<li class="empty-state"><p>${message}</p></li>`;
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
    setupAddTab();
    setupDataControls();

    // Load data
    loadSettings();
    setupScriptGeneration();
});
