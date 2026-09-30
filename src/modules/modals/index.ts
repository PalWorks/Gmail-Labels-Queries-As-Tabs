/**
 * modals/index.ts
 *
 * Barrel file for all modal dialogs. Owns the shared _renderTabs callback
 * that individual modal files invoke after settings mutations.
 */

// Re-export individual modals
export { showPinModal } from './pinModal';
export { showEditModal } from './editModal';
export { showDeleteModal } from './deleteModal';
export { toggleSettingsModal } from './settingsModal';
export { reportSettingsWriteFailure } from './contextNotice';

// Shared render callback injected by content.ts
let _renderTabs: () => void;

export function setRenderCallback(renderTabs: () => void): void {
    _renderTabs = renderTabs;
}

export function getRenderCallback(): () => void {
    return _renderTabs;
}
