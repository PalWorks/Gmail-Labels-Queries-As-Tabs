export {};
/**
 * tabListRenderer.test.ts
 *
 * Unit tests for the shared tab list renderer.
 */

import { renderTabListItems, TabListCallbacks } from '../src/utils/tabListRenderer';
import { Tab } from '../src/utils/storage';

// ---------------------------------------------------------------------------
// Sample data
// ---------------------------------------------------------------------------

const sampleTabs: Tab[] = [
    { id: 'inbox', title: 'Inbox', type: 'hash', value: '#inbox' },
    { id: 'work', title: 'Work', type: 'label', value: 'Work' },
    { id: 'personal', title: 'Personal', type: 'label', value: 'Personal' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createContainer(): HTMLUListElement {
    return document.createElement('ul');
}

function createCallbacks(): { cbs: TabListCallbacks; calls: Record<string, unknown[][]> } {
    const calls: Record<string, unknown[][]> = { remove: [], moveUp: [], moveDown: [] };
    return {
        cbs: {
            onRemove: (tabId, index) => calls.remove.push([tabId, index]),
            onMoveUp: (index) => calls.moveUp.push([index]),
            onMoveDown: (index) => calls.moveDown.push([index]),
        },
        calls,
    };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('renderTabListItems', () => {
    it('should render correct number of list items', () => {
        const container = createContainer();
        const { cbs } = createCallbacks();

        renderTabListItems(container, sampleTabs, cbs);

        const items = container.querySelectorAll('li[draggable]');
        expect(items.length).toBe(3);
    });

    it('should set correct data-index attributes', () => {
        const container = createContainer();
        const { cbs } = createCallbacks();

        renderTabListItems(container, sampleTabs, cbs);

        const items = container.querySelectorAll('li[draggable]');
        expect((items[0] as HTMLElement).dataset.index).toBe('0');
        expect((items[1] as HTMLElement).dataset.index).toBe('1');
        expect((items[2] as HTMLElement).dataset.index).toBe('2');
    });

    it('should set correct data-tab-id attributes', () => {
        const container = createContainer();
        const { cbs } = createCallbacks();

        renderTabListItems(container, sampleTabs, cbs);

        const items = container.querySelectorAll('li[draggable]');
        expect((items[0] as HTMLElement).dataset.tabId).toBe('inbox');
        expect((items[1] as HTMLElement).dataset.tabId).toBe('work');
        expect((items[2] as HTMLElement).dataset.tabId).toBe('personal');
    });

    it('should display tab title and type label', () => {
        const container = createContainer();
        const { cbs } = createCallbacks();

        renderTabListItems(container, sampleTabs, cbs);

        const items = container.querySelectorAll('li[draggable]');
        // Hash type shows "Custom", label type shows "Label"
        expect(items[0].querySelector('.tab-info-text')?.textContent).toContain('Inbox');
        expect(items[0].querySelector('.tab-type-hint')?.textContent).toContain('Custom');
        expect(items[1].querySelector('.tab-info-text')?.textContent).toContain('Work');
        expect(items[1].querySelector('.tab-type-hint')?.textContent).toContain('Label');
    });

    it('should call onRemove with correct tabId and index when remove button clicked', () => {
        const container = createContainer();
        const { cbs, calls } = createCallbacks();

        renderTabListItems(container, sampleTabs, cbs);

        const removeBtn = container.querySelectorAll('.remove-btn')[1] as HTMLElement;
        removeBtn.click();

        expect(calls.remove).toEqual([['work', 1]]);
    });

    it('should call onMoveUp with correct index when up button clicked', () => {
        const container = createContainer();
        const { cbs, calls } = createCallbacks();

        renderTabListItems(container, sampleTabs, cbs);

        // Second item should have an up button
        const upBtn = container.querySelectorAll('.up-btn')[0] as HTMLElement;
        upBtn.click();

        expect(calls.moveUp).toEqual([[1]]);
    });

    it('should call onMoveDown with correct index when down button clicked', () => {
        const container = createContainer();
        const { cbs, calls } = createCallbacks();

        renderTabListItems(container, sampleTabs, cbs);

        // First item should have a down button
        const downBtn = container.querySelectorAll('.down-btn')[0] as HTMLElement;
        downBtn.click();

        expect(calls.moveDown).toEqual([[0]]);
    });

    it('should not render up button for first item', () => {
        const container = createContainer();
        const { cbs } = createCallbacks();

        renderTabListItems(container, sampleTabs, cbs);

        const firstItem = container.querySelectorAll('li[draggable]')[0];
        expect(firstItem.querySelector('.up-btn')).toBeNull();
    });

    it('should not render down button for last item', () => {
        const container = createContainer();
        const { cbs } = createCallbacks();

        renderTabListItems(container, sampleTabs, cbs);

        const lastItem = container.querySelectorAll('li[draggable]')[2];
        expect(lastItem.querySelector('.down-btn')).toBeNull();
    });

    it('should show empty message when tabs array is empty', () => {
        const container = createContainer();
        const { cbs } = createCallbacks();

        renderTabListItems(container, [], cbs);

        expect(container.innerHTML).toContain('No tabs configured');
        expect(container.querySelectorAll('li[draggable]').length).toBe(0);
    });

    it('should show custom empty message when provided', () => {
        const container = createContainer();
        const { cbs } = createCallbacks();

        renderTabListItems(container, [], cbs, { emptyMessage: 'Nothing here' });

        expect(container.innerHTML).toContain('Nothing here');
    });

    it('should clear existing content before rendering', () => {
        const container = createContainer();
        container.innerHTML = '<li>Old item</li>';
        const { cbs } = createCallbacks();

        renderTabListItems(container, sampleTabs, cbs);

        expect(container.innerHTML).not.toContain('Old item');
        expect(container.querySelectorAll('li[draggable]').length).toBe(3);
    });

    it('should escape HTML in tab titles', () => {
        const container = createContainer();
        const { cbs } = createCallbacks();
        const dangerousTabs: Tab[] = [
            { id: 'xss', title: '<script>alert("xss")</script>', type: 'label', value: 'test' },
        ];

        renderTabListItems(container, dangerousTabs, cbs);

        expect(container.innerHTML).not.toContain('<script>');
        expect(container.innerHTML).toContain('&lt;script&gt;');
    });

    it('should handle single tab (no up or down buttons)', () => {
        const container = createContainer();
        const { cbs } = createCallbacks();
        const singleTab: Tab[] = [{ id: 'only', title: 'Only Tab', type: 'hash', value: '#only' }];

        renderTabListItems(container, singleTab, cbs);

        const item = container.querySelector('li[draggable]')!;
        expect(item.querySelector('.tab-action-btn.up-btn')).toBeNull();
        expect(item.querySelector('.tab-action-btn.down-btn')).toBeNull();
        expect(item.querySelector('.tab-action-btn.remove-btn')).not.toBeNull();
    });
});
