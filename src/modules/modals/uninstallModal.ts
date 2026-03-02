/**
 * uninstallModal.ts
 *
 * Uninstall Modal: Confirmation dialog that offers to export all account
 * settings before uninstalling the extension.
 */

import { getSettings, getAllAccounts } from '../../utils/storage';
import { buildExportPayload, generateExportFilename, triggerDownload } from '../../utils/importExport';
import { getUserEmail } from '../state';

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
    modal.querySelectorAll('.close-btn-action').forEach((btn) => {
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

        if (accounts.length === 0 && getUserEmail()) {
            accounts.push(getUserEmail()!);
        }

        for (const email of accounts) {
            const settings = await getSettings(email);
            const payload = buildExportPayload(email, settings.tabs);
            const json = JSON.stringify(payload, null, 2);
            const filename = generateExportFilename(email);
            await triggerDownload(filename, json);
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
