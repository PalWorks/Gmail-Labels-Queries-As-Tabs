/**
 * importModal.ts
 *
 * Import Modal: Provides JSON file upload and paste interface for importing
 * tab configurations. Also contains exportSettings() for single-account export.
 */

import { getSettings, updateTabOrder } from '../../utils/storage';
import {
    buildExportPayload,
    generateExportFilename,
    validateImportData,
    triggerDownload,
} from '../../utils/importExport';
import { getUserEmail, setAppSettings } from '../state';
import { getRenderCallback } from './index';

export async function exportSettings(): Promise<void> {
    console.log('Gmail Tabs: Exporting settings...');
    if (!getUserEmail()) {
        console.error('Gmail Tabs: Export failed, no currentUserEmail');
        alert('Error: Could not detect user email.');
        return;
    }
    const settings = await getSettings(getUserEmail()!);
    const payload = buildExportPayload(getUserEmail()!, settings.tabs);
    const json = JSON.stringify(payload, null, 2);
    const filename = generateExportFilename(getUserEmail()!);

    try {
        const result = await triggerDownload(filename, json);
        if (result.success) {
            console.log('Gmail Tabs: Download initiated successfully', result.downloadId);
        } else {
            console.error('Gmail Tabs: Download failed', result.error);
            alert('Failed to download file: ' + (result.error || 'Unknown error'));
        }
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
    modal.querySelectorAll('.close-btn, .close-btn-action').forEach((btn) => {
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
                    setTimeout(() => (fileBtn.textContent = '📂 Select JSON File'), 3000);
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
            validateImportData(data);

            if (data.email && getUserEmail() && data.email !== getUserEmail()) {
                alert(
                    `Error: This configuration belongs to "${data.email}" but you are connected as "${getUserEmail()}". Import rejected.`
                );
                return;
            }

            if (getUserEmail() && confirm('This will replace your current tabs. Are you sure?')) {
                await updateTabOrder(getUserEmail()!, data.tabs);
                setAppSettings(await getSettings(getUserEmail()!));
                getRenderCallback()();
                close();
                alert('Configuration imported successfully!');
            }
        } catch (e: any) {
            alert('Error importing: ' + e.message);
        }
    });
}
