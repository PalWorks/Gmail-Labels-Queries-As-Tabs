/**
 * tabListRenderer.ts
 *
 * Shared tab list rendering logic used by both the Gmail overlay
 * settings modal (modals.ts) and the options page (options.ts).
 *
 * Creates draggable list items with action buttons. Callers provide
 * callback functions for remove/move actions and remain responsible
 * for attaching their own drag-and-drop implementations.
 */

import { Tab } from './storage';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TabListCallbacks {
    onRemove: (tabId: string, index: number) => void;
    onMoveUp?: (index: number) => void;
    onMoveDown?: (index: number) => void;
}

export interface TabListOptions {
    /** Message shown when the tabs array is empty */
    emptyMessage?: string;
}

// ---------------------------------------------------------------------------
// Drag Handle SVG (shared constant)
// ---------------------------------------------------------------------------

const DRAG_HANDLE_SVG =
    '<svg viewBox="0 0 24 24"><path d="M11 18c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2zm-2-8c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0-6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm6 4c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/></svg>';

// ---------------------------------------------------------------------------
// HTML Escaping
// ---------------------------------------------------------------------------

/**
 * Escape HTML special characters to prevent XSS in template literals.
 */
export function escapeHtml(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------

/**
 * Render tab list items into a container element.
 *
 * Creates `<li>` elements with:
 *   - `draggable="true"`, `data-index`, `data-tab-id`
 *   - Drag handle, title + type label, up/down/remove action buttons
 *   - Click handlers wired to the provided callbacks
 *
 * Callers remain responsible for attaching drag-and-drop event listeners
 * to the created `<li>` elements (since modal and options page use
 * different drag implementations).
 */
export function renderTabListItems(
    container: HTMLElement,
    tabs: Tab[],
    callbacks: TabListCallbacks,
    options?: TabListOptions
): void {
    container.innerHTML = '';

    if (tabs.length === 0) {
        const emptyMsg = options?.emptyMessage || 'No tabs configured. Add one above!';
        container.innerHTML = `<li class="muted">${escapeHtml(emptyMsg)}</li>`;
        return;
    }

    tabs.forEach((tab, index) => {
        const li = document.createElement('li');
        li.setAttribute('draggable', 'true');
        li.dataset.index = index.toString();
        li.dataset.tabId = tab.id;

        // Build action buttons
        const upBtn = index > 0 ? `<button class="tab-action-btn up-btn" title="Move up">\u2191</button>` : '';
        const downBtn =
            index < tabs.length - 1 ? `<button class="tab-action-btn down-btn" title="Move down">\u2193</button>` : '';
        const removeBtn = `<button class="tab-action-btn remove-btn" title="Remove">\u2715</button>`;

        li.innerHTML = `
            <div class="drag-handle" title="Drag to reorder">
                ${DRAG_HANDLE_SVG}
            </div>
            <span class="tab-info-text">${escapeHtml(tab.title)} <small class="tab-type-hint">(${tab.type === 'hash' ? 'Custom' : 'Label'})</small></span>
            <div class="tab-actions">
                ${upBtn}
                ${downBtn}
                ${removeBtn}
            </div>
        `;

        // Wire callbacks
        li.querySelector('.remove-btn')?.addEventListener('click', () => {
            callbacks.onRemove(tab.id, index);
        });

        if (callbacks.onMoveUp) {
            li.querySelector('.up-btn')?.addEventListener('click', () => {
                callbacks.onMoveUp!(index);
            });
        }

        if (callbacks.onMoveDown) {
            li.querySelector('.down-btn')?.addEventListener('click', () => {
                callbacks.onMoveDown!(index);
            });
        }

        container.appendChild(li);
    });
}
