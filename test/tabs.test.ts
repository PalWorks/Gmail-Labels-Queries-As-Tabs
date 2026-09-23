export {};
/**
 * tabs.test.ts
 *
 * Unit tests for the tabs module.
 * Covers createTabsBar(), renderTabs(), updateActiveTab(), and tab click behavior.
 */

import { Tab } from '../src/utils/storage';

// ---------------------------------------------------------------------------
// Mock Dependencies
// ---------------------------------------------------------------------------

const mockState = {
    currentSettings: null as any,
    currentUserEmail: null as string | null,
    initPromise: null,
    observer: null,
};

jest.mock('../src/modules/state', () => ({
    state: mockState,
    TABS_BAR_ID: 'gmail-labels-as-tabs-bar',
    getAppSettings: () => mockState.currentSettings,
    setAppSettings: (v: any) => { mockState.currentSettings = v; },
    getUserEmail: () => mockState.currentUserEmail,
    setUserEmail: (v: any) => { mockState.currentUserEmail = v; },
}));

jest.mock('../src/modules/unread', () => ({
    updateUnreadCount: jest.fn(),
}));

jest.mock('../src/modules/dragdrop', () => ({
    isMoveMode: false,
    setMoveMode: jest.fn(),
    handleDragStart: jest.fn(),
    handleDragOver: jest.fn(),
    handleDragEnter: jest.fn(),
    handleDragLeave: jest.fn(),
    createHandleDrop: jest.fn(() => jest.fn()),
    handleDragEnd: jest.fn(),
}));

import { createTabsBar, renderTabs, updateActiveTab, setModalCallbacks } from '../src/modules/tabs';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockTabs: Tab[] = [
    { id: 'tab-1', title: 'Inbox', value: '#inbox', type: 'hash' },
    { id: 'tab-2', title: 'Work', value: 'Work', type: 'label' },
    { id: 'tab-3', title: 'Starred', value: '#starred', type: 'hash' },
];

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
    document.body.innerHTML = '';
    mockState.currentSettings = null;
    mockState.currentUserEmail = null;
    window.location.hash = '';

    setModalCallbacks({
        showPinModal: jest.fn(),
        showEditModal: jest.fn(),
        showDeleteModal: jest.fn(),
        toggleSettingsModal: jest.fn(),
    });
});

// ---------------------------------------------------------------------------
// createTabsBar
// ---------------------------------------------------------------------------

describe('createTabsBar', () => {
    test('returns element with correct id', () => {
        const bar = createTabsBar();
        expect(bar.id).toBe('gmail-labels-as-tabs-bar');
    });

    test('returns element with correct class', () => {
        const bar = createTabsBar();
        expect(bar.className).toBe('gmail-tabs-bar');
    });

    test('returns a div element', () => {
        const bar = createTabsBar();
        expect(bar.tagName).toBe('DIV');
    });
});

// ---------------------------------------------------------------------------
// renderTabs
// ---------------------------------------------------------------------------

describe('renderTabs', () => {
    test('exits early when bar element is absent', () => {
        mockState.currentSettings = { tabs: mockTabs, showUnreadCount: false, theme: 'system', rules: [] };
        expect(() => renderTabs()).not.toThrow();
    });

    test('exits early when settings is null', () => {
        const bar = createTabsBar();
        document.body.appendChild(bar);
        mockState.currentSettings = null;

        expect(() => renderTabs()).not.toThrow();
        expect(bar.children.length).toBe(0);
    });

    test('renders correct number of tab elements', () => {
        const bar = createTabsBar();
        document.body.appendChild(bar);
        mockState.currentSettings = { tabs: mockTabs, showUnreadCount: false, theme: 'system', rules: [] };

        renderTabs();

        const tabElements = bar.querySelectorAll('.gmail-tab');
        expect(tabElements.length).toBe(3);
    });

    test('renders tab titles correctly', () => {
        const bar = createTabsBar();
        document.body.appendChild(bar);
        mockState.currentSettings = { tabs: mockTabs, showUnreadCount: false, theme: 'system', rules: [] };

        renderTabs();

        const names = bar.querySelectorAll('.tab-name');
        expect(names[0].textContent).toBe('Inbox');
        expect(names[1].textContent).toBe('Work');
        expect(names[2].textContent).toBe('Starred');
    });

    test('sets correct data attributes on tabs', () => {
        const bar = createTabsBar();
        document.body.appendChild(bar);
        mockState.currentSettings = { tabs: mockTabs, showUnreadCount: false, theme: 'system', rules: [] };

        renderTabs();

        const tabElements = bar.querySelectorAll('.gmail-tab');
        const firstTab = tabElements[0] as HTMLElement;
        expect(firstTab.dataset.value).toBe('#inbox');
        expect(firstTab.dataset.type).toBe('hash');
        expect(firstTab.dataset.index).toBe('0');
    });

    test('creates Save View and Manage action buttons', () => {
        const bar = createTabsBar();
        document.body.appendChild(bar);
        mockState.currentSettings = { tabs: mockTabs, showUnreadCount: false, theme: 'system', rules: [] };

        renderTabs();

        expect(bar.querySelector('.save-view-btn')).not.toBeNull();
        expect(bar.querySelector('.manage-btn')).not.toBeNull();
    });

    test('creates menu button on each tab', () => {
        const bar = createTabsBar();
        document.body.appendChild(bar);
        mockState.currentSettings = { tabs: mockTabs, showUnreadCount: false, theme: 'system', rules: [] };

        renderTabs();

        const menuBtns = bar.querySelectorAll('.gmail-tab-menu-btn');
        expect(menuBtns.length).toBe(3);
    });
});

// ---------------------------------------------------------------------------
// updateActiveTab
// ---------------------------------------------------------------------------

describe('updateActiveTab', () => {
    function setupBarWithTabs(): HTMLElement {
        const bar = createTabsBar();
        document.body.appendChild(bar);
        mockState.currentSettings = { tabs: mockTabs, showUnreadCount: false, theme: 'system', rules: [] };
        renderTabs();
        return bar;
    }

    test('highlights the matching hash tab', () => {
        const bar = setupBarWithTabs();
        window.location.hash = '#inbox';

        updateActiveTab();

        const tabs = bar.querySelectorAll('.gmail-tab');
        expect(tabs[0].classList.contains('active')).toBe(true);
        expect(tabs[1].classList.contains('active')).toBe(false);
        expect(tabs[2].classList.contains('active')).toBe(false);
    });

    test('highlights the matching label tab', () => {
        const bar = setupBarWithTabs();
        window.location.hash = '#label/Work';

        updateActiveTab();

        const tabs = bar.querySelectorAll('.gmail-tab');
        expect(tabs[0].classList.contains('active')).toBe(false);
        expect(tabs[1].classList.contains('active')).toBe(true);
    });

    test('clears previous active when hash changes', () => {
        const bar = setupBarWithTabs();

        window.location.hash = '#inbox';
        updateActiveTab();
        expect(bar.querySelectorAll('.gmail-tab')[0].classList.contains('active')).toBe(true);

        window.location.hash = '#starred';
        updateActiveTab();

        const tabs = bar.querySelectorAll('.gmail-tab');
        expect(tabs[0].classList.contains('active')).toBe(false);
        expect(tabs[2].classList.contains('active')).toBe(true);
    });

    test('no tab highlighted when hash matches nothing', () => {
        const bar = setupBarWithTabs();
        window.location.hash = '#drafts';

        updateActiveTab();

        const activeTabs = bar.querySelectorAll('.gmail-tab.active');
        expect(activeTabs.length).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// updateActiveTab and nested labels
//
// Gmail writes a nested label as one encoded path, so a parent's name is a
// prefix of every child's. Reported on 2026-09-24: opening
// "Delete/OnlineOrderNotifications" lit its tab and the "Delete" tab with it.
// ---------------------------------------------------------------------------

describe('updateActiveTab with nested labels', () => {
    const nested: Tab[] = [
        { id: 'tab-1', title: 'Inbox', value: '#inbox', type: 'hash' },
        { id: 'tab-2', title: 'Delete', value: 'Delete', type: 'label' },
        { id: 'tab-3', title: 'OnlineOrders', value: 'Delete/OnlineOrderNotifications', type: 'label' },
        { id: 'tab-4', title: 'Deleted Items', value: 'Deleted Items', type: 'label' },
    ];

    function setupNestedBar(): HTMLElement {
        const bar = createTabsBar();
        document.body.appendChild(bar);
        mockState.currentSettings = { tabs: nested, showUnreadCount: false, theme: 'system', rules: [] };
        renderTabs();
        return bar;
    }

    /** The titles of every tab currently highlighted. */
    function activeTitles(bar: HTMLElement): string[] {
        return Array.from(bar.querySelectorAll<HTMLElement>('.gmail-tab.active')).map(
            (t) => t.querySelector('.tab-name')?.textContent?.trim() ?? ''
        );
    }

    test('a sublabel lights its own tab, not its parent as well', () => {
        const bar = setupNestedBar();
        window.location.hash = '#label/Delete%2FOnlineOrderNotifications';

        updateActiveTab();

        expect(activeTitles(bar)).toEqual(['OnlineOrders']);
    });

    test('the parent stays lit while a sublabel with no tab of its own is open', () => {
        // The most specific thing the bar can say is "you are inside Delete".
        const bar = setupNestedBar();
        window.location.hash = '#label/Delete%2FSpamletters';

        updateActiveTab();

        expect(activeTitles(bar)).toEqual(['Delete']);
    });

    test('an open thread keeps its label tab lit', () => {
        // Gmail appends the thread id to the label path.
        const bar = setupNestedBar();
        window.location.hash = '#label/Delete%2FOnlineOrderNotifications/FMfcgzQbgClcJBgGqJVCRrRqQpgLDLPG';

        updateActiveTab();

        expect(activeTitles(bar)).toEqual(['OnlineOrders']);
    });

    test('a page of results keeps the label lit', () => {
        const bar = setupNestedBar();
        window.location.hash = '#label/Delete/p2';

        updateActiveTab();

        expect(activeTitles(bar)).toEqual(['Delete']);
    });

    test('nesting is a path separator, not a bare prefix', () => {
        // "Delete" must not light up for "Deleted Items".
        const bar = setupNestedBar();
        window.location.hash = '#label/Deleted+Items';

        updateActiveTab();

        expect(activeTitles(bar)).toEqual(['Deleted Items']);
    });

    test('the parent alone lights up for the parent itself', () => {
        const bar = setupNestedBar();
        window.location.hash = '#label/Delete';

        updateActiveTab();

        expect(activeTitles(bar)).toEqual(['Delete']);
    });

    test('a label with a space is matched through its encoding', () => {
        const bar = setupNestedBar();
        window.location.hash = '#label/Deleted%20Items';

        updateActiveTab();

        expect(activeTitles(bar)).toEqual(['Deleted Items']);
    });

    test('a malformed escape does not throw or light anything', () => {
        const bar = setupNestedBar();
        window.location.hash = '#label/%E0%A4';

        expect(() => updateActiveTab()).not.toThrow();
        expect(activeTitles(bar)).toEqual([]);
    });

    test('aria-current follows the same single tab', () => {
        const bar = setupNestedBar();
        window.location.hash = '#label/Delete%2FOnlineOrderNotifications';

        updateActiveTab();

        const marked = bar.querySelectorAll('.tab-name[aria-current="page"]');
        expect(marked).toHaveLength(1);
        expect(marked[0].textContent?.trim()).toBe('OnlineOrders');
    });
});

// ---------------------------------------------------------------------------
// Tab Click Behavior
// ---------------------------------------------------------------------------

describe('tab click behavior', () => {
    test('clicking a hash tab sets window.location.hash', () => {
        const bar = createTabsBar();
        document.body.appendChild(bar);
        mockState.currentSettings = { tabs: mockTabs, showUnreadCount: false, theme: 'system', rules: [] };

        renderTabs();

        const tabElements = bar.querySelectorAll('.gmail-tab');
        const inboxTab = tabElements[0] as HTMLElement;
        const nameSpan = inboxTab.querySelector('.tab-name') as HTMLElement;
        nameSpan.click();

        expect(window.location.hash).toBe('#inbox');
    });

    test('clicking a label tab sets encoded label hash', () => {
        const bar = createTabsBar();
        document.body.appendChild(bar);
        mockState.currentSettings = { tabs: mockTabs, showUnreadCount: false, theme: 'system', rules: [] };

        renderTabs();

        const tabElements = bar.querySelectorAll('.gmail-tab');
        const workTab = tabElements[1] as HTMLElement;
        const nameSpan = workTab.querySelector('.tab-name') as HTMLElement;
        nameSpan.click();

        expect(window.location.hash).toBe('#label/Work');
    });
});

// ---------------------------------------------------------------------------
// Dropdown menu
// ---------------------------------------------------------------------------

describe('tab dropdown menu', () => {
    function renderBar() {
        const bar = createTabsBar();
        document.body.appendChild(bar);
        mockState.currentSettings = { tabs: mockTabs, showUnreadCount: false, theme: 'system', rules: [] };
        renderTabs();
        return bar;
    }

    test('opens a dropdown when the menu button is clicked', () => {
        const bar = renderBar();
        const menuBtn = bar.querySelector('.gmail-tab-menu-btn') as HTMLElement;
        menuBtn.click();

        const dropdown = document.querySelector('.gmail-tab-dropdown');
        expect(dropdown).not.toBeNull();
        expect(dropdown!.querySelectorAll('.gmail-tab-dropdown-item').length).toBeGreaterThanOrEqual(3);
    });

    test('Edit Tab item invokes the edit modal callback', () => {
        const showEditModal = jest.fn();
        setModalCallbacks({
            showPinModal: jest.fn(),
            showEditModal,
            showDeleteModal: jest.fn(),
            toggleSettingsModal: jest.fn(),
        });

        const bar = renderBar();
        (bar.querySelector('.gmail-tab-menu-btn') as HTMLElement).click();

        const items = Array.from(document.querySelectorAll('.gmail-tab-dropdown-item')) as HTMLElement[];
        const editItem = items.find((i) => i.textContent?.includes('Edit'))!;
        editItem.click();

        expect(showEditModal).toHaveBeenCalledWith(mockTabs[0]);
    });

    test('Close Tab item invokes the delete modal callback', () => {
        const showDeleteModal = jest.fn();
        setModalCallbacks({
            showPinModal: jest.fn(),
            showEditModal: jest.fn(),
            showDeleteModal,
            toggleSettingsModal: jest.fn(),
        });

        const bar = renderBar();
        (bar.querySelector('.gmail-tab-menu-btn') as HTMLElement).click();

        const items = Array.from(document.querySelectorAll('.gmail-tab-dropdown-item')) as HTMLElement[];
        const closeItem = items.find((i) => i.textContent?.includes('Close'))!;
        closeItem.click();

        expect(showDeleteModal).toHaveBeenCalledWith(mockTabs[0]);
    });

    test('Manage button invokes the settings-modal callback', () => {
        const toggleSettingsModal = jest.fn();
        setModalCallbacks({
            showPinModal: jest.fn(),
            showEditModal: jest.fn(),
            showDeleteModal: jest.fn(),
            toggleSettingsModal,
        });

        const bar = renderBar();
        (bar.querySelector('.manage-btn') as HTMLElement).click();

        expect(toggleSettingsModal).toHaveBeenCalled();
    });

    test('Save View button invokes the pin-modal callback', () => {
        const showPinModal = jest.fn();
        setModalCallbacks({
            showPinModal,
            showEditModal: jest.fn(),
            showDeleteModal: jest.fn(),
            toggleSettingsModal: jest.fn(),
        });

        const bar = renderBar();
        (bar.querySelector('.save-view-btn') as HTMLElement).click();

        expect(showPinModal).toHaveBeenCalled();
    });
});

// ---------------------------------------------------------------------------
// Accessibility
// ---------------------------------------------------------------------------

describe('accessibility', () => {
    function renderBar() {
        const bar = createTabsBar();
        document.body.appendChild(bar);
        mockState.currentSettings = { tabs: mockTabs, showUnreadCount: false, theme: 'system', rules: [] };
        renderTabs();
        return bar;
    }

    test('the bar is a labelled toolbar', () => {
        const bar = renderBar();
        expect(bar.getAttribute('role')).toBe('toolbar');
        expect(bar.getAttribute('aria-label')).toBe('Gmail tabs');
    });

    test('tab names are focusable buttons with labels', () => {
        const bar = renderBar();
        const name = bar.querySelector('.tab-name') as HTMLElement;
        expect(name.getAttribute('role')).toBe('button');
        expect(name.getAttribute('tabindex')).toBe('0');
        expect(name.getAttribute('aria-label')).toBe('Inbox');
    });

    test('pressing Enter on a tab name navigates', () => {
        const bar = renderBar();
        const name = bar.querySelectorAll('.tab-name')[1] as HTMLElement; // Work (label)
        name.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        expect(window.location.hash).toBe('#label/Work');
    });

    test('ArrowRight moves focus to the next tab name', () => {
        const bar = renderBar();
        const names = bar.querySelectorAll('.tab-name');
        (names[0] as HTMLElement).focus();
        (names[0] as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
        expect(document.activeElement).toBe(names[1]);
    });

    test('menu button exposes a collapsed popup that expands on open', () => {
        const bar = renderBar();
        const menuBtn = bar.querySelector('.gmail-tab-menu-btn') as HTMLElement;
        expect(menuBtn.getAttribute('aria-haspopup')).toBe('menu');
        expect(menuBtn.getAttribute('aria-expanded')).toBe('false');

        menuBtn.click();
        expect(menuBtn.getAttribute('aria-expanded')).toBe('true');

        const menu = document.querySelector('.gmail-tab-dropdown');
        expect(menu?.getAttribute('role')).toBe('menu');
        expect(menu?.querySelectorAll('[role="menuitem"]').length).toBeGreaterThanOrEqual(3);
    });

    test('Escape closes an open menu', () => {
        const bar = renderBar();
        (bar.querySelector('.gmail-tab-menu-btn') as HTMLElement).click();
        const menu = document.querySelector('.gmail-tab-dropdown') as HTMLElement;
        menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        expect(document.querySelector('.gmail-tab-dropdown')).toBeNull();
    });

    test('the active tab name is marked aria-current', () => {
        window.location.hash = '#inbox';
        const bar = renderBar();
        const inboxName = bar.querySelector('.tab-name') as HTMLElement;
        expect(inboxName.getAttribute('aria-current')).toBe('page');
    });

    test('toolbar action buttons are labelled buttons', () => {
        const bar = renderBar();
        const manage = bar.querySelector('.manage-btn') as HTMLElement;
        const save = bar.querySelector('.save-view-btn') as HTMLElement;
        expect(manage.getAttribute('role')).toBe('button');
        expect(manage.getAttribute('aria-label')).toBeTruthy();
        expect(save.getAttribute('role')).toBe('button');
        expect(save.getAttribute('aria-label')).toBeTruthy();
    });
});
