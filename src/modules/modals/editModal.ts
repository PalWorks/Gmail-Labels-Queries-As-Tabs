/**
 * editModal.ts
 *
 * Edit Modal: Allows users to rename an existing tab's display title.
 */

import { Tab, getSettings, updateTab } from '../../utils/storage';
import { getUserEmail, setAppSettings } from '../state';
import { getRenderCallback } from './index';

export function showEditModal(tab: Tab): void {
    const modal = document.createElement('div');
    modal.className = 'gmail-tabs-modal';

    const content = document.createElement('div');
    content.className = 'modal-content edit-tab-modal';

    const header = document.createElement('div');
    header.className = 'modal-header';
    const h3 = document.createElement('h3');
    h3.textContent = 'Edit Tab';
    const closeBtn = document.createElement('button');
    closeBtn.className = 'close-btn';
    closeBtn.textContent = '✕';
    header.append(h3, closeBtn);

    const body = document.createElement('div');
    body.className = 'modal-body';

    const valueGroup = document.createElement('div');
    valueGroup.className = 'form-group';
    const valueLabel = document.createElement('label');
    valueLabel.textContent = `Value (${tab.type}):`;
    const valueInput = document.createElement('input');
    valueInput.type = 'text';
    valueInput.value = tab.value;
    valueInput.disabled = true;
    valueInput.className = 'disabled-input';
    valueGroup.append(valueLabel, valueInput);

    const nameGroup = document.createElement('div');
    nameGroup.className = 'form-group';
    const nameLabel = document.createElement('label');
    nameLabel.textContent = 'Display Name:';
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.id = 'edit-display-name';
    nameInput.value = tab.title;
    nameGroup.append(nameLabel, nameInput);

    const actions = document.createElement('div');
    actions.className = 'modal-actions';
    const saveBtn = document.createElement('button');
    saveBtn.id = 'edit-save-btn';
    saveBtn.className = 'primary-btn';
    saveBtn.textContent = 'Save';
    actions.appendChild(saveBtn);

    body.append(valueGroup, nameGroup, actions);
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

    modal.querySelector('#edit-save-btn')?.addEventListener('click', async () => {
        const title = (modal.querySelector('#edit-display-name') as HTMLInputElement).value;

        if (title && getUserEmail()) {
            await updateTab(getUserEmail()!, tab.id, {
                title: title.trim(),
            });

            close();
            setAppSettings(await getSettings(getUserEmail()!));
            getRenderCallback()();
        }
    });
}
