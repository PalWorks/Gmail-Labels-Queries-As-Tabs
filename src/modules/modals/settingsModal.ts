/**
 * settingsModal.ts
 *
 * Settings (Configure Tabs) Modal: The main settings overlay injected into Gmail.
 * Provides theme selection, tab add/remove/reorder, unread count toggle,
 * import/export controls, and uninstall access.
 */

import { getSettings, savePreferences, addTab, getGlobalTheme, setGlobalTheme } from '../../utils/storage';
import { MODAL_ID, setAppSettings, getUserEmail } from '../state';
import { applyTheme } from '../theme';
import { renderManagedTabList, parseTabInput, isUrlLikeInput, deriveTitleFromUrl } from '../tabManager';
import { getRenderCallback } from './index';
import { exportSettings, showImportModal } from './importModal';
import { showUninstallModal } from './uninstallModal';
import { isExtensionContextAlive, isContextInvalidatedError, catchChromeError } from '../extensionContext';
import { renderContextInvalidatedNotice } from './contextNotice';
import { OPEN_OPTIONS_PAGE_ACTION } from '../messages';

/** Asks the service worker to open the options page. See `openOptionsPage`. */
export { OPEN_OPTIONS_PAGE_ACTION };

/** Contact route on the marketing site (PalWorks/Gmail-Labels-As-Tabs). */
export const SITE_CONTACT_URL = 'https://palworks.github.io/Gmail-Labels-As-Tabs/#/contact';

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

/**
 * Open the extension's own options page.
 *
 * This asks the service worker to do it, and that indirection is the whole
 * point. Until v1.5.0 this code ran `window.open(chrome.runtime.getURL(...))`
 * straight from the content script, and Chrome blocked every attempt with
 * ERR_BLOCKED_BY_CLIENT: the navigation's initiator is `mail.google.com`, and
 * a web origin may only reach an extension resource listed in
 * `web_accessible_resources`. `options.html` is deliberately not listed, and
 * should not be, because listing it would let any script on the Gmail page
 * frame or probe the settings UI.
 *
 * The worker has no such restriction. `chrome.runtime.openOptionsPage()` also
 * focuses an options tab that is already open instead of piling up duplicates.
 *
 * `chrome.runtime.sendMessage` throws once the extension context is
 * invalidated, which happens on every reload in development and on an update
 * in the wild. Nothing useful can be done about that from a page that is
 * already orphaned.
 */
function openOptionsPage(): void {
    if (!isExtensionContextAlive()) {
        showContextInvalidatedNotice();
        return;
    }
    try {
        // The context can die between the check above and the reply.
        catchChromeError(chrome.runtime.sendMessage({ action: OPEN_OPTIONS_PAGE_ACTION }), (e) => {
            if (isContextInvalidatedError(e)) {
                showContextInvalidatedNotice();
                return;
            }
            console.error('Gmail Tabs: could not ask the extension to open the options page', e);
        });
    } catch (e: unknown) {
        if (isContextInvalidatedError(e)) {
            showContextInvalidatedNotice();
            return;
        }
        console.error('Gmail Tabs: could not ask the extension to open the options page', e);
    }
}

/**
 * Replace the modal's contents with the one thing that will actually help.
 *
 * An orphaned content script cannot re-establish itself, so every other
 * control in this modal is dead too. Saying so, once, beats twelve buttons
 * that each do nothing.
 */
function showContextInvalidatedNotice(close?: () => void): void {
    const modal = document.getElementById(MODAL_ID);
    if (!modal) return;
    const content = modal.querySelector('.modal-content');
    if (!content) return;
    renderContextInvalidatedNotice(content, () => (close ? close() : modal.remove()));
}

/**
 * Run a settings action and, if it fails only because this script has been
 * orphaned, say so instead of doing nothing at all.
 *
 * The check when the modal opens catches the common case, where the user
 * comes back to a Gmail tab left open overnight. This catches the other one:
 * the extension updating while the modal is already on screen, where every
 * control silently stops working and the modal still looks fine.
 *
 * Anything that is not a dead context is a real bug and is logged rather than
 * dressed up as one, because telling someone to reload when reloading will
 * not help is worse than saying nothing.
 */
function guardedAction(work: Promise<unknown>): void {
    void work.catch(reportActionFailure);
}

/** The rejection half of `guardedAction`, for callers that already have a handler slot. */
function reportActionFailure(e: unknown): void {
    if (isContextInvalidatedError(e)) {
        showContextInvalidatedNotice();
        return;
    }
    console.error('Gmail Tabs: a settings action failed', e);
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
                <div class="modal-header-actions">
                    <button type="button" id="modal-open-options" class="header-icon-btn"
                        aria-label="Open the full settings page in a new tab"
                        title="Open the full settings page: all accounts, automation rules, privacy and logs">
                        <svg xmlns="http://www.w3.org/2000/svg" height="20" viewBox="0 -960 960 960" width="20" fill="currentColor" aria-hidden="true" focusable="false"><path d="m370-80-16-128q-13-5-24.5-12T307-235l-119 50L78-375l103-78q-1-7-1-13.5v-27q0-6.5 1-13.5L78-585l110-190 119 50q11-8 23-15t24-12l16-128h220l16 128q13 5 24.5 12t22.5 15l119-50 110 190-103 78q1 7 1 13.5v27q0 6.5-2 13.5l103 78-110 190-118-50q-11 8-23 15t-24 12L590-80H370Zm70-80h79l14-106q31-8 57.5-23.5T639-327l99 41 39-68-86-65q5-14 7-29.5t2-31.5q0-16-2-31.5t-7-29.5l86-65-39-68-99 42q-22-23-48.5-38.5T533-694l-13-106h-79l-14 106q-31 8-57.5 23.5T321-633l-99-41-39 68 86 64q-5 15-7 30t-2 32q0 16 2 31t7 30l-86 65 39 68 99-42q22 23 48.5 38.5T427-266l13 106Zm42-180q58 0 99-41t41-99q0-58-41-99t-99-41q-59 0-99.5 41T342-480q0 58 40.5 99t99.5 41Zm-2-140Z"/></svg>
                    </button>
                    <button type="button" class="close-btn" aria-label="Close settings">✕</button>
                </div>
            </div>
            <div class="modal-body">
                <div class="form-group theme-selector-group">
                    <label>Theme</label>
                    <div class="theme-options">
                        <button class="theme-btn" data-theme="system">System</button>
                        <button class="theme-btn" data-theme="light">Light</button>
                        <button class="theme-btn" data-theme="dark">Dark</button>
                    </div>
                    <small class="muted" style="display:block; margin-top:6px;">Applies to all your Gmail accounts</small>
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
                <span>Connected as: <span id="modal-account-email" style="font-weight: bold;">Detecting...</span> &middot; <a href="#" id="modal-manage-accounts" style="color: inherit;">Manage all accounts</a></span>
                <button type="button" id="modal-help-btn" class="header-icon-btn" aria-label="Help and support" title="Help &amp; Support">
                    <svg xmlns="http://www.w3.org/2000/svg" height="20" viewBox="0 -960 960 960" width="20" fill="currentColor" aria-hidden="true" focusable="false"><path d="M478-240q21 0 35.5-14.5T528-290q0-21-14.5-35.5T478-340q-21 0-35.5 14.5T428-290q0 21 14.5 35.5T478-240Zm-36-154h74q0-33 7.5-52t42.5-52q26-26 41-49.5t15-56.5q0-56-41-86t-97-30q-57 0-92.5 30T342-618l66 26q5-18 22.5-39t53.5-21q32 0 48 17.5t16 38.5q0 20-13 37t-53 49q-27.5 23-40.5 46T442-394ZM480-80q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm0-80q134 0 227-93t93-227q0-134-93-227t-227-93q-134 0-227 93t-93 227q0 134 93 227t227 93Zm0-320Z"/></svg>
                </button>
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

    // If this script is already orphaned, nothing else in the modal can work:
    // every control here ends in a `chrome.*` call. Say so once, rather than
    // letting the user discover it one dead button at a time. Placed after the
    // close wiring so the notice dismisses like any other modal.
    if (!isExtensionContextAlive()) {
        showContextInvalidatedNotice(close);
        return;
    }

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
    //
    // The marketing site lives in PalWorks/Gmail-Labels-As-Tabs, not in this
    // repository. Until v1.5.0 this pointed at a second Pages site built from
    // a leftover `website/` folder here; that site is retired, so this link
    // would have started 404ing for every installed user. `#/contact` is a
    // real route there, unlike the `#/#contact` this used to send people to.
    modal.querySelector('#modal-help-btn')?.addEventListener('click', () => {
        window.open(SITE_CONTACT_URL, '_blank');
    });

    // Header shortcut to the full options dashboard. The footer already has a
    // "Manage all accounts" link to the same place, but it sits below the fold
    // of a tall modal and reads as an account control rather than a way out to
    // everything this modal does not show: rules, privacy and logs.
    modal.querySelector('#modal-open-options')?.addEventListener('click', () => openOptionsPage());

    // "Manage all accounts" opens the full options dashboard (multi-account).
    modal.querySelector('#modal-manage-accounts')?.addEventListener('click', (e) => {
        e.preventDefault();
        openOptionsPage();
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

        if (isUrlLikeInput(value)) {
            titleGroup.style.display = 'flex';
            if (!titleInput.value) {
                const derived = deriveTitleFromUrl(value);
                if (derived) titleInput.value = derived;
            }
        } else if (!titleInput.value) {
            titleGroup.style.display = 'none';
        }

        addBtn.disabled = value === '';
    });

    // Tab list refresh function (declared before use). Behavior (list render,
    // remove/reorder persistence, drag-and-drop) lives in the shared tabManager;
    // this wrapper supplies the modal's account, Gmail-bar re-render, and refresh.
    async function refreshList() {
        if (!getUserEmail()) return;
        const settings = await getSettings(getUserEmail()!);
        renderManagedTabList({
            listEl: list,
            tabs: settings.tabs,
            getAccountId: getUserEmail,
            renderTabBar: getRenderCallback(),
            reRender: async () => {
                await refreshList();
                setAppSettings(await getSettings(getUserEmail()!));
                getRenderCallback()();
            },
            // Remove and reorder run through the same guard as every other
            // control here, so an orphaned tab says so rather than leaving
            // the row on screen as if the button were broken.
            onError: reportActionFailure,
        });
    }

    const errorMsg = modal.querySelector('#modal-error-msg') as HTMLElement;

    input.addEventListener('input', () => {
        input.classList.remove('input-error');
        errorMsg.style.display = 'none';
    });

    addBtn.addEventListener('click', () => guardedAction(handleAddTab()));

    async function handleAddTab(): Promise<void> {
        const value = input.value.trim();
        const title = titleInput.value.trim();

        if (value && getUserEmail()) {
            const { type, value: finalValue } = parseTabInput(value);

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

            await refreshList();
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
    }

    guardedAction(refreshList());

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

    // Theme is a browser-wide preference shared by all accounts in the window.
    guardedAction(
        getGlobalTheme().then((theme) => {
            updateThemeUI(theme);
        })
    );

    themeBtns.forEach((btn) => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            const theme = (btn as HTMLElement).dataset.theme as 'system' | 'light' | 'dark';
            guardedAction(
                setGlobalTheme(theme).then(() => {
                    updateThemeUI(theme);
                    applyTheme(theme);
                })
            );
        });
    });

    // Unread Count Toggle
    const unreadToggle = modal.querySelector('#modal-unread-toggle') as HTMLInputElement;

    if (getUserEmail()) {
        guardedAction(
            getSettings(getUserEmail()!).then((settings) => {
                unreadToggle.checked = settings.showUnreadCount;
            })
        );
    }

    unreadToggle.addEventListener('change', () => {
        if (!getUserEmail()) return;
        guardedAction(
            savePreferences(getUserEmail()!, { showUnreadCount: unreadToggle.checked }).then((next) => {
                setAppSettings(next);
                getRenderCallback()();
            })
        );
    });
}
