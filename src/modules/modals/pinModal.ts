/**
 * pinModal.ts
 *
 * Pin Modal: Allows users to pin the current Gmail view (label, search, etc.)
 * as a new tab in the tab bar.
 */

import { addTab, getSettings } from '../../utils/storage';
import { getUserEmail, setAppSettings } from '../state';
import { getRenderCallback } from './index';

export function showPinModal(): void {
    const currentHash = window.location.hash;
    if (!currentHash || currentHash === '#inbox') {
        alert('Cannot pin the Inbox. Navigate to a label or search first.');
        return;
    }

    const modal = document.createElement('div');
    modal.className = 'gmail-tabs-modal';

    let suggestedTitle = 'New Tab';
    if (currentHash.startsWith('#label/')) {
        suggestedTitle = decodeURIComponent(currentHash.replace('#label/', '')).replace(/\+/g, ' ');
    } else if (currentHash.startsWith('#search/')) {
        suggestedTitle = 'Search: ' + decodeURIComponent(currentHash.replace('#search/', '')).replace(/\+/g, ' ');
    } else if (currentHash.startsWith('#advanced-search/')) {
        suggestedTitle = 'Advanced Search';
    }

    const content = document.createElement('div');
    content.className = 'modal-content edit-tab-modal';

    const header = document.createElement('div');
    header.className = 'modal-header';
    const h3 = document.createElement('h3');
    h3.textContent = 'Pin Current View';
    const closeBtn = document.createElement('button');
    closeBtn.className = 'close-btn';
    closeBtn.textContent = '✕';
    header.append(h3, closeBtn);

    const body = document.createElement('div');
    body.className = 'modal-body';

    const hashGroup = document.createElement('div');
    hashGroup.className = 'form-group';
    const hashLabel = document.createElement('label');
    hashLabel.textContent = 'View URL (Hash):';
    const hashInput = document.createElement('input');
    hashInput.type = 'text';
    hashInput.value = currentHash;
    hashInput.disabled = true;
    hashInput.className = 'disabled-input';
    hashGroup.append(hashLabel, hashInput);

    const titleGroup = document.createElement('div');
    titleGroup.className = 'form-group';
    const titleLabel = document.createElement('label');
    titleLabel.textContent = 'Tab Title:';
    const titleInput = document.createElement('input');
    titleInput.type = 'text';
    titleInput.id = 'pin-title';
    titleInput.value = suggestedTitle;
    titleGroup.append(titleLabel, titleInput);

    const actions = document.createElement('div');
    actions.className = 'modal-actions';
    const saveBtn = document.createElement('button');
    saveBtn.id = 'pin-save-btn';
    saveBtn.className = 'primary-btn';
    saveBtn.textContent = 'Pin Tab';
    actions.appendChild(saveBtn);

    body.append(hashGroup, titleGroup, actions);
    content.append(header, body);
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
    modal.querySelector('.close-btn')?.addEventListener('click', close);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) close();
    });

    modal.querySelector('#pin-save-btn')?.addEventListener('click', async () => {
        const title = (modal.querySelector('#pin-title') as HTMLInputElement).value;

        if (title && getUserEmail()) {
            await addTab(getUserEmail()!, title, currentHash, 'hash');
            close();
            setAppSettings(await getSettings(getUserEmail()!));
            getRenderCallback()();
        }
    });
}
