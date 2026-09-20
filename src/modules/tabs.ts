/**
 * tabs.ts
 *
 * Tab rendering, navigation, dropdown menus, and active tab highlighting.
 * This is the visual layer for the tab bar.
 */

import { Tab } from '../utils/storage';
import { isValidTabColor, tabColorClass } from '../utils/colors';
import { TABS_BAR_ID, getAppSettings } from './state';
import { updateUnreadCount } from './unread';
import {
    isMoveMode,
    setMoveMode,
    handleDragStart,
    handleDragOver,
    handleDragEnter,
    handleDragLeave,
    createHandleDrop,
    handleDragEnd,
} from './dragdrop';

// ---------------------------------------------------------------------------
// Module State
// ---------------------------------------------------------------------------

let activeDropdown: HTMLElement | null = null;

// Callbacks injected by content.ts to avoid circular deps
let _showPinModal: () => void;
let _showEditModal: (tab: Tab) => void;
let _showDeleteModal: (tab: Tab) => void;
let _toggleSettingsModal: () => void;

export function setModalCallbacks(callbacks: {
    showPinModal: () => void;
    showEditModal: (tab: Tab) => void;
    showDeleteModal: (tab: Tab) => void;
    toggleSettingsModal: () => void;
}): void {
    _showPinModal = callbacks.showPinModal;
    _showEditModal = callbacks.showEditModal;
    _showDeleteModal = callbacks.showDeleteModal;
    _toggleSettingsModal = callbacks.toggleSettingsModal;
}

// ---------------------------------------------------------------------------
// Tab Bar Creation
// ---------------------------------------------------------------------------

/**
 * Create the container element for the tab bar.
 */
export function createTabsBar(): HTMLElement {
    const bar = document.createElement('div');
    bar.id = TABS_BAR_ID;
    bar.className = 'gmail-tabs-bar';
    bar.setAttribute('role', 'toolbar');
    bar.setAttribute('aria-label', 'Gmail tabs');
    return bar;
}

// ---------------------------------------------------------------------------
// Accessibility helpers
// ---------------------------------------------------------------------------

/** Add button-like keyboard activation (Enter / Space) to a non-button element. */
function activateOnKey(el: HTMLElement, handler: (e: KeyboardEvent) => void): void {
    el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
            e.preventDefault();
            handler(e);
        }
    });
}

/** Navigate to a tab's target view (shared by mouse click and keyboard). */
function navigateToTab(tab: Tab): void {
    if (tab.type === 'label') {
        const encoded = encodeURIComponent(tab.value).replace(/%20/g, '+');
        window.location.hash = `#label/${encoded}`;
    } else if (tab.type === 'hash') {
        window.location.hash = tab.value;
    }
    updateActiveTab();
}

/** Move keyboard focus to the previous/next tab name for arrow-key navigation. */
function focusAdjacentTabName(current: HTMLElement, dir: 1 | -1): void {
    const bar = document.getElementById(TABS_BAR_ID);
    if (!bar) return;
    const names = Array.from(bar.querySelectorAll<HTMLElement>('.tab-name'));
    const idx = names.indexOf(current);
    if (idx === -1) return;
    const next = names[idx + dir];
    if (next) next.focus();
}

// ---------------------------------------------------------------------------
// Tab Rendering
// ---------------------------------------------------------------------------

function handleMoveModeKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
        setMoveMode(false);
        renderTabs();
        document.removeEventListener('keydown', handleMoveModeKeydown);
    }
}

/**
 * Render all tabs into the tab bar based on current settings.
 */
export function renderTabs(): void {
    const bar = document.getElementById(TABS_BAR_ID);
    if (!bar || !getAppSettings()) return;
    bar.innerHTML = '';

    const handleDrop = createHandleDrop(renderTabs);

    if (isMoveMode) {
        bar.classList.add('move-mode');
        document.addEventListener('keydown', handleMoveModeKeydown);
    } else {
        bar.classList.remove('move-mode');
        document.removeEventListener('keydown', handleMoveModeKeydown);
    }

    getAppSettings()!.tabs.forEach((tab, index) => {
        const tabEl = document.createElement('div');
        tabEl.className = 'gmail-tab';
        if (isValidTabColor(tab.color)) tabEl.classList.add(tabColorClass(tab.color));
        tabEl.setAttribute('draggable', isMoveMode ? 'true' : 'false');
        tabEl.dataset.index = index.toString();
        tabEl.dataset.value = tab.value;
        tabEl.dataset.type = tab.type;

        // Drag Handle
        const dragHandle = document.createElement('div');
        dragHandle.className = 'tab-drag-handle';
        dragHandle.title = 'Drag to reorder';
        dragHandle.innerHTML =
            '<svg viewBox="0 0 24 24"><path d="M11 18c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2zm-2-8c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0-6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm6 4c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/></svg>';
        tabEl.appendChild(dragHandle);

        const nameSpan = document.createElement('span');
        nameSpan.className = 'tab-name';
        nameSpan.textContent = tab.title;
        // Make the tab name the keyboard-focusable activation target.
        nameSpan.setAttribute('role', 'button');
        nameSpan.setAttribute('tabindex', '0');
        nameSpan.setAttribute('aria-label', tab.title);
        nameSpan.addEventListener('keydown', (e) => {
            if (isMoveMode) return;
            if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
                e.preventDefault();
                navigateToTab(tab);
            } else if (e.key === 'ArrowRight') {
                e.preventDefault();
                focusAdjacentTabName(nameSpan, 1);
            } else if (e.key === 'ArrowLeft') {
                e.preventDefault();
                focusAdjacentTabName(nameSpan, -1);
            }
        });
        tabEl.appendChild(nameSpan);

        // Unread Count
        if (getAppSettings() && getAppSettings()!.showUnreadCount) {
            const countSpan = document.createElement('span');
            countSpan.className = 'unread-count';
            countSpan.textContent = '';
            tabEl.appendChild(countSpan);

            updateUnreadCount(tab, tabEl);
        }

        // Menu Button (Chevron)
        const menuBtn = document.createElement('div');
        menuBtn.className = 'gmail-tab-menu-btn';
        menuBtn.innerHTML =
            '<svg viewBox="0 0 24 24"><path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"/></svg>';
        menuBtn.title = 'Tab Options';
        menuBtn.setAttribute('role', 'button');
        menuBtn.setAttribute('tabindex', '0');
        menuBtn.setAttribute('aria-haspopup', 'menu');
        menuBtn.setAttribute('aria-expanded', 'false');
        menuBtn.setAttribute('aria-label', `Options for ${tab.title}`);
        menuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleDropdown(tab, menuBtn);
        });
        activateOnKey(menuBtn, () => toggleDropdown(tab, menuBtn));
        tabEl.appendChild(menuBtn);

        tabEl.addEventListener('click', (e) => {
            if (
                (e.target as HTMLElement).closest('.gmail-tab-menu-btn') ||
                (e.target as HTMLElement).closest('.tab-drag-handle') ||
                isMoveMode
            ) {
                return;
            }

            navigateToTab(tab);
        });

        // Drag Events
        tabEl.addEventListener('dragstart', handleDragStart);
        tabEl.addEventListener('dragenter', handleDragEnter);
        tabEl.addEventListener('dragover', handleDragOver);
        tabEl.addEventListener('dragleave', handleDragLeave);
        tabEl.addEventListener('drop', handleDrop);
        tabEl.addEventListener('dragend', handleDragEnd);

        bar.appendChild(tabEl);
    });

    // "Save View" Button
    const saveViewBtn = document.createElement('div');
    saveViewBtn.className = 'gmail-tab-btn save-view-btn';
    saveViewBtn.innerHTML =
        '<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5 11h-4v4h-2v-4H7v-2h4V7h2v4h4v2z"/></svg>';
    saveViewBtn.title = 'Save Current View as Tab';
    saveViewBtn.setAttribute('role', 'button');
    saveViewBtn.setAttribute('tabindex', '0');
    saveViewBtn.setAttribute('aria-label', 'Save current view as tab');
    saveViewBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        _showPinModal();
    });
    activateOnKey(saveViewBtn, () => _showPinModal());
    bar.appendChild(saveViewBtn);

    // "Manage Tabs" Button
    const manageBtn = document.createElement('div');
    manageBtn.className = 'gmail-tab-btn manage-btn';
    manageBtn.innerHTML =
        '<svg viewBox="0 0 24 24"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>';
    manageBtn.title = 'Manage Tabs';
    manageBtn.setAttribute('role', 'button');
    manageBtn.setAttribute('tabindex', '0');
    manageBtn.setAttribute('aria-label', 'Manage tabs and settings');
    manageBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        _toggleSettingsModal();
    });
    activateOnKey(manageBtn, () => _toggleSettingsModal());
    bar.appendChild(manageBtn);

    // Done Button (Move Mode only)
    if (isMoveMode) {
        const doneBtn = document.createElement('button');
        doneBtn.className = 'done-btn';
        doneBtn.innerText = 'Done';
        doneBtn.addEventListener('click', () => {
            setMoveMode(false);
            renderTabs();
            document.removeEventListener('keydown', handleMoveModeKeydown);
        });
        bar.appendChild(doneBtn);
    }

    updateActiveTab();
}

// ---------------------------------------------------------------------------
// Dropdown Logic
// ---------------------------------------------------------------------------

/** Move roving focus within an open dropdown menu. */
function moveMenuFocus(items: HTMLElement[], dir: 1 | -1): void {
    const active = document.activeElement as HTMLElement;
    const idx = items.indexOf(active);
    const nextIdx = idx === -1 ? 0 : idx + dir;
    if (items[nextIdx]) items[nextIdx].focus();
}

function toggleDropdown(tab: Tab, triggerBtn: HTMLElement): void {
    if (activeDropdown) {
        activeDropdown.remove();
        activeDropdown = null;
        if (triggerBtn.classList.contains('active')) {
            triggerBtn.classList.remove('active');
            triggerBtn.setAttribute('aria-expanded', 'false');
            return;
        }
        document.querySelectorAll('.gmail-tab-menu-btn').forEach((b) => {
            b.classList.remove('active');
            b.setAttribute('aria-expanded', 'false');
        });
    }

    triggerBtn.classList.add('active');
    triggerBtn.setAttribute('aria-expanded', 'true');

    const rect = triggerBtn.getBoundingClientRect();
    const dropdown = document.createElement('div');
    dropdown.className = 'gmail-tab-dropdown show';

    const tabEl = triggerBtn.closest('.gmail-tab');
    if (tabEl) {
        const tabRect = tabEl.getBoundingClientRect();
        dropdown.style.top = `${tabRect.bottom + 4}px`;
        dropdown.style.left = `${tabRect.left}px`;
    } else {
        dropdown.style.top = `${rect.bottom + 4}px`;
        dropdown.style.left = `${rect.left}px`;
    }

    // Close Tab
    const closeItem = document.createElement('div');
    closeItem.className = 'gmail-tab-dropdown-item delete-item';
    closeItem.innerHTML =
        '<svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg> Close Tab';
    closeItem.addEventListener('click', () => {
        _showDeleteModal(tab);
        closeDropdown();
    });
    dropdown.appendChild(closeItem);

    // Edit Tab
    const editItem = document.createElement('div');
    editItem.className = 'gmail-tab-dropdown-item';
    editItem.innerHTML =
        '<svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg> Edit Tab';
    editItem.addEventListener('click', () => {
        _showEditModal(tab);
        closeDropdown();
    });
    dropdown.appendChild(editItem);

    // Move Tab
    const moveItem = document.createElement('div');
    moveItem.className = 'gmail-tab-dropdown-item';
    moveItem.innerHTML =
        '<svg viewBox="0 0 24 24"><path d="M10 9h4V6h3l-5-5-5 5h3v3zm-1 1H6V7l-5 5 5 5v-3h3v-4zm14 2l-5-5v3h-3v4h3v3l5-5zm-9 3h-4v3H7l5 5 5-5h-3v-3z"/></svg> Move Tab';
    moveItem.addEventListener('click', () => {
        setMoveMode(true);
        renderTabs();
        closeDropdown();
    });
    dropdown.appendChild(moveItem);

    // Menu semantics + keyboard operability.
    dropdown.setAttribute('role', 'menu');
    const items = Array.from(dropdown.querySelectorAll<HTMLElement>('.gmail-tab-dropdown-item'));
    items.forEach((item) => {
        item.setAttribute('role', 'menuitem');
        item.setAttribute('tabindex', '0');
        activateOnKey(item, () => item.click());
    });
    dropdown.addEventListener('keydown', (ev) => {
        if (ev.key === 'Escape') {
            closeDropdown();
            triggerBtn.focus();
        } else if (ev.key === 'ArrowDown') {
            ev.preventDefault();
            moveMenuFocus(items, 1);
        } else if (ev.key === 'ArrowUp') {
            ev.preventDefault();
            moveMenuFocus(items, -1);
        }
    });

    document.body.appendChild(dropdown);
    activeDropdown = dropdown;
    items[0]?.focus();

    setTimeout(() => {
        document.addEventListener('click', closeDropdownOutside);
    }, 0);
}

function closeDropdown(): void {
    if (activeDropdown) {
        activeDropdown.remove();
        activeDropdown = null;
    }
    document.querySelectorAll('.gmail-tab-menu-btn').forEach((b) => {
        b.classList.remove('active');
        b.setAttribute('aria-expanded', 'false');
    });
    document.removeEventListener('click', closeDropdownOutside);
}

function closeDropdownOutside(e: MouseEvent): void {
    if (activeDropdown && !activeDropdown.contains(e.target as Node)) {
        closeDropdown();
    }
}

// ---------------------------------------------------------------------------
// Active Tab Highlighting
// ---------------------------------------------------------------------------

/**
 * Highlight the active tab based on the current URL hash.
 */
export function updateActiveTab(): void {
    const hash = window.location.hash;
    const bar = document.getElementById(TABS_BAR_ID);
    if (!bar) return;

    const tabs = bar.querySelectorAll('.gmail-tab');
    tabs.forEach((t) => {
        const tabEl = t as HTMLElement;
        const tabValue = tabEl.dataset.value;
        const tabType = tabEl.dataset.type;
        if (!tabValue) return;

        let isActive = false;

        if (tabType === 'hash') {
            isActive = hash === tabValue;
        } else {
            const cleanHash = decodeURIComponent(hash.replace('#label/', '').replace(/\+/g, ' '));
            isActive =
                cleanHash === tabValue || hash.includes(`#label/${encodeURIComponent(tabValue).replace(/%20/g, '+')}`);
        }

        const nameSpan = tabEl.querySelector('.tab-name');
        if (isActive) {
            tabEl.classList.add('active');
            nameSpan?.setAttribute('aria-current', 'page');
        } else {
            tabEl.classList.remove('active');
            nameSpan?.removeAttribute('aria-current');
        }
    });
}
