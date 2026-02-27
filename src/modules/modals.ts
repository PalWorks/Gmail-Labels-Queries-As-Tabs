/**
 * modals.ts
 *
 * All modal dialogs for Gmail Labels as Tabs:
 * Pin, Edit, Delete, Import, Uninstall, and Settings (Configure Tabs).
 */

import {
    Tab, getSettings, saveSettings,
    addTab, removeTab, updateTab, updateTabOrder, getAllAccounts
} from '../utils/storage';
import { state, MODAL_ID } from './state';
import { applyTheme } from './theme';
import { createModalDragHandlers } from './dragdrop';

// Callbacks injected by content.ts
let _renderTabs: () => void;

export function setRenderCallback(renderTabs: () => void): void {
    _renderTabs = renderTabs;
}

// ---------------------------------------------------------------------------
// Pin Modal
// ---------------------------------------------------------------------------

export function showPinModal(): void {
    const currentHash = window.location.hash;
    if (!currentHash || currentHash === '#inbox') {
        alert('Cannot pin the Inbox. Navigate to a label or search first.');
        return;
    }

    const modal = document.createElement('div');
    modal.className = 'gmail-tabs-modal';

    let suggestedTitle = 'New Tab';
    if (currentHash.startsWith('#label/')) {
        suggestedTitle = decodeURIComponent(currentHash.replace('#label/', '')).replace(/\+/g, ' ');
    } else if (currentHash.startsWith('#search/')) {
        suggestedTitle = 'Search: ' + decodeURIComponent(currentHash.replace('#search/', '')).replace(/\+/g, ' ');
    } else if (currentHash.startsWith('#advanced-search/')) {
        suggestedTitle = 'Advanced Search';
    }

    const content = document.createElement('div');
    content.className = 'modal-content edit-tab-modal';

    const header = document.createElement('div');
    header.className = 'modal-header';
    const h3 = document.createElement('h3');
    h3.textContent = 'Pin Current View';
    const closeBtn = document.createElement('button');
    closeBtn.className = 'close-btn';
    closeBtn.textContent = '✕';
    header.append(h3, closeBtn);

    const body = document.createElement('div');
    body.className = 'modal-body';

    const hashGroup = document.createElement('div');
    hashGroup.className = 'form-group';
    const hashLabel = document.createElement('label');
    hashLabel.textContent = 'View URL (Hash):';
    const hashInput = document.createElement('input');
    hashInput.type = 'text';
    hashInput.value = currentHash;
    hashInput.disabled = true;
    hashInput.className = 'disabled-input';
    hashGroup.append(hashLabel, hashInput);

    const titleGroup = document.createElement('div');
    titleGroup.className = 'form-group';
    const titleLabel = document.createElement('label');
    titleLabel.textContent = 'Tab Title:';
    const titleInput = document.createElement('input');
    titleInput.type = 'text';
    titleInput.id = 'pin-title';
    titleInput.value = suggestedTitle;
    titleGroup.append(titleLabel, titleInput);

    const actions = document.createElement('div');
    actions.className = 'modal-actions';
    const saveBtn = document.createElement('button');
    saveBtn.id = 'pin-save-btn';
    saveBtn.className = 'primary-btn';
    saveBtn.textContent = 'Pin Tab';
    actions.appendChild(saveBtn);

    body.append(hashGroup, titleGroup, actions);
    content.append(header, body);
    modal.appendChild(content);

    document.body.appendChild(modal);

    const onKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKeyDown);

    const close = () => {
        document.removeEventListener('keydown', onKeyDown);
        modal.remove();
    };
    modal.querySelector('.close-btn')?.addEventListener('click', close);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) close();
    });

    modal.querySelector('#pin-save-btn')?.addEventListener('click', async () => {
        const title = (modal.querySelector('#pin-title') as HTMLInputElement).value;

        if (title && state.currentUserEmail) {
            await addTab(state.currentUserEmail, title, currentHash, 'hash');
            close();
            state.currentSettings = await getSettings(state.currentUserEmail);
            _renderTabs();
        }
    });
}

// ---------------------------------------------------------------------------
// Edit Modal
// ---------------------------------------------------------------------------

export function showEditModal(tab: Tab): void {
    const modal = document.createElement('div');
    modal.className = 'gmail-tabs-modal';

    const content = document.createElement('div');
    content.className = 'modal-content edit-tab-modal';

    const header = document.createElement('div');
    header.className = 'modal-header';
    const h3 = document.createElement('h3');
    h3.textContent = 'Edit Tab';
    const closeBtn = document.createElement('button');
    closeBtn.className = 'close-btn';
    closeBtn.textContent = '✕';
    header.append(h3, closeBtn);

    const body = document.createElement('div');
    body.className = 'modal-body';

    const valueGroup = document.createElement('div');
    valueGroup.className = 'form-group';
    const valueLabel = document.createElement('label');
    valueLabel.textContent = `Value (${tab.type}):`;
    const valueInput = document.createElement('input');
    valueInput.type = 'text';
    valueInput.value = tab.value;
    valueInput.disabled = true;
    valueInput.className = 'disabled-input';
    valueGroup.append(valueLabel, valueInput);

    const nameGroup = document.createElement('div');
    nameGroup.className = 'form-group';
    const nameLabel = document.createElement('label');
    nameLabel.textContent = 'Display Name:';
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.id = 'edit-display-name';
    nameInput.value = tab.title;
    nameGroup.append(nameLabel, nameInput);

    const actions = document.createElement('div');
    actions.className = 'modal-actions';
    const saveBtn = document.createElement('button');
    saveBtn.id = 'edit-save-btn';
    saveBtn.className = 'primary-btn';
    saveBtn.textContent = 'Save';
    actions.appendChild(saveBtn);

    body.append(valueGroup, nameGroup, actions);
    content.append(header, body);
    modal.appendChild(content);

    document.body.appendChild(modal);

    const onKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKeyDown);

    const close = () => {
        document.removeEventListener('keydown', onKeyDown);
        modal.remove();
    };
    modal.querySelector('.close-btn')?.addEventListener('click', close);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) close();
    });

    modal.querySelector('#edit-save-btn')?.addEventListener('click', async () => {
        const title = (modal.querySelector('#edit-display-name') as HTMLInputElement).value;

        if (title && state.currentUserEmail) {
            await updateTab(state.currentUserEmail, tab.id, {
                title: title.trim()
            });

            close();
            state.currentSettings = await getSettings(state.currentUserEmail);
            _renderTabs();
        }
    });
}

// ---------------------------------------------------------------------------
// Delete Modal
// ---------------------------------------------------------------------------

export function showDeleteModal(tab: Tab): void {
    const modal = document.createElement('div');
    modal.className = 'gmail-tabs-modal';

    const content = document.createElement('div');
    content.className = 'modal-content delete-tab-modal';

    const body = document.createElement('div');
    body.className = 'modal-body';
    body.style.cssText = 'text-align: center; padding: 32px;';

    const iconWrapper = document.createElement('div');
    iconWrapper.className = 'delete-icon-wrapper';
    iconWrapper.innerHTML = '<svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>';

    const h3 = document.createElement('h3');
    h3.style.cssText = 'margin: 16px 0 8px 0; font-size: 20px; font-weight: 500;';
    h3.textContent = 'Remove Tab?';

    const p = document.createElement('p');
    p.style.cssText = 'color: var(--gmail-tab-text); margin-bottom: 24px; font-size: 14px; line-height: 1.5;';
    p.textContent = 'This will remove ';
    const strong = document.createElement('strong');
    strong.textContent = `"${tab.title}"`;
    p.appendChild(strong);
    p.appendChild(document.createTextNode(' from your tab bar.'));

    const actions = document.createElement('div');
    actions.className = 'modal-actions';
    actions.style.cssText = 'justify-content: center; gap: 12px; margin-top: 0;';
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'secondary-btn close-btn-action';
    cancelBtn.textContent = 'Cancel';
    const confirmBtn = document.createElement('button');
    confirmBtn.id = 'delete-confirm-btn';
    confirmBtn.className = 'primary-btn danger-btn';
    confirmBtn.textContent = 'Remove';
    actions.append(cancelBtn, confirmBtn);

    body.append(iconWrapper, h3, p, actions);
    content.appendChild(body);
    modal.appendChild(content);

    document.body.appendChild(modal);

    const onKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKeyDown);

    const close = () => {
        document.removeEventListener('keydown', onKeyDown);
        modal.remove();
    };
    modal.querySelectorAll('.close-btn-action').forEach(btn => {
        btn.addEventListener('click', close);
    });
    modal.addEventListener('click', (e) => {
        if (e.target === modal) close();
    });

    modal.querySelector('#delete-confirm-btn')?.addEventListener('click', async () => {
        if (state.currentUserEmail) {
            await removeTab(state.currentUserEmail, tab.id);
            close();
            state.currentSettings = await getSettings(state.currentUserEmail);
            _renderTabs();
        } else {
            console.error('Gmail Tabs: Cannot delete, currentUserEmail is null');
        }
    });
}

// ---------------------------------------------------------------------------
// Export / Import
// ---------------------------------------------------------------------------

export async function exportSettings(): Promise<void> {
    console.log('Gmail Tabs: Exporting settings...');
    if (!state.currentUserEmail) {
        console.error('Gmail Tabs: Export failed, no currentUserEmail');
        alert('Error: Could not detect user email.');
        return;
    }
    const settings = await getSettings(state.currentUserEmail);
    console.log('Gmail Tabs: Settings to export:', settings);

    const exportData = {
        version: 1,
        timestamp: Date.now(),
        email: state.currentUserEmail,
        tabs: settings.tabs
    };
    const json = JSON.stringify(exportData, null, 2);

    const date = new Date().toISOString().split('T')[0];
    const sanitizedEmail = state.currentUserEmail.replace(/[^a-zA-Z0-9._-]/g, '_');
    const filename = `GmailTabs_${sanitizedEmail}_${date}.json`;
    console.log('Gmail Tabs: Generated filename:', filename);

    try {
        console.log('Gmail Tabs: Sending download request to background...');
        chrome.runtime.sendMessage({
            action: 'DOWNLOAD_FILE',
            filename: filename,
            data: json
        }, (response) => {
            if (chrome.runtime.lastError) {
                console.error('Gmail Tabs: Message failed', chrome.runtime.lastError);
                alert('Error: Could not communicate with extension background. Please reload the page.');
                return;
            }
            if (response && response.success) {
                console.log('Gmail Tabs: Download initiated successfully', response.downloadId);
            } else {
                console.error('Gmail Tabs: Download failed', response?.error);
                alert('Failed to download file: ' + (response?.error || 'Unknown error'));
            }
        });
    } catch (err) {
        console.error('Gmail Tabs: Unexpected error during export', err);
        alert('Unexpected error during export. Please check console.');
    }
}

export function showImportModal(): void {
    const modal = document.createElement('div');
    modal.className = 'gmail-tabs-modal';

    modal.innerHTML = `
        <div class="modal-content import-modal">
            <div class="modal-header">
                <h3>Import Configuration</h3>
                <button class="close-btn">✕</button>
            </div>
            <div class="modal-body">
                <p style="margin-bottom: 8px; color: var(--modal-text);">Upload a JSON file or paste configuration below:</p>
                
                <div style="margin-bottom: 12px; display: flex; gap: 8px;">
                    <input type="file" id="import-file" accept=".json" style="display: none;">
                    <button id="import-file-btn" class="secondary-btn" style="width: 100%;">
                        📂 Select JSON File
                    </button>
                </div>

                <textarea id="import-json" class="import-textarea" placeholder='{"version": 1, "tabs": [...]}'></textarea>
                
                <div class="modal-actions">
                    <button class="secondary-btn close-btn-action">Cancel</button>
                    <button id="import-confirm-btn" class="primary-btn">Import</button>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    const onKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKeyDown);

    const close = () => {
        document.removeEventListener('keydown', onKeyDown);
        modal.remove();
    };
    modal.querySelectorAll('.close-btn, .close-btn-action').forEach(btn => {
        btn.addEventListener('click', close);
    });
    modal.addEventListener('click', (e) => {
        if (e.target === modal) close();
    });

    const fileInput = modal.querySelector('#import-file') as HTMLInputElement;
    const fileBtn = modal.querySelector('#import-file-btn') as HTMLButtonElement;
    const textArea = modal.querySelector('#import-json') as HTMLTextAreaElement;

    fileBtn.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                if (e.target?.result) {
                    textArea.value = e.target.result as string;
                    fileBtn.textContent = `✅ Loaded: ${file.name}`;
                    setTimeout(() => fileBtn.textContent = '📂 Select JSON File', 3000);
                }
            };
            reader.readAsText(file);
        }
    });

    modal.querySelector('#import-confirm-btn')?.addEventListener('click', async () => {
        const jsonStr = textArea.value.trim();
        if (!jsonStr) {
            alert('Please select a file or paste configuration JSON.');
            return;
        }

        try {
            const data = JSON.parse(jsonStr);
            if (!data.tabs || !Array.isArray(data.tabs)) {
                throw new Error('Invalid format: Missing "tabs" array.');
            }

            for (let i = 0; i < data.tabs.length; i++) {
                const t = data.tabs[i];
                if (!t || typeof t !== 'object') {
                    throw new Error(`Invalid tab at index ${i}: not an object.`);
                }
                if (typeof t.id !== 'string' || !t.id.trim()) {
                    throw new Error(`Invalid tab at index ${i}: missing or empty "id".`);
                }
                if (typeof t.title !== 'string' || !t.title.trim()) {
                    throw new Error(`Invalid tab at index ${i}: missing or empty "title".`);
                }
                if (t.type !== 'label' && t.type !== 'hash') {
                    throw new Error(`Invalid tab at index ${i}: "type" must be "label" or "hash".`);
                }
                if (typeof t.value !== 'string' || !t.value.trim()) {
                    throw new Error(`Invalid tab at index ${i}: missing or empty "value".`);
                }
            }

            if (data.email && state.currentUserEmail && data.email !== state.currentUserEmail) {
                alert(`Error: This configuration belongs to "${data.email}" but you are connected as "${state.currentUserEmail}". Import rejected.`);
                return;
            }

            if (state.currentUserEmail && confirm('This will replace your current tabs. Are you sure?')) {
                await updateTabOrder(state.currentUserEmail, data.tabs);
                state.currentSettings = await getSettings(state.currentUserEmail);
                _renderTabs();
                close();
                alert('Configuration imported successfully!');
            }
        } catch (e: any) {
            alert('Error importing: ' + e.message);
        }
    });
}

// ---------------------------------------------------------------------------
// Uninstall Flow
// ---------------------------------------------------------------------------

export function showUninstallModal(): void {
    const modal = document.createElement('div');
    modal.className = 'gmail-tabs-modal';

    modal.innerHTML = `
        <div class="modal-content delete-tab-modal">
            <div class="modal-body" style="text-align: center; padding: 32px;">
                <div class="delete-icon-wrapper">
                    <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
                </div>
                <h3 style="margin: 16px 0 8px 0; font-size: 20px; font-weight: 500;">Uninstall Extension?</h3>
                <p style="color: var(--gmail-tab-text); margin-bottom: 24px; font-size: 14px; line-height: 1.5;">
                    Do you want to export your tab details, so that you can import them again when you reinstall?
                </p>
                <div class="modal-actions" style="justify-content: center; gap: 12px; margin-top: 0;">
                    <button id="uninstall-no-btn" class="secondary-btn">No</button>
                    <button id="uninstall-yes-btn" class="primary-btn">Yes</button>
                </div>
                <div style="margin-top: 12px;">
                    <button class="secondary-btn close-btn-action" style="background: transparent; border: none; color: var(--modal-text); font-size: 12px;">Cancel</button>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    const onKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKeyDown);

    const close = () => {
        document.removeEventListener('keydown', onKeyDown);
        modal.remove();
    };
    modal.querySelectorAll('.close-btn-action').forEach(btn => {
        btn.addEventListener('click', close);
    });
    modal.addEventListener('click', (e) => {
        if (e.target === modal) close();
    });

    modal.querySelector('#uninstall-yes-btn')?.addEventListener('click', async () => {
        try {
            await exportAllAccounts();
            uninstallExtension();
        } catch (e) {
            console.error('Export failed', e);
            alert('Export failed. Proceeding to uninstall...');
            uninstallExtension();
        }
        close();
    });

    modal.querySelector('#uninstall-no-btn')?.addEventListener('click', () => {
        uninstallExtension();
        close();
    });
}

async function exportAllAccounts(): Promise<void> {
    console.log('Gmail Tabs: Exporting all accounts...');
    try {
        const accounts = await getAllAccounts();
        console.log('Gmail Tabs: Found accounts:', accounts);

        if (accounts.length === 0 && state.currentUserEmail) {
            accounts.push(state.currentUserEmail);
        }

        for (const email of accounts) {
            const settings = await getSettings(email);
            const exportData = {
                version: 1,
                timestamp: Date.now(),
                email: email,
                tabs: settings.tabs
            };
            const json = JSON.stringify(exportData, null, 2);
            const date = new Date().toISOString().split('T')[0];
            const sanitizedEmail = email.replace(/[^a-zA-Z0-9._-]/g, '_');
            const filename = `GmailTabs_${sanitizedEmail}_${date}.json`;

            chrome.runtime.sendMessage({
                action: 'DOWNLOAD_FILE',
                filename: filename,
                data: json
            }, (response) => {
                if (chrome.runtime.lastError) {
                    console.error('Gmail Tabs: Export message failed for', email, chrome.runtime.lastError);
                }
            });
        }
    } catch (e) {
        console.error('Gmail Tabs: Error exporting all accounts', e);
        throw e;
    }
}

function uninstallExtension(): void {
    console.log('Gmail Tabs: Requesting uninstall...');
    chrome.runtime.sendMessage({ action: 'UNINSTALL_SELF' });
}

// ---------------------------------------------------------------------------
// Settings (Configure Tabs) Modal
// ---------------------------------------------------------------------------

export function toggleSettingsModal(): void {
    let modal = document.getElementById(MODAL_ID);
    if (modal) {
        if ((modal as any)._close) {
            (modal as any)._close();
        } else {
            modal.remove();
        }
    } else {
        createSettingsModal();
    }
}

function createSettingsModal(): void {
    console.log('Gmail Tabs: Creating settings modal (v2)');
    const modal = document.createElement('div');
    modal.id = MODAL_ID;
    modal.className = 'gmail-tabs-modal';

    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>Configure Tabs</h3>
                <button class="close-btn">✕</button>
            </div>
            <div class="modal-body">
                <div class="form-group theme-selector-group">
                    <label>Theme</label>
                    <div class="theme-options">
                        <button class="theme-btn" data-theme="system">System</button>
                        <button class="theme-btn" data-theme="light">Light</button>
                        <button class="theme-btn" data-theme="dark">Dark</button>
                    </div>
                </div>
                
                <div style="border-bottom: 1px solid var(--list-border); margin-bottom: 16px;"></div>
                
                <div class="add-tab-section">
                    <div class="input-group">
                        <input type="text" id="modal-new-label" placeholder="Label Name or View URL">
                    </div>
                    <div id="modal-error-msg" class="input-error-msg" style="display: none;"></div>
                    <div class="input-group" id="modal-title-group" style="display:none;">
                        <input type="text" id="modal-new-title" placeholder="Tab Title">
                    </div>
                    <button id="modal-add-btn" class="primary-btn" style="width: 100%; margin-bottom: 16px;" disabled>Add Tab</button>
                </div>
                <div style="border-bottom: 1px solid var(--list-border); margin-bottom: 16px;"></div>
                <ul id="modal-labels-list"></ul>

                <div style="border-bottom: 1px solid var(--list-border); margin-bottom: 16px;"></div>

                <div class="form-group checkbox-group">
                    <input type="checkbox" id="modal-unread-toggle">
                    <label for="modal-unread-toggle">Show Unread Count</label>
                </div>

                <div style="border-top: 1px solid var(--list-border); margin-top: 16px; padding-top: 16px;">
                    <h4 style="margin: 0 0 12px 0; font-weight: 500; font-size: 14px; color: var(--modal-text);">Data & Sync</h4>
                    <div style="display: flex; gap: 12px; margin-bottom: 16px;">
                        <button id="export-btn" class="secondary-btn" style="flex: 1;">
                            Export Config
                        </button>
                        <button id="import-btn" class="secondary-btn" style="flex: 1;">
                            Import Config
                        </button>
                    </div>
                    
                    <div style="border-top: 1px solid var(--list-border); margin-bottom: 16px;"></div>
                    
                    <h4 style="margin: 0 0 12px 0; font-weight: 500; font-size: 14px; color: var(--modal-text);">Danger Zone</h4>
                    <button id="uninstall-btn" class="secondary-btn" style="width: 100%;">
                        Uninstall Extension
                    </button>
                </div>
            </div>
            <div class="modal-footer" style="padding: 16px; background: var(--disabled-input-bg); border-top: 1px solid var(--list-border); font-size: 0.8em; color: var(--modal-text); display: flex; justify-content: space-between; align-items: center;">
                <span>Connected as: <span id="modal-account-email" style="font-weight: bold;">Detecting...</span></span>
                <div id="modal-help-btn" style="cursor: pointer; color: #5f6368; display: flex; align-items: center;" title="Help & Support">
                    <svg xmlns="http://www.w3.org/2000/svg" height="20" viewBox="0 -960 960 960" width="20" fill="currentColor"><path d="M478-240q21 0 35.5-14.5T528-290q0-21-14.5-35.5T478-340q-21 0-35.5 14.5T428-290q0 21 14.5 35.5T478-240Zm-36-154h74q0-33 7.5-52t42.5-52q26-26 41-49.5t15-56.5q0-56-41-86t-97-30q-57 0-92.5 30T342-618l66 26q5-18 22.5-39t53.5-21q32 0 48 17.5t16 38.5q0 20-13 37t-53 49q-27.5 23-40.5 46T442-394ZM480-80q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm0-80q134 0 227-93t93-227q0-134-93-227t-227-93q-134 0-227 93t-93 227q0 134 93 227t227 93Zm0-320Z"/></svg>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    const onKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKeyDown);

    const close = () => {
        document.removeEventListener('keydown', onKeyDown);
        modal.remove();
    };
    (modal as any)._close = close;

    setTimeout(() => {
        const input = modal.querySelector('#modal-new-label') as HTMLInputElement;
        if (input) input.focus();
    }, 100);

    // Export/Import Listeners
    modal.querySelector('#export-btn')?.addEventListener('click', exportSettings);
    modal.querySelector('#import-btn')?.addEventListener('click', () => {
        close();
        showImportModal();
    });

    // Uninstall Button
    modal.querySelector('#uninstall-btn')?.addEventListener('click', () => {
        close();
        showUninstallModal();
    });

    // Help Button
    modal.querySelector('#modal-help-btn')?.addEventListener('click', () => {
        window.open('https://palworks.github.io/Gmail-Labels-Queries-As-Tabs/#/#contact', '_blank');
    });

    // Set Account Email
    const emailSpan = modal.querySelector('#modal-account-email');
    if (emailSpan && state.currentUserEmail) {
        emailSpan.textContent = state.currentUserEmail;
    }

    // Event Listeners
    modal.querySelector('.close-btn')?.addEventListener('click', () => close());
    modal.addEventListener('click', (e) => {
        if (e.target === modal) close();
    });

    const addBtn = modal.querySelector('#modal-add-btn') as HTMLButtonElement;
    const input = modal.querySelector('#modal-new-label') as HTMLInputElement;
    const titleInput = modal.querySelector('#modal-new-title') as HTMLInputElement;
    const titleGroup = modal.querySelector('#modal-title-group') as HTMLElement;
    const list = modal.querySelector('#modal-labels-list') as HTMLUListElement;

    // Smart Input Detection
    input.addEventListener('input', () => {
        const value = input.value.trim();
        const isUrl = value.includes('http') || value.includes('mail.google.com') || value.startsWith('#');

        if (isUrl) {
            titleGroup.style.display = 'flex';
            if (!titleInput.value) {
                if (value.includes('#search/')) {
                    titleInput.value = decodeURIComponent(value.split('#search/')[1]).replace(/\+/g, ' ');
                } else if (value.includes('#label/')) {
                    titleInput.value = decodeURIComponent(value.split('#label/')[1]).replace(/\+/g, ' ');
                }
            }
        } else {
            if (!titleInput.value) {
                titleGroup.style.display = 'none';
            }
        }

        addBtn.disabled = value === '';
    });

    // Tab list refresh function (declared before use)
    async function refreshList() {
        if (!state.currentUserEmail) return;
        const settings = await getSettings(state.currentUserEmail);
        list.innerHTML = '';
        settings.tabs.forEach((tab, index) => {
            const li = document.createElement('li');
            li.setAttribute('draggable', 'true');
            li.dataset.index = index.toString();

            li.innerHTML = `
                <div class="modal-drag-handle" title="Drag to reorder">
                    <svg viewBox="0 0 24 24"><path d="M11 18c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2zm-2-8c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0-6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm6 4c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/></svg>
                </div>
                <span class="tab-info">${tab.title} <small style="color: #888; font-size: 0.8em;">(${tab.type === 'hash' ? 'Custom' : 'Label'})</small></span>
                <div class="actions">
                    ${index > 0 ? '<button class="up-btn">↑</button>' : ''}
                    ${index < settings.tabs.length - 1 ? '<button class="down-btn">↓</button>' : ''}
                    <button class="remove-btn">✕</button>
                </div>
            `;

            li.querySelector('.remove-btn')?.addEventListener('click', async () => {
                if (state.currentUserEmail) {
                    await removeTab(state.currentUserEmail, tab.id);
                    refreshList();
                    state.currentSettings = await getSettings(state.currentUserEmail);
                    _renderTabs();
                }
            });

            li.querySelector('.up-btn')?.addEventListener('click', async () => {
                if (state.currentUserEmail) {
                    const newTabs = [...settings.tabs];
                    [newTabs[index - 1], newTabs[index]] = [newTabs[index], newTabs[index - 1]];
                    await updateTabOrder(state.currentUserEmail, newTabs);
                    refreshList();
                    state.currentSettings = await getSettings(state.currentUserEmail);
                    _renderTabs();
                }
            });

            li.querySelector('.down-btn')?.addEventListener('click', async () => {
                if (state.currentUserEmail) {
                    const newTabs = [...settings.tabs];
                    [newTabs[index + 1], newTabs[index]] = [newTabs[index], newTabs[index + 1]];
                    await updateTabOrder(state.currentUserEmail, newTabs);
                    refreshList();
                    state.currentSettings = await getSettings(state.currentUserEmail);
                    _renderTabs();
                }
            });

            // Drag Listeners
            li.addEventListener('dragstart', dragHandlers.handleModalDragStart);
            li.addEventListener('dragover', dragHandlers.handleModalDragOver);
            li.addEventListener('dragenter', dragHandlers.handleModalDragEnter);
            li.addEventListener('dragleave', dragHandlers.handleModalDragLeave);
            li.addEventListener('drop', dragHandlers.handleModalDrop);
            li.addEventListener('dragend', dragHandlers.handleModalDragEnd);

            list.appendChild(li);
        });
    }

    // Modal Drag and Drop
    const dragHandlers = createModalDragHandlers(list, refreshList, _renderTabs);

    const errorMsg = modal.querySelector('#modal-error-msg') as HTMLElement;

    input.addEventListener('input', () => {
        input.classList.remove('input-error');
        errorMsg.style.display = 'none';
    });

    addBtn.addEventListener('click', async () => {
        let value = input.value.trim();
        let title = titleInput.value.trim();

        if (value && state.currentUserEmail) {
            let type: 'label' | 'hash' = 'label';
            let finalValue = value;

            if (value.includes('http') || value.includes('mail.google.com') || value.startsWith('#')) {
                type = 'hash';
                if (value.includes('#')) {
                    finalValue = '#' + value.split('#')[1];
                }
            } else {
                if (value.toLowerCase().startsWith('label:')) {
                    finalValue = value.substring(6).trim();
                }
            }

            const settings = await getSettings(state.currentUserEmail);
            const existingTab = settings.tabs.find(t => t.value === finalValue);

            if (existingTab) {
                input.classList.add('input-error');
                errorMsg.textContent = `View URL / Label already exists with tab display name as "${existingTab.title}"`;
                errorMsg.style.display = 'block';
                return;
            }

            if (type === 'hash') {
                if (!title) {
                    alert('Please enter a Title for this tab.');
                    titleInput.focus();
                    return;
                }
                await addTab(state.currentUserEmail, title, finalValue, 'hash');
            } else {
                await addTab(state.currentUserEmail, title || finalValue, finalValue, 'label');
            }

            input.value = '';
            titleInput.value = '';
            titleGroup.style.display = 'none';
            input.classList.remove('input-error');
            errorMsg.style.display = 'none';

            refreshList();
            state.currentSettings = await getSettings(state.currentUserEmail);
            _renderTabs();

            const originalText = addBtn.textContent;
            addBtn.textContent = 'Tab Added';
            addBtn.classList.add('success');
            setTimeout(() => {
                addBtn.textContent = originalText;
                addBtn.classList.remove('success');
                addBtn.disabled = true;
            }, 1000);
        }
    });

    refreshList();

    // Theme Selector Logic
    const themeBtns = modal.querySelectorAll('.theme-btn');
    const updateThemeUI = (activeTheme: string) => {
        themeBtns.forEach(btn => {
            if ((btn as HTMLElement).dataset.theme === activeTheme) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    };

    if (state.currentUserEmail) {
        getSettings(state.currentUserEmail).then(settings => {
            updateThemeUI(settings.theme);
        });
    }

    themeBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            const theme = (btn as HTMLElement).dataset.theme as 'system' | 'light' | 'dark';
            if (state.currentUserEmail) {
                saveSettings(state.currentUserEmail, { theme }).then(() => {
                    updateThemeUI(theme);
                    applyTheme(theme);
                });
            }
        });
    });

    // Unread Count Toggle
    const unreadToggle = modal.querySelector('#modal-unread-toggle') as HTMLInputElement;

    if (state.currentUserEmail) {
        getSettings(state.currentUserEmail).then(settings => {
            unreadToggle.checked = settings.showUnreadCount;
        });
    }

    unreadToggle.addEventListener('change', async () => {
        if (state.currentUserEmail) {
            await saveSettings(state.currentUserEmail, { showUnreadCount: unreadToggle.checked });
            state.currentSettings = await getSettings(state.currentUserEmail);
            _renderTabs();
        }
    });
}
