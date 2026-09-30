export {};
/**
 * dragdrop.test.ts
 *
 * Unit tests for tab bar and modal list drag-and-drop handlers.
 * Covers handleDragStart/End/Over/Enter/Leave, createHandleDrop,
 * setMoveMode, and createModalDragHandlers.
 */

import {
    handleDragStart,
    handleDragOver,
    handleDragEnter,
    handleDragLeave,
    handleDragEnd,
    createHandleDrop,
    setMoveMode,
    isMoveMode,
    createModalDragHandlers,
} from '../src/modules/dragdrop';

// ---------------------------------------------------------------------------
// Mock dependencies
// ---------------------------------------------------------------------------

jest.mock('../src/utils/storage', () => ({
    updateTabOrder: jest.fn().mockResolvedValue(undefined),
    getSettings: jest.fn().mockResolvedValue({
        tabs: [
            { id: '1', title: 'Inbox', value: '#inbox', type: 'hash' },
            { id: '2', title: 'Starred', value: '#starred', type: 'hash' },
            { id: '3', title: 'Work', value: 'Work', type: 'label' },
        ],
        showUnreadCount: false,
        theme: 'system',
        rules: [],
    }),
}));

jest.mock('../src/modules/state', () => {
    const s = {
        currentSettings: {
            tabs: [
                { id: '1', title: 'Inbox', value: '#inbox', type: 'hash' },
                { id: '2', title: 'Starred', value: '#starred', type: 'hash' },
                { id: '3', title: 'Work', value: 'Work', type: 'label' },
            ],
            showUnreadCount: false,
            theme: 'system',
            rules: [],
        },
        currentUserEmail: 'test@gmail.com',
    };
    return {
        state: s,
        getAppSettings: () => s.currentSettings,
        setAppSettings: (v: any) => { s.currentSettings = v; },
        setAppTabs: (tabs: any) => { s.currentSettings = { ...s.currentSettings, tabs }; },
        getUserEmail: () => s.currentUserEmail,
        setUserEmail: (v: any) => { s.currentUserEmail = v; },
    };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createDragEvent(type: string, overrides: Partial<DragEvent> = {}): DragEvent {
    const event = new Event(type, { bubbles: true, cancelable: true }) as any;
    event.dataTransfer = {
        effectAllowed: '',
        dropEffect: '',
        setData: jest.fn(),
        getData: jest.fn(),
    };
    event.clientX = overrides.clientX ?? 0;
    event.clientY = overrides.clientY ?? 0;
    event.preventDefault = jest.fn();
    event.stopPropagation = jest.fn();
    return event as DragEvent;
}

function createTabElement(index: number): HTMLElement {
    const el = document.createElement('div');
    el.className = 'gmail-tab';
    el.dataset.index = String(index);
    return el;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
    document.body.innerHTML = '';
});

// ---------------------------------------------------------------------------
// setMoveMode / isMoveMode
// ---------------------------------------------------------------------------

describe('setMoveMode', () => {
    test('toggles isMoveMode flag', () => {
        setMoveMode(true);
        expect(isMoveMode).toBe(true);

        setMoveMode(false);
        expect(isMoveMode).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// Tab Bar Drag Handlers
// ---------------------------------------------------------------------------

describe('handleDragStart', () => {
    test('adds dragging class and sets dataTransfer', () => {
        const tab = createTabElement(0);
        const event = createDragEvent('dragstart');

        handleDragStart.call(tab, event);

        expect(tab.classList.contains('dragging')).toBe(true);
        expect(event.dataTransfer!.effectAllowed).toBe('move');
        expect(event.dataTransfer!.setData).toHaveBeenCalledWith('text/plain', '0');
    });
});

describe('handleDragOver', () => {
    // Only a drag we started is accepted, so each case starts one.
    beforeEach(() => {
        handleDragStart.call(createTabElement(0), createDragEvent('dragstart'));
    });
    afterEach(() => {
        handleDragEnd.call(createTabElement(0), createDragEvent('dragend'));
    });

    test('prevents default and sets dropEffect to move', () => {
        const tab = createTabElement(1);
        Object.defineProperty(tab, 'getBoundingClientRect', {
            value: () => ({ left: 0, width: 100, top: 0, height: 40 }),
        });

        const event = createDragEvent('dragover', { clientX: 25 });
        const result = handleDragOver.call(tab, event);

        expect(event.preventDefault).toHaveBeenCalled();
        expect(event.dataTransfer!.dropEffect).toBe('move');
        expect(result).toBe(false);
    });

    test('adds drop-before class when cursor is in left half', () => {
        const tab = createTabElement(1);
        Object.defineProperty(tab, 'getBoundingClientRect', {
            value: () => ({ left: 0, width: 100, top: 0, height: 40 }),
        });

        const event = createDragEvent('dragover', { clientX: 25 });
        handleDragOver.call(tab, event);

        expect(tab.classList.contains('drop-before')).toBe(true);
        expect(tab.classList.contains('drop-after')).toBe(false);
    });

    test('adds drop-after class when cursor is in right half', () => {
        const tab = createTabElement(1);
        Object.defineProperty(tab, 'getBoundingClientRect', {
            value: () => ({ left: 0, width: 100, top: 0, height: 40 }),
        });

        const event = createDragEvent('dragover', { clientX: 75 });
        handleDragOver.call(tab, event);

        expect(tab.classList.contains('drop-after')).toBe(true);
        expect(tab.classList.contains('drop-before')).toBe(false);
    });
});

describe('handleDragEnter', () => {
    test('adds drag-over class', () => {
        const tab = createTabElement(0);
        const event = createDragEvent('dragenter');

        handleDragEnter.call(tab, event);

        expect(tab.classList.contains('drag-over')).toBe(true);
    });
});

describe('handleDragLeave', () => {
    test('removes visual classes when leaving element', () => {
        const tab = createTabElement(0);
        tab.classList.add('drag-over', 'drop-before', 'drop-after');

        const event = createDragEvent('dragleave');
        Object.defineProperty(event, 'relatedTarget', { value: document.body });

        handleDragLeave.call(tab, event);

        expect(tab.classList.contains('drag-over')).toBe(false);
        expect(tab.classList.contains('drop-before')).toBe(false);
        expect(tab.classList.contains('drop-after')).toBe(false);
    });

    test('does not remove classes when related target is child', () => {
        const tab = createTabElement(0);
        const child = document.createElement('span');
        tab.appendChild(child);
        tab.classList.add('drag-over');

        const event = createDragEvent('dragleave');
        Object.defineProperty(event, 'relatedTarget', { value: child });

        handleDragLeave.call(tab, event);

        expect(tab.classList.contains('drag-over')).toBe(true);
    });
});

describe('handleDragEnd', () => {
    test('clears all drag classes from all tab elements', () => {
        const tab1 = createTabElement(0);
        const tab2 = createTabElement(1);
        tab1.classList.add('dragging', 'drag-over');
        tab2.classList.add('drop-before', 'drop-after');
        document.body.appendChild(tab1);
        document.body.appendChild(tab2);

        const event = createDragEvent('dragend');
        handleDragEnd.call(tab1, event);

        expect(tab1.classList.contains('dragging')).toBe(false);
        expect(tab1.classList.contains('drag-over')).toBe(false);
        expect(tab2.classList.contains('drop-before')).toBe(false);
        expect(tab2.classList.contains('drop-after')).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// createHandleDrop
// ---------------------------------------------------------------------------

describe('createHandleDrop', () => {
    test('returns a function that can be used as a drop handler', () => {
        const renderTabs = jest.fn();
        const handler = createHandleDrop(renderTabs);
        expect(typeof handler).toBe('function');
    });
});

// ---------------------------------------------------------------------------
// createModalDragHandlers
// ---------------------------------------------------------------------------

describe('createModalDragHandlers', () => {
    test('returns object with all expected handler functions', () => {
        const list = document.createElement('ul');
        const refreshList = jest.fn();
        const renderTabs = jest.fn();

        const handlers = createModalDragHandlers(list, refreshList, renderTabs);

        expect(typeof handlers.handleModalDragStart).toBe('function');
        expect(typeof handlers.handleModalDragOver).toBe('function');
        expect(typeof handlers.handleModalDragEnter).toBe('function');
        expect(typeof handlers.handleModalDragLeave).toBe('function');
        expect(typeof handlers.handleModalDrop).toBe('function');
        expect(typeof handlers.handleModalDragEnd).toBe('function');
    });

    test('handleModalDragStart adds dragging class', () => {
        const list = document.createElement('ul');
        const handlers = createModalDragHandlers(list, jest.fn(), jest.fn());
        const item = document.createElement('li');
        item.dataset.index = '0';

        const event = createDragEvent('dragstart');
        handlers.handleModalDragStart.call(item, event);

        expect(item.classList.contains('dragging')).toBe(true);
    });

    test('handleModalDragOver adds drop-above for top half', () => {
        const list = document.createElement('ul');
        const handlers = createModalDragHandlers(list, jest.fn(), jest.fn());
        handlers.handleModalDragStart.call(document.createElement('li'), createDragEvent('dragstart'));
        const item = document.createElement('li');
        Object.defineProperty(item, 'getBoundingClientRect', {
            value: () => ({ left: 0, width: 200, top: 0, height: 40 }),
        });

        const event = createDragEvent('dragover', { clientY: 10 });
        handlers.handleModalDragOver.call(item, event);

        expect(item.classList.contains('drop-above')).toBe(true);
        expect(item.classList.contains('drop-below')).toBe(false);
    });

    test('handleModalDragOver adds drop-below for bottom half', () => {
        const list = document.createElement('ul');
        const handlers = createModalDragHandlers(list, jest.fn(), jest.fn());
        handlers.handleModalDragStart.call(document.createElement('li'), createDragEvent('dragstart'));
        const item = document.createElement('li');
        Object.defineProperty(item, 'getBoundingClientRect', {
            value: () => ({ left: 0, width: 200, top: 0, height: 40 }),
        });

        const event = createDragEvent('dragover', { clientY: 30 });
        handlers.handleModalDragOver.call(item, event);

        expect(item.classList.contains('drop-below')).toBe(true);
        expect(item.classList.contains('drop-above')).toBe(false);
    });

    test('handleModalDragEnter adds drag-over class', () => {
        const list = document.createElement('ul');
        const handlers = createModalDragHandlers(list, jest.fn(), jest.fn());
        const item = document.createElement('li');

        handlers.handleModalDragEnter.call(item);

        expect(item.classList.contains('drag-over')).toBe(true);
    });

    test('handleModalDragLeave removes drag classes', () => {
        const list = document.createElement('ul');
        const handlers = createModalDragHandlers(list, jest.fn(), jest.fn());
        const item = document.createElement('li');
        item.classList.add('drag-over', 'drop-above', 'drop-below');

        handlers.handleModalDragLeave.call(item);

        expect(item.classList.contains('drag-over')).toBe(false);
        expect(item.classList.contains('drop-above')).toBe(false);
        expect(item.classList.contains('drop-below')).toBe(false);
    });

    test('handleModalDragEnd clears all drag classes from list items', () => {
        const list = document.createElement('ul');
        const li1 = document.createElement('li');
        li1.classList.add('dragging', 'drag-over');
        const li2 = document.createElement('li');
        li2.classList.add('drop-above', 'drop-below');
        list.appendChild(li1);
        list.appendChild(li2);

        const handlers = createModalDragHandlers(list, jest.fn(), jest.fn());

        handlers.handleModalDragEnd.call(li1);

        expect(li1.classList.contains('dragging')).toBe(false);
        expect(li1.classList.contains('drag-over')).toBe(false);
        expect(li2.classList.contains('drop-above')).toBe(false);
        expect(li2.classList.contains('drop-below')).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// Drops that are not ours, and drops that fail
// ---------------------------------------------------------------------------

describe('foreign drops and failed reorders', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const storage = require('../src/utils/storage');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const state = require('../src/modules/state');
    const original = state.state.currentSettings.tabs;

    beforeEach(() => {
        state.state.currentSettings = { ...state.state.currentSettings, tabs: original };
    });

    test('text or a file dragged onto a tab is not accepted and does not throw', async () => {
        const target = createTabElement(1);
        const over = createDragEvent('dragover');
        handleDragOver.call(target, over);
        expect(over.preventDefault).not.toHaveBeenCalled();

        const renderTabs = jest.fn();
        const drop = createHandleDrop(renderTabs);
        await expect(drop.call(target, createDragEvent('drop'))).resolves.toBe(true);
        expect(renderTabs).not.toHaveBeenCalled();
        expect(storage.updateTabOrder).not.toHaveBeenCalled();
    });

    test('a foreign drop on the settings list is not accepted and does not throw', async () => {
        const handlers = createModalDragHandlers(document.createElement('ul'), jest.fn(), jest.fn());
        const item = document.createElement('li');
        const over = createDragEvent('dragover');
        handlers.handleModalDragOver.call(item, over);
        expect(over.preventDefault).not.toHaveBeenCalled();
        await expect(handlers.handleModalDrop.call(item, createDragEvent('drop'))).resolves.toBe(true);
    });

    test('our own drop is claimed and finishes the drag even if dragend never fires', async () => {
        const source = createTabElement(0);
        const target = createTabElement(2);
        target.classList.add('drop-after');
        handleDragStart.call(source, createDragEvent('dragstart'));

        const drop = createDragEvent('drop');
        await createHandleDrop(jest.fn()).call(target, drop);
        expect(drop.preventDefault).toHaveBeenCalled();

        // The dragged element was re-rendered away; the next foreign drag
        // must not be mistaken for the old one.
        const over = createDragEvent('dragover');
        handleDragOver.call(createTabElement(1), over);
        expect(over.preventDefault).not.toHaveBeenCalled();
    });

    test('a failed reorder is caught, shown, and the bar goes back to the stored order', async () => {
        storage.updateTabOrder.mockRejectedValueOnce(new Error('QUOTA_BYTES quota exceeded'));
        const source = createTabElement(0);
        const target = createTabElement(2);
        target.classList.add('drop-after');
        handleDragStart.call(source, createDragEvent('dragstart'));

        const renderTabs = jest.fn();
        await expect(createHandleDrop(renderTabs).call(target, createDragEvent('drop'))).resolves.toBe(false);

        expect(state.state.currentSettings.tabs).toEqual(original);
        expect(renderTabs).toHaveBeenCalledTimes(2);
        expect(document.getElementById('gmail-tabs-write-failure')?.textContent).toContain('Settings are full');
    });

    test('a failed reorder in the settings list reaches the caller\'s error handler', async () => {
        storage.updateTabOrder.mockRejectedValueOnce(new Error('boom'));
        const onError = jest.fn();
        const handlers = createModalDragHandlers(document.createElement('ul'), jest.fn(), jest.fn(), onError);
        handlers.handleModalDragStart.call(Object.assign(document.createElement('li'), {}), createDragEvent('dragstart'));

        await handlers.handleModalDrop.call(document.createElement('li'), createDragEvent('drop'));
        expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'boom' }));
    });
});
