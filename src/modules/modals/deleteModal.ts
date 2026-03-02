/**
 * deleteModal.ts
 *
 * Delete Modal: Confirmation dialog for removing a tab from the tab bar.
 */

import { Tab, getSettings, removeTab } from '../../utils/storage';
import { getUserEmail, setAppSettings } from '../state';
import { getRenderCallback } from './index';

export function showDeleteModal(tab: Tab): void {
    const modal = document.createElement('div');
    modal.className = 'gmail-tabs-modal';

    const content = document.createElement('div');
    content.className = 'modal-content delete-tab-modal';

    const body = document.createElement('div');
    body.className = 'modal-body';
    body.style.cssText = 'text-align: center; padding: 32px;';

    const iconWrapper = document.createElement('div');
    iconWrapper.className = 'delete-icon-wrapper';
    iconWrapper.innerHTML =
        '<svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>';

    const h3 = document.createElement('h3');
    h3.style.cssText = 'margin: 16px 0 8px 0; font-size: 20px; font-weight: 500;';
    h3.textContent = 'Remove Tab?';

    const p = document.createElement('p');
    p.style.cssText = 'color: var(--gmail-tab-text); margin-bottom: 24px; font-size: 14px; line-height: 1.5;';
    p.textContent = 'This will remove ';
    const strong = document.createElement('strong');
    strong.textContent = `"${tab.title}"`;
    p.appendChild(strong);
    p.appendChild(document.createTextNode(' from your tab bar.'));

    const actions = document.createElement('div');
    actions.className = 'modal-actions';
    actions.style.cssText = 'justify-content: center; gap: 12px; margin-top: 0;';
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'secondary-btn close-btn-action';
    cancelBtn.textContent = 'Cancel';
    const confirmBtn = document.createElement('button');
    confirmBtn.id = 'delete-confirm-btn';
    confirmBtn.className = 'primary-btn danger-btn';
    confirmBtn.textContent = 'Remove';
    actions.append(cancelBtn, confirmBtn);

    body.append(iconWrapper, h3, p, actions);
    content.appendChild(body);
    modal.appendChild(content);

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

    modal.querySelector('#delete-confirm-btn')?.addEventListener('click', async () => {
        if (getUserEmail()) {
            await removeTab(getUserEmail()!, tab.id);
            close();
            setAppSettings(await getSettings(getUserEmail()!));
            getRenderCallback()();
        } else {
            console.error('Gmail Tabs: Cannot delete, currentUserEmail is null');
        }
    });
}
