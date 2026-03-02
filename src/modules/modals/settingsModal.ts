/**
 * settingsModal.ts
 *
 * Settings (Configure Tabs) Modal: The main settings overlay injected into Gmail.
 * Provides theme selection, tab add/remove/reorder, unread count toggle,
 * import/export controls, and uninstall access.
 */

import { getSettings, saveSettings, addTab, removeTab, updateTabOrder } from '../../utils/storage';
import { renderTabListItems } from '../../utils/tabListRenderer';
import { MODAL_ID, setAppSettings, getUserEmail } from '../state';
import { applyTheme } from '../theme';
import { createModalDragHandlers } from '../dragdrop';
import { getRenderCallback } from './index';
import { exportSettings, showImportModal } from './importModal';
import { showUninstallModal } from './uninstallModal';

export function toggleSettingsModal(): void {
    const modal = document.getElementById(MODAL_ID);
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
    if (emailSpan && getUserEmail()) {
        emailSpan.textContent = getUserEmail()!;
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
        if (!getUserEmail()) return;
        const settings = await getSettings(getUserEmail()!);

        renderTabListItems(list, settings.tabs, {
            onRemove: async (tabId) => {
                if (getUserEmail()) {
                    await removeTab(getUserEmail()!, tabId);
                    refreshList();
                    setAppSettings(await getSettings(getUserEmail()!));
                    getRenderCallback()();
                }
            },
            onMoveUp: async (index) => {
                if (getUserEmail()) {
                    const newTabs = [...settings.tabs];
                    const [removed] = newTabs.splice(index, 1);
                    newTabs.splice(index - 1, 0, removed);
                    await updateTabOrder(getUserEmail()!, newTabs);
                    refreshList();
                    setAppSettings(await getSettings(getUserEmail()!));
                    getRenderCallback()();
                }
            },
            onMoveDown: async (index) => {
                if (getUserEmail()) {
                    const newTabs = [...settings.tabs];
                    const [removed] = newTabs.splice(index, 1);
                    newTabs.splice(index + 1, 0, removed);
                    await updateTabOrder(getUserEmail()!, newTabs);
                    refreshList();
                    setAppSettings(await getSettings(getUserEmail()!));
                    getRenderCallback()();
                }
            },
        });

        // Attach modal-specific drag listeners to each list item
        list.querySelectorAll<HTMLElement>('li[draggable]').forEach((li) => {
            li.addEventListener('dragstart', dragHandlers.handleModalDragStart as EventListener);
            li.addEventListener('dragover', dragHandlers.handleModalDragOver as unknown as EventListener);
            li.addEventListener('dragenter', dragHandlers.handleModalDragEnter as EventListener);
            li.addEventListener('dragleave', dragHandlers.handleModalDragLeave as EventListener);
            li.addEventListener('drop', dragHandlers.handleModalDrop as unknown as EventListener);
            li.addEventListener('dragend', dragHandlers.handleModalDragEnd as EventListener);
        });
    }

    // Modal Drag and Drop
    const dragHandlers = createModalDragHandlers(list, refreshList, getRenderCallback());

    const errorMsg = modal.querySelector('#modal-error-msg') as HTMLElement;

    input.addEventListener('input', () => {
        input.classList.remove('input-error');
        errorMsg.style.display = 'none';
    });

    addBtn.addEventListener('click', async () => {
        const value = input.value.trim();
        const title = titleInput.value.trim();

        if (value && getUserEmail()) {
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

            const settings = await getSettings(getUserEmail()!);
            const existingTab = settings.tabs.find((t) => t.value === finalValue);

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
                await addTab(getUserEmail()!, title, finalValue, 'hash');
            } else {
                await addTab(getUserEmail()!, title || finalValue, finalValue, 'label');
            }

            input.value = '';
            titleInput.value = '';
            titleGroup.style.display = 'none';
            input.classList.remove('input-error');
            errorMsg.style.display = 'none';

            refreshList();
            setAppSettings(await getSettings(getUserEmail()!));
            getRenderCallback()();

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
        themeBtns.forEach((btn) => {
            if ((btn as HTMLElement).dataset.theme === activeTheme) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    };

    if (getUserEmail()) {
        getSettings(getUserEmail()!).then((settings) => {
            updateThemeUI(settings.theme);
        });
    }

    themeBtns.forEach((btn) => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            const theme = (btn as HTMLElement).dataset.theme as 'system' | 'light' | 'dark';
            if (getUserEmail()) {
                saveSettings(getUserEmail()!, { theme }).then(() => {
                    updateThemeUI(theme);
                    applyTheme(theme);
                });
            }
        });
    });

    // Unread Count Toggle
    const unreadToggle = modal.querySelector('#modal-unread-toggle') as HTMLInputElement;

    if (getUserEmail()) {
        getSettings(getUserEmail()!).then((settings) => {
            unreadToggle.checked = settings.showUnreadCount;
        });
    }

    unreadToggle.addEventListener('change', async () => {
        if (getUserEmail()) {
            await saveSettings(getUserEmail()!, { showUnreadCount: unreadToggle.checked });
            setAppSettings(await getSettings(getUserEmail()!));
            getRenderCallback()();
        }
    });
}
