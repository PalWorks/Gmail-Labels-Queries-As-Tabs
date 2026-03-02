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
