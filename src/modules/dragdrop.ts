/**
 * dragdrop.ts
 *
 * Drag-and-drop handlers for both the tab bar and the settings modal list.
 * Manages tab reordering via drag events.
 */

import { updateTabOrder, getSettings } from '../utils/storage';
import { getAppSettings, getUserEmail, setAppSettings, setAppTabs } from './state';
import { reportSettingsWriteFailure } from './modals/contextNotice';

// ---------------------------------------------------------------------------
// Tab Bar Drag State
// ---------------------------------------------------------------------------

let dragSrcEl: HTMLElement | null = null;
export let isMoveMode = false;

export function setMoveMode(value: boolean): void {
    isMoveMode = value;
}

// ---------------------------------------------------------------------------
// Tab Bar Drag Handlers
// ---------------------------------------------------------------------------

export function handleDragStart(this: HTMLElement, e: DragEvent): void {
    dragSrcEl = this;
    this.classList.add('dragging');
    if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', this.dataset.index || '');
    }
    document.addEventListener('dragover', handleSmartDragOver);
    document.addEventListener('drop', handleSmartDrop);
}

/**
 * Only a drag we started is a reorder. Text, a link or a file dragged in from
 * elsewhere has no source tab, and accepting it (preventDefault here is what
 * tells the browser a drop is allowed) made the drop handler dereference a
 * null source and throw.
 */
export function handleDragOver(this: HTMLElement, e: DragEvent): boolean {
    if (!dragSrcEl) return true;
    if (e.preventDefault) {
        e.preventDefault();
    }
    if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'move';
    }

    const rect = this.getBoundingClientRect();
    const relX = e.clientX - rect.left;
    const width = rect.width;

    this.classList.remove('drop-before', 'drop-after');

    if (relX < width / 2) {
        this.classList.add('drop-before');
    } else {
        this.classList.add('drop-after');
    }

    return false;
}

export function handleDragEnter(this: HTMLElement, _e: DragEvent): void {
    this.classList.add('drag-over');
}

export function handleDragLeave(this: HTMLElement, e: DragEvent): void {
    if (this.contains(e.relatedTarget as Node)) return;
    this.classList.remove('drag-over', 'drop-before', 'drop-after');
}

/**
 * Handle drop on a tab element. Reorders tabs and persists.
 * Requires renderTabs callback to refresh the UI.
 */
export function createHandleDrop(renderTabs: () => void) {
    return async function handleDrop(this: HTMLElement, e: DragEvent): Promise<boolean> {
        const source = dragSrcEl;
        if (!source) return true;

        // Ours: stop the browser from also treating the drop as navigation.
        if (e.preventDefault) {
            e.preventDefault();
        }
        if (e.stopPropagation) {
            e.stopPropagation();
        }

        const dropPosition = this.classList.contains('drop-before') ? 'before' : 'after';
        this.classList.remove('drag-over', 'drop-before', 'drop-after');

        if (source !== this) {
            const oldIndex = parseInt(source.dataset.index || '0');
            let newIndex = parseInt(this.dataset.index || '0');

            if (dropPosition === 'after') {
                newIndex++;
            }

            if (getAppSettings() && getUserEmail()) {
                const tabs = [...getAppSettings()!.tabs];
                const [movedTab] = tabs.splice(oldIndex, 1);

                if (oldIndex < newIndex) {
                    newIndex--;
                }

                tabs.splice(newIndex, 0, movedTab);

                const previous = getAppSettings()!.tabs;
                setAppTabs(tabs);
                // The re-render removes the dragged element, so its dragend
                // may never fire. Finish the drag here instead.
                endTabDrag();
                renderTabs();

                try {
                    await updateTabOrder(getUserEmail()!, tabs);
                } catch (error) {
                    // Put the bar back as it is stored, so what is on screen
                    // is not an order that will vanish on the next reload.
                    setAppTabs(previous);
                    renderTabs();
                    reportSettingsWriteFailure(error);
                }
                return false;
            }
        }
        endTabDrag();
        return false;
    };
}

/** The dragend clean-up, callable from a drop that re-renders the bar. */
function endTabDrag(): void {
    dragSrcEl = null;
    document.querySelectorAll('.gmail-tab').forEach((item) => {
        item.classList.remove('drag-over', 'dragging', 'drop-before', 'drop-after');
    });
    document.removeEventListener('dragover', handleSmartDragOver);
    document.removeEventListener('drop', handleSmartDrop);
}

export function handleDragEnd(this: HTMLElement, _e: DragEvent): void {
    endTabDrag();
}

// ---------------------------------------------------------------------------
// Smart Global Drag Handlers (for multi-row tab bars)
// ---------------------------------------------------------------------------

function handleSmartDragOver(e: DragEvent): void {
    e.preventDefault();
    if (!dragSrcEl) return;

    const tabs = Array.from(document.querySelectorAll('.gmail-tab')) as HTMLElement[];
    if (tabs.length === 0) return;

    // Group tabs by rows
    const rows: { top: number; bottom: number; tabs: HTMLElement[] }[] = [];

    tabs.forEach((tab) => {
        const rect = tab.getBoundingClientRect();
        const row = rows.find((r) => Math.abs(r.top - rect.top) < 10);
        if (row) {
            row.tabs.push(tab);
            row.bottom = Math.max(row.bottom, rect.bottom);
        } else {
            rows.push({ top: rect.top, bottom: rect.bottom, tabs: [tab] });
        }
    });

    // Determine target row
    const clientY = e.clientY;
    let targetRowIndex = -1;

    if (clientY < rows[0].top) {
        targetRowIndex = 0;
    } else if (clientY > rows[rows.length - 1].bottom) {
        targetRowIndex = rows.length - 1;
    } else {
        let minDist = Number.POSITIVE_INFINITY;
        rows.forEach((row, index) => {
            const rowCenter = row.top + (row.bottom - row.top) / 2;
            const dist = Math.abs(clientY - rowCenter);
            if (dist < minDist) {
                minDist = dist;
                targetRowIndex = index;
            }
        });
    }

    if (targetRowIndex === -1) return;

    const targetRow = rows[targetRowIndex];

    // Determine target tab in row
    const clientX = e.clientX;
    let closestTab: { element: HTMLElement; dist: number; offset: number } = {
        element: targetRow.tabs[0],
        dist: Number.POSITIVE_INFINITY,
        offset: 0,
    };

    targetRow.tabs.forEach((tab) => {
        const rect = tab.getBoundingClientRect();
        const tabCenter = rect.left + rect.width / 2;
        const dist = Math.abs(clientX - tabCenter);
        const offset = clientX - tabCenter;

        if (dist < closestTab.dist) {
            closestTab = { element: tab, dist, offset };
        }
    });

    tabs.forEach((t) => t.classList.remove('drop-before', 'drop-after'));

    if (closestTab.element && closestTab.element !== dragSrcEl) {
        if (closestTab.offset < 0) {
            closestTab.element.classList.add('drop-before');
        } else {
            closestTab.element.classList.add('drop-after');
        }
    }
}

function handleSmartDrop(e: DragEvent): void {
    e.preventDefault();
    e.stopPropagation();

    const targetTab = document.querySelector('.gmail-tab.drop-before, .gmail-tab.drop-after') as HTMLElement;

    if (targetTab && dragSrcEl && dragSrcEl !== targetTab) {
        const dropPosition = targetTab.classList.contains('drop-before') ? 'before' : 'after';
        const oldIndex = parseInt(dragSrcEl.dataset.index || '0');
        let newIndex = parseInt(targetTab.dataset.index || '0');

        if (dropPosition === 'after') {
            newIndex++;
        }

        document.querySelectorAll('.gmail-tab').forEach((item) => {
            item.classList.remove('drag-over', 'dragging', 'drop-before', 'drop-after');
        });
        document.removeEventListener('dragover', handleSmartDragOver);
        document.removeEventListener('drop', handleSmartDrop);

        if (getAppSettings() && getUserEmail()) {
            const tabs = [...getAppSettings()!.tabs];
            const [movedTab] = tabs.splice(oldIndex, 1);

            if (oldIndex < newIndex) {
                newIndex--;
            }

            tabs.splice(newIndex, 0, movedTab);

            setAppTabs(tabs);
            // We need to call renderTabs but we don't have a direct reference here.
            // The smart drop handler needs to trigger a re-render.
            // We'll dispatch a custom event that content.ts listens for.
            updateTabOrder(getUserEmail()!, tabs).catch(reportSettingsWriteFailure);
            document.dispatchEvent(new CustomEvent('gmailTabs:rerender'));
        }
    }
    dragSrcEl = null;
}

// ---------------------------------------------------------------------------
// Modal List Drag Handlers
// ---------------------------------------------------------------------------

export interface ModalDragHandlers {
    handleModalDragStart: (this: HTMLElement, e: DragEvent) => void;
    handleModalDragOver: (this: HTMLElement, e: DragEvent) => boolean;
    handleModalDragEnter: (this: HTMLElement) => void;
    handleModalDragLeave: (this: HTMLElement) => void;
    handleModalDrop: (this: HTMLElement, e: DragEvent) => Promise<boolean>;
    handleModalDragEnd: (this: HTMLElement) => void;
}

/**
 * Create modal list drag-and-drop handlers.
 * @param list - The <ul> element for the tab list
 * @param refreshList - Callback to refresh the list after reorder
 * @param renderTabs - Callback to re-render the tab bar
 */
export function createModalDragHandlers(
    list: HTMLUListElement,
    refreshList: () => void,
    renderTabs: () => void,
    onError: (error: unknown) => void = reportSettingsWriteFailure
): ModalDragHandlers {
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
        // Not our drag: do not offer to accept it.
        if (!modalDragSrcEl) return true;
        if (e.preventDefault) {
            e.preventDefault();
        }
        if (e.dataTransfer) {
            e.dataTransfer.dropEffect = 'move';
        }

        const rect = this.getBoundingClientRect();
        const relY = e.clientY - rect.top;
        const height = rect.height;

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
        const source = modalDragSrcEl;
        if (!source) return true;

        if (e.preventDefault) {
            e.preventDefault();
        }
        if (e.stopPropagation) {
            e.stopPropagation();
        }

        const dropPosition = this.classList.contains('drop-above') ? 'above' : 'below';
        this.classList.remove('drag-over', 'drop-above', 'drop-below');
        // refreshList() rebuilds the list and removes the dragged row, so
        // its dragend may never fire.
        modalDragSrcEl = null;

        if (source !== this) {
            const oldIndex = parseInt(source.dataset.index || '0');
            let newIndex = parseInt(this.dataset.index || '0');

            if (dropPosition === 'below') {
                newIndex++;
            }

            if (getUserEmail()) {
                try {
                    const settings = await getSettings(getUserEmail()!);
                    const newTabs = [...settings.tabs];
                    const [movedTab] = newTabs.splice(oldIndex, 1);

                    if (oldIndex < newIndex) {
                        newIndex--;
                    }

                    newTabs.splice(newIndex, 0, movedTab);

                    await updateTabOrder(getUserEmail()!, newTabs);
                    refreshList();
                    setAppSettings(await getSettings(getUserEmail()!));
                    renderTabs();
                } catch (error) {
                    // A drop handler's promise goes nowhere, so this is the
                    // only place the failure can be reported.
                    onError(error);
                }
            }
        }
        return false;
    };

    const handleModalDragEnd = function (this: HTMLElement) {
        modalDragSrcEl = null;
        list.querySelectorAll('li').forEach((item) => {
            item.classList.remove('drag-over', 'dragging', 'drop-above', 'drop-below');
        });
    };

    return {
        handleModalDragStart,
        handleModalDragOver,
        handleModalDragEnter,
        handleModalDragLeave,
        handleModalDrop,
        handleModalDragEnd,
    };
}
