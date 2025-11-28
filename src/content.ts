/**
 * content.ts
 *
 * Main content script for Gmail Labels as Tabs.
 * Handles DOM injection, navigation monitoring, and tab rendering.
 * Integrated with InboxSDK for robust navigation and account detection.
 */

import * as InboxSDK from '@inboxsdk/core';
import { getSettings, saveSettings, addTab, removeTab, updateTabOrder, updateTab, Settings, Tab, migrateLegacySettingsIfNeeded } from './utils/storage';

// App ID provided by user
const APP_ID = 'sdk_Gmail-Tabs_2488593e74';

// Selectors for Gmail elements
// We target the main toolbar container to inject below it.
const TOOLBAR_SELECTORS = [
    '.G-atb', // Main toolbar container (often has this class)
    '.aeF > div:first-child', // Fallback
];

const TABS_BAR_ID = 'gmail-labels-as-tabs-bar';
const MODAL_ID = 'gmail-labels-settings-modal';

let currentSettings: Settings | null = null;
let observer: MutationObserver | null = null;
let currentSdk: any | null = null;
let currentUserEmail: string | null = null;

/**
 * Initialize the extension.
 */
async function init() {
    console.log('Gmail Tabs: Initializing...');
    // Inject pageWorld.js immediately for XHR interception
    injectPageWorld();

    // 1. Start DOM-based initialization IMMEDIATELY
    // This ensures the tabs appear ASAP, even if SDK is slow or fails
    initializeFromDOM();

    // 2. Try to load InboxSDK in parallel for enhancement
    loadInboxSDK();

    // Initial render attempt and observer start (these can run even without settings loaded yet)
    attemptInjection();
    startObserver();

    // Listen for URL changes (popstate)
    window.addEventListener('popstate', handleUrlChange);

    // Listen for storage changes to update tabs in real-time
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'sync') {
            console.log('Gmail Tabs: Storage changed', changes);

            if (currentUserEmail) {
                const accountKey = `account_${currentUserEmail}`;
                // Only reload if our account's settings changed OR if it's a legacy migration (global keys)
                const relevantKeys = [accountKey, 'theme', 'tabs', 'labels']; // tabs/labels for legacy
                const hasRelevantChange = Object.keys(changes).some(k => relevantKeys.includes(k));

                if (hasRelevantChange) {
                    getSettings(currentUserEmail).then(settings => {
                        currentSettings = settings;
                        console.log('Gmail Tabs: Reloaded settings for', currentUserEmail, currentSettings);
                        renderTabs();
                        // Theme update
                        if (changes.theme) {
                            applyTheme(currentSettings.theme);
                        }
                    });
                }
            }
        }
    });

    // Listen for messages from background script
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === 'TOGGLE_SETTINGS') {
            toggleSettingsModal();
        } else if (message.action === 'GET_ACCOUNT_INFO') {
            sendResponse({ account: currentUserEmail });
        }
    });

    // Listen for unread updates from pageWorld.js
    document.addEventListener('gmailTabs:unreadUpdate', (e: any) => {
        const updates = e.detail;
        if (updates && Array.isArray(updates)) {
            handleUnreadUpdates(updates);
        }
    });
}

async function initializeFromDOM() {
    console.log('Gmail Tabs: Starting DOM-based initialization...');
    let email = extractEmailFromDOM();
    if (email) {
        console.log('Gmail Tabs: Email found immediately:', email);
        if (!currentUserEmail) {
            currentUserEmail = email;
            await finalizeInit(email);
        }
    } else {
        console.log('Gmail Tabs: Email not found yet, polling DOM...');
        const accountPoller = setInterval(async () => {
            email = extractEmailFromDOM();
            if (email) {
                console.log('Gmail Tabs: Account detected via polling:', email);
                clearInterval(accountPoller);
                if (!currentUserEmail) {
                    currentUserEmail = email;
                    await finalizeInit(email);
                }
            }
        }, 1000);

        // Stop polling after 60 seconds
        setTimeout(() => clearInterval(accountPoller), 60000);
    }
}

async function loadInboxSDK() {
    try {
        console.log('Gmail Tabs: Attempting to load InboxSDK (Background)...');
        // We don't await this in the main init flow anymore
        const sdk = await InboxSDK.load(2, APP_ID);
        currentSdk = sdk;
        console.log('Gmail Tabs: InboxSDK loaded.');

        // If we still haven't found the email via DOM (rare), use SDK
        if (!currentUserEmail) {
            const sdkEmail = sdk.User.getEmailAddress();
            console.log('Gmail Tabs: Got email from SDK:', sdkEmail);
            currentUserEmail = sdkEmail;
            await finalizeInit(currentUserEmail);
        }

        // Robust Active Tab Highlighting via SDK
        currentSdk.Router.handleAllRoutes((routeView: any) => {
            updateActiveTab();
        });

    } catch (err) {
        console.warn('Gmail Tabs: InboxSDK failed to load (Non-fatal):', err);
        // We don't need to do anything else, DOM fallback is already running
    }
}

function injectPageWorld() {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('js/xhrInterceptor.js');
    script.onload = function () {
        // @ts-ignore
        this.remove();
    };
    (document.head || document.documentElement).appendChild(script);
}

/**
 * Scrapes the Gmail sidebar to build a map of Label Name -> Internal ID.
 * This is crucial because XHR updates often use internal IDs (e.g. Label_4)
 * while tabs use display names (e.g. Delete/BankNotifications).
 */
function buildLabelMapFromDOM(): Map<string, string> {
    const map = new Map<string, string>();

    // Robust selector: Look for any link that points to a label
    // This bypasses obfuscated class names like .aio
    const labelLinks = document.querySelectorAll('a[href*="#label/"]');

    labelLinks.forEach(link => {
        const href = link.getAttribute('href');
        if (!href) return;

        // Extract ID: #label/Label_4
        const rawId = href.split('#label/')[1];
        if (!rawId) return;

        const id = decodeURIComponent(rawId).replace(/\+/g, ' ');

        // The display name is usually in the 'title' attribute of the link 
        // OR in a child element's 'title' or text content.
        // Gmail sidebar links usually have 'title' on the <a> or a child div.
        let title = link.getAttribute('title');

        if (!title) {
            // Try children
            const childWithTitle = link.querySelector('[title]');
            if (childWithTitle) {
                title = childWithTitle.getAttribute('title');
            }
        }

        // Fallback: aria-label (often "Label name, 5 unread conversations")
        if (!title) {
            const ariaLabel = link.getAttribute('aria-label');
            if (ariaLabel) {
                // Strip ", X unread..." suffix if present
                title = ariaLabel.split(',')[0];
            }
        }

        if (title) {
            map.set(title.toLowerCase(), id);
            // Also map the ID to itself
            map.set(id.toLowerCase(), id);
        }
    });

    console.log('Gmail Tabs: Built DOM Label Map (Size: ' + map.size + ')');
    return map;
}

function handleUnreadUpdates(updates: { label: string; count: number }[]) {
    console.log('Gmail Tabs: Received unread updates', updates);

    // Map updates to a quick lookup
    const updateMap = new Map<string, number>();
    updates.forEach(u => updateMap.set(u.label, u.count));

    // DEBUG: Log all available keys to see what we are working with
    // console.log('Gmail Tabs: Available Keys:', Array.from(updateMap.keys()).join(', '));

    // Build the Name -> ID map from DOM
    const domLabelMap = buildLabelMapFromDOM();

    // Helper for fuzzy matching: remove all non-alphanumeric chars and lowercase
    const normalize = (str: string) => str.toLowerCase().replace(/[^a-z0-9]/g, '');

    // Update visible tabs
    const bar = document.getElementById(TABS_BAR_ID);
    if (!bar) return;

    const tabs = bar.querySelectorAll('.gmail-tab');
    tabs.forEach(t => {
        const tabEl = t as HTMLElement;
        const tabValue = tabEl.dataset.value;
        const tabType = tabEl.dataset.type;

        if (!tabValue) return;

        let labelId = '';
        if (tabType === 'label') {
            labelId = tabValue;
        } else if (tabType === 'hash') {
            if (tabValue === '#inbox') labelId = '^i';
            else if (tabValue === '#starred') labelId = '^t';
            else if (tabValue === '#drafts') labelId = '^r';
            else if (tabValue === '#sent') labelId = '^f';
            else if (tabValue === '#spam') labelId = '^s';
            else if (tabValue === '#trash') labelId = '^k';
            else if (tabValue === '#all') labelId = '^all';
            else if (tabValue.startsWith('#label/')) {
                // Decode: Delete%2FNotifications -> Delete/Notifications
                labelId = decodeURIComponent(tabValue.replace('#label/', '').replace(/\+/g, ' '));
            } else if (tabValue.startsWith('#search/label:')) {
                // Handle saved searches for labels: #search/label:my-label
                // Decode: #search/label%3Amy-label -> my-label
                const raw = decodeURIComponent(tabValue.replace('#search/', ''));
                if (raw.startsWith('label:')) {
                    labelId = raw.replace('label:', '');
                }
            }
        }

        // Try to resolve the Display Name to an Internal ID using our DOM map
        // e.g. "Delete/BankNotifications" -> "Label_4"
        let resolvedId = labelId;
        if (domLabelMap.has(labelId.toLowerCase())) {
            resolvedId = domLabelMap.get(labelId.toLowerCase()) || labelId;
            // console.log(`Gmail Tabs: Resolved '${labelId}' -> '${resolvedId}'`);
        }

        // Check if we have an update for this label (using resolved ID)
        let count = updateMap.get(resolvedId);
        // If direct match failed, try fuzzy match on the RESOLVED ID
        if (count === undefined && resolvedId && !resolvedId.startsWith('^')) {
            const normalizedTarget = normalize(resolvedId);
            // console.log(`Gmail Tabs: Fuzzy matching for '${resolvedId}' (norm: ${normalizedTarget})`);

            // Iterate over all updates to find a fuzzy match
            for (const [key, val] of updateMap.entries()) {
                const normalizedKey = normalize(key);
                if (normalizedKey === normalizedTarget) {
                    count = val;
                    // console.log(`Gmail Tabs: Fuzzy match success! '${resolvedId}' -> '${key}'`);
                    break;
                }
            }
        }

        if (count !== undefined) {
            const countSpan = tabEl.querySelector('.unread-count');
            if (countSpan) {
                countSpan.textContent = count > 0 ? count.toString() : '';
            }
        }
    });
}

async function finalizeInit(email: string) {
    console.log('Gmail Tabs: Finalizing init for', email);
    try {
        // Ensure settings exist or migrate
        await migrateLegacySettingsIfNeeded(email);
        console.log('Gmail Tabs: Migration check complete');
        currentSettings = await getSettings(email);
        console.log('Gmail Tabs: Settings loaded for', email, currentSettings);
        renderTabs();
        applyTheme(currentSettings.theme);
    } catch (e) {
        console.error('Gmail Tabs: Error in finalizeInit', e);
    }
}

/**
 * Helper to extract email if SDK fails
 */
function extractEmailFromDOM(): string | null {
    console.log('Gmail Tabs: Extracting email from DOM...');

    // 1. Try Document Title
    const title = document.title;
    console.log('Gmail Tabs: Document Title:', title);
    // Regex allowing for + aliases and standard chars
    const emailRegex = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/;

    const titleMatch = title.match(emailRegex);
    if (titleMatch) {
        console.log('Gmail Tabs: Found email in title:', titleMatch[1]);
        return titleMatch[1];
    }

    // 2. Try Account Button (aria-label)
    // Look for elements with aria-label containing @ and "Google Account" or similar
    const accountElement = document.querySelector('[aria-label*="@"][aria-label*="Google Account"], a[aria-label*="@"]');
    if (accountElement) {
        const label = accountElement.getAttribute('aria-label');
        console.log('Gmail Tabs: Found account element label:', label);
        const emailMatch = label?.match(emailRegex);
        if (emailMatch) {
            console.log('Gmail Tabs: Found email in aria-label:', emailMatch[1]);
            return emailMatch[1];
        }
    }

    console.log('Gmail Tabs: Could not extract email from DOM.');
    return null;
}

/**
 * Attempt to inject the tabs bar.
 * Retries if the insertion point isn't found yet.
 */
function attemptInjection() {
    // If bar exists, check if it's in the right place (top)
    const existingBar = document.getElementById(TABS_BAR_ID);

    let injectionPoint: Element | null = null;
    for (const selector of TOOLBAR_SELECTORS) {
        // We want the visible toolbar
        const candidates = document.querySelectorAll(selector);
        for (const el of candidates) {
            if (el.getBoundingClientRect().height > 0) {
                injectionPoint = el;
                break;
            }
        }
        if (injectionPoint) break;
    }

    if (injectionPoint) {
        if (!existingBar) {
            const tabsBar = createTabsBar();
            injectionPoint.insertAdjacentElement('afterend', tabsBar);
            renderTabs();
        } else if (existingBar.previousElementSibling !== injectionPoint) {
            // Re-attach if moved
            injectionPoint.insertAdjacentElement('afterend', existingBar);
        }
        updateActiveTab();
    } else {
        // Retry shortly if not found (Gmail loading)
        setTimeout(attemptInjection, 500);
    }
}

/**
 * Create the container for the tabs.
 */
function createTabsBar(): HTMLElement {
    const bar = document.createElement('div');
    bar.id = TABS_BAR_ID;
    bar.className = 'gmail-tabs-bar';
    return bar;
}

/**
 * Render the tabs based on current settings.
 */

// --- Drag Handlers ---
let dragSrcEl: HTMLElement | null = null;

function handleDragStart(this: HTMLElement, e: DragEvent) {
    dragSrcEl = this;
    this.classList.add('dragging');
    if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', this.dataset.index || '');
        // Set a transparent drag image if possible, or let browser handle it
    }
}

function handleDragOver(e: DragEvent) {
    if (e.preventDefault) {
        e.preventDefault();
    }
    if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'move';
    }
    return false;
}

function handleDragEnter(this: HTMLElement, e: DragEvent) {
    this.classList.add('drag-over');
}

function handleDragLeave(this: HTMLElement, e: DragEvent) {
    // Prevent flickering when entering child elements
    if (this.contains(e.relatedTarget as Node)) return;
    this.classList.remove('drag-over');
}

async function handleDrop(this: HTMLElement, e: DragEvent) {
    if (e.stopPropagation) {
        e.stopPropagation();
    }

    // Remove the drop marker
    this.classList.remove('drag-over');

    if (dragSrcEl !== this) {
        const oldIndex = parseInt(dragSrcEl!.dataset.index || '0');
        const newIndex = parseInt(this.dataset.index || '0');

        // Optimistic update
        if (currentSettings && currentUserEmail) {
            const tabs = [...currentSettings.tabs];
            const [movedTab] = tabs.splice(oldIndex, 1);
            tabs.splice(newIndex, 0, movedTab);

            // Update local state immediately
            currentSettings.tabs = tabs;
            renderTabs();

            // Persist
            await updateTabOrder(currentUserEmail, tabs);
        }
    }
    return false;
}

function handleDragEnd(this: HTMLElement, e: DragEvent) {
    dragSrcEl = null;
    document.querySelectorAll('.gmail-tab').forEach(item => {
        item.classList.remove('drag-over', 'dragging');
    });
}

function renderTabs() {
    const bar = document.getElementById(TABS_BAR_ID);
    if (!bar || !currentSettings) return;
    bar.innerHTML = '';

    currentSettings.tabs.forEach((tab, index) => {
        const tabEl = document.createElement('div');
        tabEl.className = 'gmail-tab';
        tabEl.setAttribute('draggable', 'true');
        tabEl.dataset.index = index.toString();
        tabEl.dataset.value = tab.value;
        tabEl.dataset.type = tab.type;

        // Drag Handle
        const dragHandle = document.createElement('div');
        dragHandle.className = 'tab-drag-handle';
        dragHandle.title = 'Drag to reorder';
        dragHandle.innerHTML = '<svg viewBox="0 0 24 24"><path d="M11 18c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2zm-2-8c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0-6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm6 4c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/></svg>';
        tabEl.appendChild(dragHandle);

        const nameSpan = document.createElement('span');
        nameSpan.className = 'tab-name';
        nameSpan.textContent = tab.title;
        tabEl.appendChild(nameSpan);

        // Unread Count
        if (currentSettings.showUnreadCount) {
            const countSpan = document.createElement('span');
            countSpan.className = 'unread-count';
            // Placeholder or empty initially
            countSpan.textContent = '';
            tabEl.appendChild(countSpan);

            // Trigger async update
            updateUnreadCount(tab, tabEl);
        }

        const actions = document.createElement('div');
        actions.className = 'tab-actions';

        const editBtn = document.createElement('div');
        editBtn.className = 'tab-action-btn edit-btn';
        editBtn.innerHTML = '⋮';
        editBtn.title = 'Edit Tab';
        editBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            showEditModal(tab);
        });
        actions.appendChild(editBtn);

        const deleteBtn = document.createElement('div');
        deleteBtn.className = 'tab-action-btn delete-btn';
        deleteBtn.innerHTML = '✕';
        deleteBtn.title = 'Remove Tab';
        deleteBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            console.log('Gmail Tabs: Delete button clicked for', tab.title);
            showDeleteModal(tab);
        });
        actions.appendChild(deleteBtn);
        tabEl.appendChild(actions);

        tabEl.addEventListener('click', (e) => {
            // Don't navigate if clicking actions or drag handle
            if ((e.target as HTMLElement).closest('.tab-actions') || (e.target as HTMLElement).closest('.tab-drag-handle')) {
                return;
            }

            // --- Navigation ---
            // We use window.location.hash directly for maximum robustness.
            // InboxSDK's Router.goto has been flaky with "Extra parameters" errors.
            // Gmail's native hash navigation is reliable.

            if (tab.type === 'label') {
                // Encode the label for the URL
                // Gmail uses + for spaces and encodes other chars
                const encoded = encodeURIComponent(tab.value).replace(/%20/g, '+');
                window.location.hash = `#label/${encoded}`;
            } else if (tab.type === 'hash') {
                window.location.hash = tab.value;
            }

            // Highlight immediately (optimistic)
            updateActiveTab();
        });

        // Drag Events
        tabEl.addEventListener('dragstart', handleDragStart); // Added missing dragstart
        tabEl.addEventListener('dragenter', handleDragEnter); // Added missing dragenter
        tabEl.addEventListener('dragover', handleDragOver);   // Added missing dragover
        tabEl.addEventListener('dragleave', handleDragLeave); // Added missing dragleave
        tabEl.addEventListener('drop', handleDrop);           // Added missing drop
        tabEl.addEventListener('dragend', handleDragEnd);

        bar.appendChild(tabEl);
    });

    // "Save View" Button (formerly Pin, now Plus)
    const saveViewBtn = document.createElement('div');
    saveViewBtn.className = 'gmail-tab-btn save-view-btn';
    // Google Material Symbol: add_circle (outlined)
    saveViewBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5 11h-4v4h-2v-4H7v-2h4V7h2v4h4v2z"/></svg>';
    saveViewBtn.title = 'Save Current View as Tab';
    saveViewBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        showPinModal();
    });
    bar.appendChild(saveViewBtn);

    // "Manage Tabs" Button (formerly Add, now Pencil)
    const manageBtn = document.createElement('div');
    manageBtn.className = 'gmail-tab-btn manage-btn';
    // Google Material Symbol: edit
    manageBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>';
    manageBtn.title = 'Manage Tabs';
    manageBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleSettingsModal();
    });
    bar.appendChild(manageBtn);

    updateActiveTab();
}

// --- Pin Modal ---
function showPinModal() {
    const currentHash = window.location.hash;
    if (!currentHash || currentHash === '#inbox') {
        alert('Cannot pin the Inbox. Navigate to a label or search first.');
        return;
    }

    const modal = document.createElement('div');
    modal.className = 'gmail-tabs-modal';

    // Suggest a title based on the hash
    let suggestedTitle = 'New Tab';
    if (currentHash.startsWith('#label/')) {
        suggestedTitle = decodeURIComponent(currentHash.replace('#label/', '')).replace(/\+/g, ' ');
    } else if (currentHash.startsWith('#search/')) {
        suggestedTitle = 'Search: ' + decodeURIComponent(currentHash.replace('#search/', '')).replace(/\+/g, ' ');
    } else if (currentHash.startsWith('#advanced-search/')) {
        suggestedTitle = 'Advanced Search';
    }

    modal.innerHTML = `
        <div class="modal-content edit-tab-modal">
            <div class="modal-header">
                <h3>Pin Current View</h3>
                <button class="close-btn">✕</button>
            </div>
            <div class="modal-body">
                <div class="form-group">
                    <label>View URL (Hash):</label>
                    <input type="text" value="${currentHash}" disabled class="disabled-input">
                </div>
                <div class="form-group">
                    <label>Tab Title:</label>
                    <input type="text" id="pin-title" value="${suggestedTitle}">
                </div>
                <div class="modal-actions">
                    <button id="pin-save-btn" class="primary-btn">Pin Tab</button>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    const close = () => modal.remove();
    modal.querySelector('.close-btn')?.addEventListener('click', close);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) close();
    });

    modal.querySelector('#pin-save-btn')?.addEventListener('click', async () => {
        const title = (modal.querySelector('#pin-title') as HTMLInputElement).value;

        if (title && currentUserEmail) {
            await addTab(currentUserEmail, title, currentHash, 'hash');
            close();
            // Refresh settings and re-render
            currentSettings = await getSettings(currentUserEmail);
            renderTabs();
        }
    });
}

// --- Edit Modal ---
function showEditModal(tab: Tab) {
    const modal = document.createElement('div');
    modal.className = 'gmail-tabs-modal';

    modal.innerHTML = `
        <div class="modal-content edit-tab-modal">
            <div class="modal-header">
                <h3>Edit Tab</h3>
                <button class="close-btn">✕</button>
            </div>
            <div class="modal-body">
                <div class="form-group">
                    <label>Value (${tab.type}):</label>
                    <input type="text" value="${tab.value}" disabled class="disabled-input">
                </div>
                <div class="form-group">
                    <label>Display Name:</label>
                    <input type="text" id="edit-display-name" value="${tab.title}">
                </div>
                <div class="modal-actions">
                    <button id="edit-save-btn" class="primary-btn">Save</button>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    const close = () => modal.remove();
    modal.querySelector('.close-btn')?.addEventListener('click', close);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) close();
    });

    modal.querySelector('#edit-save-btn')?.addEventListener('click', async () => {
        const title = (modal.querySelector('#edit-display-name') as HTMLInputElement).value;

        if (title && currentUserEmail) {
            await updateTab(currentUserEmail, tab.id, {
                title: title.trim()
            });

            close();
            // Refresh settings and re-render
            currentSettings = await getSettings(currentUserEmail);
            renderTabs();
        }
    });
}

// --- Delete Modal ---
function showDeleteModal(tab: Tab) {
    const modal = document.createElement('div');
    modal.className = 'gmail-tabs-modal';

    modal.innerHTML = `
        <div class="modal-content delete-tab-modal">
            <div class="modal-body" style="text-align: center; padding: 32px;">
                <div class="delete-icon-wrapper">
                    <svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                </div>
                <h3 style="margin: 16px 0 8px 0; font-size: 20px; font-weight: 500;">Remove Tab?</h3>
                <p style="color: var(--gmail-tab-text); margin-bottom: 24px; font-size: 14px; line-height: 1.5;">
                    This will remove <strong>"${tab.title}"</strong> from your tab bar.
                </p>
                <div class="modal-actions" style="justify-content: center; gap: 12px; margin-top: 0;">
                    <button class="secondary-btn close-btn-action">Cancel</button>
                    <button id="delete-confirm-btn" class="primary-btn danger-btn">Remove</button>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    const close = () => modal.remove();
    modal.querySelectorAll('.close-btn-action').forEach(btn => {
        btn.addEventListener('click', close);
    });
    modal.addEventListener('click', (e) => {
        if (e.target === modal) close();
    });

    modal.querySelector('#delete-confirm-btn')?.addEventListener('click', async () => {
        if (currentUserEmail) {
            await removeTab(currentUserEmail, tab.id);
            close();
            // Refresh settings and re-render
            currentSettings = await getSettings(currentUserEmail);
            renderTabs();
        } else {
            console.error('Gmail Tabs: Cannot delete, currentUserEmail is null');
        }
    });
}

/**
 * Generate the URL for a given label.
 */
function getLabelUrl(labelName: string): string {
    const encoded = encodeURIComponent(labelName).replace(/%20/g, '+');
    return `https://mail.google.com/mail/u/0/#label/${encoded}`;
}

/**
 * Highlight the active tab based on current URL.
 */
function updateActiveTab() {
    const hash = window.location.hash;
    const bar = document.getElementById(TABS_BAR_ID);
    if (!bar) return;

    const tabs = bar.querySelectorAll('.gmail-tab');
    tabs.forEach(t => {
        const tabEl = t as HTMLElement;
        const tabValue = tabEl.dataset.value;
        const tabType = tabEl.dataset.type;
        if (!tabValue) return;

        let isActive = false;

        if (tabType === 'hash') {
            // Exact match for hash tabs
            isActive = hash === tabValue;
        } else {
            // Label matching logic
            const cleanHash = decodeURIComponent(hash.replace('#label/', '').replace(/\+/g, ' '));
            isActive = cleanHash === tabValue || hash.includes(`#label/${encodeURIComponent(tabValue).replace(/%20/g, '+')}`);
        }

        if (isActive) {
            tabEl.classList.add('active');
        } else {
            tabEl.classList.remove('active');
        }
    });
}

function handleUrlChange() {
    updateActiveTab();
}

function startObserver() {
    if (observer) observer.disconnect();

    observer = new MutationObserver((mutations) => {
        attemptInjection();
        updateActiveTab();
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true,
    });
}

// --- Settings Modal Logic ---

function toggleSettingsModal() {
    let modal = document.getElementById(MODAL_ID);
    if (modal) {
        modal.remove();
    } else {
        createSettingsModal();
    }
}

function createSettingsModal() {
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
                    <button id="modal-add-btn" class="primary-btn" style="width: 100%; margin-bottom: 16px;">Add Tab</button>
                </div>
                <div style="border-bottom: 1px solid var(--list-border); margin-bottom: 16px;"></div>
                <ul id="modal-labels-list"></ul>

                <div style="border-bottom: 1px solid var(--list-border); margin-bottom: 16px;"></div>

                <div class="form-group checkbox-group">
                    <input type="checkbox" id="modal-unread-toggle">
                    <label for="modal-unread-toggle">Show Unread Count</label>
                </div>
            </div>
            <div class="modal-footer" style="padding: 16px; background: var(--disabled-input-bg); border-top: 1px solid var(--list-border); font-size: 0.8em; color: var(--modal-text); text-align: center;">
                Connected as: <span id="modal-account-email" style="font-weight: bold;">Detecting...</span>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // Set Account Email
    const emailSpan = modal.querySelector('#modal-account-email');
    if (emailSpan && currentUserEmail) {
        emailSpan.textContent = currentUserEmail;
    }

    // Event Listeners
    modal.querySelector('.close-btn')?.addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
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
            // Auto-extract title if possible (simple heuristic)
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
    });

    // Modal Drag and Drop Logic
    let modalDragSrcEl: HTMLElement | null = null;

    const handleModalDragStart = function (this: HTMLElement, e: DragEvent) {
        modalDragSrcEl = this;
        this.classList.add('dragging');
        if (e.dataTransfer) {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', this.dataset.index || '');
        }
    };

    const handleModalDragOver = function (this: HTMLElement, e: DragEvent) {
        if (e.preventDefault) {
            e.preventDefault();
        }
        if (e.dataTransfer) {
            e.dataTransfer.dropEffect = 'move';
        }

        // Calculate position within the element
        const rect = this.getBoundingClientRect();
        const relY = e.clientY - rect.top;
        const height = rect.height;

        // Remove existing classes first
        this.classList.remove('drop-above', 'drop-below');

        if (relY < height / 2) {
            this.classList.add('drop-above');
        } else {
            this.classList.add('drop-below');
        }

        return false;
    };

    const handleModalDragEnter = function (this: HTMLElement) {
        this.classList.add('drag-over');
    };

    const handleModalDragLeave = function (this: HTMLElement) {
        this.classList.remove('drag-over', 'drop-above', 'drop-below');
    };

    const handleModalDrop = async function (this: HTMLElement, e: DragEvent) {
        if (e.stopPropagation) {
            e.stopPropagation();
        }

        const dropPosition = this.classList.contains('drop-above') ? 'above' : 'below';
        this.classList.remove('drag-over', 'drop-above', 'drop-below');

        if (modalDragSrcEl !== this) {
            const oldIndex = parseInt(modalDragSrcEl!.dataset.index || '0');
            let newIndex = parseInt(this.dataset.index || '0');

            if (dropPosition === 'below') {
                newIndex++;
            }

            if (currentUserEmail) {
                const settings = await getSettings(currentUserEmail);
                const newTabs = [...settings.tabs];
                const [movedTab] = newTabs.splice(oldIndex, 1);

                if (oldIndex < newIndex) {
                    newIndex--;
                }

                newTabs.splice(newIndex, 0, movedTab);

                await updateTabOrder(currentUserEmail, newTabs);
                refreshList();
                // Also update the main bar
                currentSettings = await getSettings(currentUserEmail);
                renderTabs();
            }
        }
        return false;
    };

    const handleModalDragEnd = function (this: HTMLElement) {
        modalDragSrcEl = null;
        list.querySelectorAll('li').forEach(item => {
            item.classList.remove('drag-over', 'dragging', 'drop-above', 'drop-below');
        });
    };

    const refreshList = async () => {
        if (!currentUserEmail) return;
        const settings = await getSettings(currentUserEmail);
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
                if (currentUserEmail) {
                    await removeTab(currentUserEmail, tab.id);
                    refreshList();
                    currentSettings = await getSettings(currentUserEmail);
                    renderTabs();
                }
            });

            li.querySelector('.up-btn')?.addEventListener('click', async () => {
                if (currentUserEmail) {
                    const newTabs = [...settings.tabs];
                    [newTabs[index - 1], newTabs[index]] = [newTabs[index], newTabs[index - 1]];
                    await updateTabOrder(currentUserEmail, newTabs);
                    refreshList();
                    currentSettings = await getSettings(currentUserEmail);
                    renderTabs();
                }
            });

            li.querySelector('.down-btn')?.addEventListener('click', async () => {
                if (currentUserEmail) {
                    const newTabs = [...settings.tabs];
                    [newTabs[index + 1], newTabs[index]] = [newTabs[index], newTabs[index + 1]];
                    await updateTabOrder(currentUserEmail, newTabs);
                    refreshList();
                    currentSettings = await getSettings(currentUserEmail);
                    renderTabs();
                }
            });

            // Add Drag Listeners
            li.addEventListener('dragstart', handleModalDragStart);
            li.addEventListener('dragover', handleModalDragOver);
            li.addEventListener('dragenter', handleModalDragEnter);
            li.addEventListener('dragleave', handleModalDragLeave);
            li.addEventListener('drop', handleModalDrop);
            li.addEventListener('dragend', handleModalDragEnd);

            list.appendChild(li);
        });
    };

    const errorMsg = modal.querySelector('#modal-error-msg') as HTMLElement;

    // Clear error on input
    input.addEventListener('input', () => {
        input.classList.remove('input-error');
        errorMsg.style.display = 'none';
    });

    addBtn.addEventListener('click', async () => {
        let value = input.value.trim();
        let title = titleInput.value.trim();

        if (value && currentUserEmail) {
            // Check if it's a URL/Hash
            let type: 'label' | 'hash' = 'label';
            let finalValue = value;

            if (value.includes('http') || value.includes('mail.google.com') || value.startsWith('#')) {
                type = 'hash';
                // Extract Hash
                if (value.includes('#')) {
                    finalValue = '#' + value.split('#')[1];
                }
            } else {
                // It's a Label
                if (value.toLowerCase().startsWith('label:')) {
                    finalValue = value.substring(6).trim();
                }
            }

            // Duplicate Check
            const settings = await getSettings(currentUserEmail);
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
                await addTab(currentUserEmail, title, finalValue, 'hash');
            } else {
                await addTab(currentUserEmail, title || finalValue, finalValue, 'label');
            }

            input.value = '';
            titleInput.value = '';
            titleGroup.style.display = 'none';
            input.classList.remove('input-error');
            errorMsg.style.display = 'none';

            refreshList();
            // Also update the main bar
            currentSettings = await getSettings(currentUserEmail);
            renderTabs();
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

    // Initialize UI
    if (currentUserEmail) {
        getSettings(currentUserEmail).then(settings => {
            updateThemeUI(settings.theme);
        });
    }

    themeBtns.forEach(btn => {
        btn.addEventListener('click', async () => {
            const theme = (btn as HTMLElement).dataset.theme as 'system' | 'light' | 'dark';
            if (currentUserEmail) {
                await saveSettings(currentUserEmail, { theme });
                updateThemeUI(theme);
                applyTheme(theme);
            }
        });
    });

    // Unread Count Toggle Logic
    const unreadToggle = modal.querySelector('#modal-unread-toggle') as HTMLInputElement;

    if (currentUserEmail) {
        getSettings(currentUserEmail).then(settings => {
            unreadToggle.checked = settings.showUnreadCount;
        });
    }

    unreadToggle.addEventListener('change', async () => {
        if (currentUserEmail) {
            await saveSettings(currentUserEmail, { showUnreadCount: unreadToggle.checked });
            currentSettings = await getSettings(currentUserEmail);
            renderTabs();
        }
    });
}

/**
 * Normalize label name for fuzzy matching
 * - Lowercase
 * - Replace separators (/, -, _) with space
 * - Remove extra spaces
 */
function normalizeLabel(name: string): string {
    return decodeURIComponent(name)
        .toLowerCase()
        .replace(/[\/\-_]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Helper to update unread count using Atom Feed (Robust)
 * Falls back to DOM scraping if needed.
 */
async function updateUnreadCount(tab: Tab, tabEl: HTMLElement): Promise<void> {
    const countSpan = tabEl.querySelector('.unread-count');
    if (!countSpan) return;

    let labelForFeed = '';

    // Determine Label for Feed
    if (tab.type === 'label') {
        labelForFeed = tab.value;
    } else if (tab.type === 'hash') {
        if (tab.value === '#inbox') {
            labelForFeed = ''; // Empty for Inbox
        } else if (tab.value.startsWith('#label/')) {
            labelForFeed = tab.value.replace('#label/', '');
        }
    }

    // If we identified a label, try fetching the feed
    if (labelForFeed !== undefined) { // labelForFeed can be '' for inbox
        try {
            // Construct feed URL
            const encodedLabel = labelForFeed ? encodeURIComponent(labelForFeed) : '';
            const feedUrl = `${location.origin}${location.pathname}feed/atom/${encodedLabel}`;

            const response = await fetch(feedUrl);
            if (response.ok) {
                const text = await response.text();
                const parser = new DOMParser();
                const xmlDoc = parser.parseFromString(text, "text/xml");
                const fullcount = xmlDoc.querySelector('fullcount');

                if (fullcount && fullcount.textContent) {
                    const count = parseInt(fullcount.textContent, 10);
                    if (count > 0) {
                        countSpan.textContent = count.toString();
                        return; // Success
                    } else {
                        // Count is 0, hide or empty
                        countSpan.textContent = '';
                        return;
                    }
                }
            }
        } catch (e) {
            console.warn('Gmail Tabs: Failed to fetch atom feed for', labelForFeed, e);
        }
    }

    // Fallback: DOM Scraping (Original Logic)
    const domCount = getUnreadCountFromDOM(tab);
    if (domCount) {
        countSpan.textContent = domCount;
    } else {
        countSpan.textContent = '';
    }
}

/**
 * Legacy DOM Scraping (Fallback)
 */
function getUnreadCountFromDOM(tab: Tab): string {
    if (tab.type === 'hash' && !tab.value.startsWith('#label/')) {
        // Special case: Inbox
        if (tab.value === '#inbox') {
            const link = document.querySelector('a[href$="#inbox"]');
            if (link) {
                const ariaLabel = link.getAttribute('aria-label');
                if (ariaLabel) {
                    const match = ariaLabel.match(/(\d+)\s+unread/);
                    return match ? match[1] : '';
                }
            }
        }
        return '';
    }

    // For Labels (and hash labels)
    let labelName = tab.value;
    if (tab.type === 'hash' && tab.value.startsWith('#label/')) {
        labelName = tab.value.replace('#label/', '');
    }

    // Strategy 1: Exact Href Match (Fastest)
    const encodedLabel = encodeURIComponent(labelName).replace(/%20/g, '+');
    const hrefSuffix = '#' + 'label/' + encodedLabel;
    let link = document.querySelector('a[href$="' + hrefSuffix + '"]');

    // Strategy 2: Fuzzy Match on Title/Aria-Label (Robust)
    if (!link) {
        const normalizedTarget = normalizeLabel(labelName);

        // Get all label links in sidebar (usually have href containing #label/)
        const candidates = document.querySelectorAll('a[href*="#label/"]');

        for (const candidate of candidates) {
            // Check Title
            const title = candidate.getAttribute('title');
            if (title && normalizeLabel(title) === normalizedTarget) {
                link = candidate;
                break;
            }

            // Check Aria-Label (e.g., "LabelName 5 unread messages")
            const ariaLabel = candidate.getAttribute('aria-label');
            if (ariaLabel) {
                const href = candidate.getAttribute('href');
                if (href) {
                    const hrefLabel = href.split('#label/')[1];
                    if (hrefLabel && normalizeLabel(hrefLabel) === normalizedTarget) {
                        link = candidate;
                        break;
                    }
                }
            }
        }
    }

    if (link) {
        const ariaLabel = link.getAttribute('aria-label');
        if (ariaLabel) {
            // Format: "LabelName 5 unread"
            const match = ariaLabel.match(/(\d+)\s+unread/);
            return match ? match[1] : '';
        }

        // Fallback: Look for child .bsU element
        const countEl = link.querySelector('.bsU');
        if (countEl) {
            return countEl.textContent || '';
        }
    }

    return '';
}

// Run init
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

// --- Theme Management ---
function applyTheme(theme: 'system' | 'light' | 'dark') {
    document.body.classList.remove('force-dark', 'force-light');

    if (theme === 'dark') {
        document.body.classList.add('force-dark');
    } else if (theme === 'light') {
        document.body.classList.add('force-light');
    }
    // 'system' does nothing, letting media queries handle it
}

// Initial Theme Application
// We need to wait for settings load now
