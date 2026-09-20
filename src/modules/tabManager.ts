/**
 * tabManager.ts
 *
 * Surface-agnostic behavior for managing the user's tab list, shared by both the
 * in-Gmail settings modal and the standalone options page. Centralizing the
 * add-tab input parsing, list rendering, reorder/remove wiring, and drag-and-drop
 * attachment here keeps the two surfaces from drifting apart.
 *
 * Markup, copy, and feedback remain the responsibility of each surface; only the
 * behavior lives here.
 */

import { Tab, removeTab, updateTab, updateTabOrder } from '../utils/storage';
import { renderTabListItems, TabListCallbacks, TabListOptions } from '../utils/tabListRenderer';
import { openColorPopover } from './colorPicker';
import { createModalDragHandlers, ModalDragHandlers } from './dragdrop';

// ---------------------------------------------------------------------------
// Add-tab input parsing (pure)
// ---------------------------------------------------------------------------

/** True when the raw input looks like a URL or hash route rather than a bare label. */
export function isUrlLikeInput(raw: string): boolean {
    return raw.includes('http') || raw.includes('mail.google.com') || raw.startsWith('#');
}

/** Derive a human title from a Gmail search/label hash, or '' when none applies. */
export function deriveTitleFromUrl(raw: string): string {
    if (raw.includes('#search/')) {
        return decodeURIComponent(raw.split('#search/')[1] || '').replace(/\+/g, ' ');
    }
    if (raw.includes('#label/')) {
        return decodeURIComponent(raw.split('#label/')[1] || '').replace(/\+/g, ' ');
    }
    return '';
}

export interface ParsedTabInput {
    type: 'label' | 'hash';
    value: string;
}

/**
 * Parse a raw add-tab input into a normalized { type, value }.
 * URL/hash inputs become 'hash' tabs (keeping only the hash portion); anything
 * else becomes a 'label' tab, tolerating a leading "label:" operator.
 */
export function parseTabInput(raw: string): ParsedTabInput {
    const value = raw.trim();
    if (isUrlLikeInput(value)) {
        const finalValue = value.includes('#') ? '#' + value.split('#')[1] : value;
        return { type: 'hash', value: finalValue };
    }
    const finalValue = value.toLowerCase().startsWith('label:') ? value.substring(6).trim() : value;
    return { type: 'label', value: finalValue };
}

// ---------------------------------------------------------------------------
// Tab list rendering + reorder/remove + drag wiring
// ---------------------------------------------------------------------------

export interface ManagedTabListDeps {
    listEl: HTMLElement;
    tabs: Tab[];
    getAccountId: () => string | null;
    /** Refresh all affected UI after a mutation (remove/reorder). */
    reRender: () => void | Promise<void>;
    /** Re-render the Gmail tab bar (no-op on the options page). */
    renderTabBar: () => void;
    /**
     * Render a per-row color picker trigger. Only the options page opts in; the
     * in-Gmail overlay exposes color editing through the Edit Tab modal instead,
     * so it leaves this off to avoid a redundant surface (and the popover's
     * window-scroll positioning, which is only correct outside Gmail's overlay).
     */
    enableColorPicker?: boolean;
    listOptions?: TabListOptions;
}

/** Attach drag-and-drop listeners to each draggable <li> in the list. */
export function wireTabListDragListeners(listEl: HTMLElement, handlers: ModalDragHandlers): void {
    listEl.querySelectorAll<HTMLElement>('li[draggable]').forEach((li) => {
        li.addEventListener('dragstart', handlers.handleModalDragStart as EventListener);
        li.addEventListener('dragover', handlers.handleModalDragOver as unknown as EventListener);
        li.addEventListener('dragenter', handlers.handleModalDragEnter as EventListener);
        li.addEventListener('dragleave', handlers.handleModalDragLeave as EventListener);
        li.addEventListener('drop', handlers.handleModalDrop as unknown as EventListener);
        li.addEventListener('dragend', handlers.handleModalDragEnd as EventListener);
    });
}

/**
 * Render the managed tab list into `listEl`: draw items, wire remove/move
 * actions (persisting via storage), and attach drag-and-drop. After any mutation
 * it invokes `reRender` so the caller can refresh dependent UI (and re-run this
 * function with fresh tabs).
 */
export function renderManagedTabList(deps: ManagedTabListDeps): void {
    const { listEl, tabs, getAccountId, reRender, renderTabBar, enableColorPicker, listOptions } = deps;

    const callbacks: TabListCallbacks = {
        onRemove: async (tabId) => {
            const account = getAccountId();
            if (!account) return;
            await removeTab(account, tabId);
            await reRender();
        },
        onMoveUp: async (index) => {
            const account = getAccountId();
            if (!account || index <= 0) return;
            const reordered = [...tabs];
            [reordered[index - 1], reordered[index]] = [reordered[index], reordered[index - 1]];
            await updateTabOrder(account, reordered);
            await reRender();
        },
        onMoveDown: async (index) => {
            const account = getAccountId();
            if (!account || index >= tabs.length - 1) return;
            const reordered = [...tabs];
            [reordered[index + 1], reordered[index]] = [reordered[index], reordered[index + 1]];
            await updateTabOrder(account, reordered);
            await reRender();
        },
    };

    if (enableColorPicker) {
        callbacks.onColorTrigger = (tab, anchor) => {
            openColorPopover(anchor, tab.color, async (color) => {
                const account = getAccountId();
                if (!account) return;
                await updateTab(account, tab.id, { color });
                await reRender();
            });
        };
    }

    renderTabListItems(listEl, tabs, callbacks, listOptions);

    const dragHandlers = createModalDragHandlers(listEl as HTMLUListElement, () => reRender(), renderTabBar);
    wireTabListDragListeners(listEl, dragHandlers);
}
