export {};
/**
 * unread.test.ts
 *
 * Unit tests for the unread count module.
 * Covers normalizeLabel(), buildLabelMapFromDOM(), handleUnreadUpdates(),
 * and getUnreadCountFromDOM().
 */

// ---------------------------------------------------------------------------
// Mock Dependencies
// ---------------------------------------------------------------------------

jest.mock('../src/modules/state', () => ({
    TABS_BAR_ID: 'gmail-labels-as-tabs-bar',
}));

import { normalizeLabel, buildLabelMapFromDOM, handleUnreadUpdates, getUnreadCountFromDOM } from '../src/modules/unread';
import { Tab } from '../src/utils/storage';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a mock Gmail sidebar with label links. */
function createMockSidebar(labels: { title: string; href: string; ariaLabel?: string; childTitle?: string }[]): void {
    const nav = document.createElement('div');
    nav.setAttribute('role', 'navigation');

    labels.forEach(({ title, href, ariaLabel, childTitle }) => {
        const link = document.createElement('a');
        link.href = href;
        if (title) link.title = title;
        if (ariaLabel) link.setAttribute('aria-label', ariaLabel);
        if (childTitle) {
            const child = document.createElement('span');
            child.title = childTitle;
            link.appendChild(child);
        }
        nav.appendChild(link);
    });

    document.body.appendChild(nav);
}

/** Create a tabs bar with tab elements for handleUnreadUpdates testing. */
function createMockTabBar(tabs: { value: string; type: string }[]): void {
    const bar = document.createElement('div');
    bar.id = 'gmail-labels-as-tabs-bar';

    tabs.forEach((tab) => {
        const tabEl = document.createElement('div');
        tabEl.className = 'gmail-tab';
        tabEl.dataset.value = tab.value;
        tabEl.dataset.type = tab.type;

        const countSpan = document.createElement('span');
        countSpan.className = 'unread-count';
        tabEl.appendChild(countSpan);

        bar.appendChild(tabEl);
    });

    document.body.appendChild(bar);
}

/** Build a mock inbox/sent sidebar link with optional unread indicators. */
function createMockInboxLink(options: {
    href: string;
    ariaLabel?: string;
    title?: string;
    bsUText?: string;
    innerText?: string;
}): void {
    const nav = document.createElement('div');
    nav.setAttribute('role', 'navigation');

    const link = document.createElement('a');
    link.href = options.href;
    if (options.ariaLabel) link.setAttribute('aria-label', options.ariaLabel);
    if (options.title) link.title = options.title;
    if (options.bsUText) {
        const bsU = document.createElement('span');
        bsU.className = 'bsU';
        bsU.textContent = options.bsUText;
        link.appendChild(bsU);
    }
    if (options.innerText) {
        const textNode = document.createTextNode(options.innerText);
        link.appendChild(textNode);
    }

    nav.appendChild(link);
    document.body.appendChild(nav);
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
    document.body.innerHTML = '';
});

// ---------------------------------------------------------------------------
// normalizeLabel
// ---------------------------------------------------------------------------

describe('normalizeLabel', () => {
    test('normalizes slashes to spaces', () => {
        expect(normalizeLabel('Work/Tasks')).toBe('work tasks');
    });

    test('normalizes dashes to spaces', () => {
        expect(normalizeLabel('my-label')).toBe('my label');
    });

    test('normalizes underscores to spaces', () => {
        expect(normalizeLabel('my_label')).toBe('my label');
    });

    test('handles mixed case', () => {
        expect(normalizeLabel('My Label')).toBe('my label');
    });

    test('decodes URI encoded strings', () => {
        expect(normalizeLabel('My%20Label')).toBe('my label');
    });

    test('collapses multiple whitespace characters', () => {
        expect(normalizeLabel('my   label')).toBe('my label');
    });

    test('trims leading and trailing whitespace', () => {
        expect(normalizeLabel('  work  ')).toBe('work');
    });

    test('handles combined separators', () => {
        expect(normalizeLabel('Work/Sub_Task-Item')).toBe('work sub task item');
    });
});

// ---------------------------------------------------------------------------
// buildLabelMapFromDOM
// ---------------------------------------------------------------------------

describe('buildLabelMapFromDOM', () => {
    test('builds map from sidebar label links with title attribute', () => {
        createMockSidebar([
            { title: 'Work', href: 'https://mail.google.com/#label/Work' },
            { title: 'Personal', href: 'https://mail.google.com/#label/Personal' },
        ]);

        const map = buildLabelMapFromDOM();

        expect(map.get('work')).toBe('Work');
        expect(map.get('personal')).toBe('Personal');
    });

    test('falls back to child element title when link has no title', () => {
        createMockSidebar([
            { title: '', href: 'https://mail.google.com/#label/Projects', childTitle: 'Projects' },
        ]);

        const map = buildLabelMapFromDOM();

        expect(map.get('projects')).toBe('Projects');
    });

    test('falls back to aria-label when no title found', () => {
        createMockSidebar([
            { title: '', href: 'https://mail.google.com/#label/Updates', ariaLabel: 'Updates, 5 unread' },
        ]);

        const map = buildLabelMapFromDOM();

        // aria-label is split on comma, first part used as title
        expect(map.get('updates')).toBe('Updates');
    });

    test('returns empty map when no label links exist', () => {
        const map = buildLabelMapFromDOM();
        expect(map.size).toBe(0);
    });

    test('stores both title-based and id-based entries', () => {
        createMockSidebar([
            { title: 'Work', href: 'https://mail.google.com/#label/Work' },
        ]);

        const map = buildLabelMapFromDOM();

        // Both lowercase title and the decoded id should map to the id
        expect(map.has('work')).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// getUnreadCountFromDOM
// ---------------------------------------------------------------------------

describe('getUnreadCountFromDOM', () => {
    test('finds inbox count from .bsU element', () => {
        const tab: Tab = { id: 't1', title: 'Inbox', value: '#inbox', type: 'hash' };

        createMockInboxLink({
            href: '#inbox',
            ariaLabel: 'Inbox',
            bsUText: '5',
        });

        expect(getUnreadCountFromDOM(tab)).toBe('5');
    });

    test('parses inbox count from aria-label "N unread" pattern', () => {
        const tab: Tab = { id: 't1', title: 'Inbox', value: '#inbox', type: 'hash' };

        createMockInboxLink({
            href: '#inbox',
            ariaLabel: 'Inbox 3 unread',
        });

        expect(getUnreadCountFromDOM(tab)).toBe('3');
    });

    test('parses inbox count from title "(N)" pattern', () => {
        const tab: Tab = { id: 't1', title: 'Inbox', value: '#inbox', type: 'hash' };

        createMockInboxLink({
            href: '#inbox',
            ariaLabel: 'Inbox',
            title: 'Inbox (7)',
        });

        // aria-label match runs first: 'Inbox' has no number pattern,
        // so falls to title match
        expect(getUnreadCountFromDOM(tab)).toBe('7');
    });

    test('returns empty string when no count found for inbox', () => {
        const tab: Tab = { id: 't1', title: 'Inbox', value: '#inbox', type: 'hash' };

        createMockInboxLink({
            href: '#inbox',
            ariaLabel: 'Inbox',
        });

        expect(getUnreadCountFromDOM(tab)).toBe('');
    });

    test('finds label count from link with matching href', () => {
        const tab: Tab = { id: 't1', title: 'Work', value: 'Work', type: 'label' };

        const link = document.createElement('a');
        link.href = 'https://mail.google.com/#label/Work';
        link.setAttribute('aria-label', 'Work 2 unread');
        document.body.appendChild(link);

        expect(getUnreadCountFromDOM(tab)).toBe('2');
    });

    test('returns empty string for label with no matching link', () => {
        const tab: Tab = { id: 't1', title: 'NonExistent', value: 'NonExistent', type: 'label' };

        expect(getUnreadCountFromDOM(tab)).toBe('');
    });
});

// ---------------------------------------------------------------------------
// handleUnreadUpdates
// ---------------------------------------------------------------------------

describe('handleUnreadUpdates', () => {
    test('updates badge for system label ^i (inbox)', () => {
        createMockTabBar([{ value: '#inbox', type: 'hash' }]);

        // Need sidebar for buildLabelMapFromDOM called internally
        handleUnreadUpdates([{ label: '^i', count: 3 }]);

        const bar = document.getElementById('gmail-labels-as-tabs-bar')!;
        const countSpan = bar.querySelector('.unread-count');
        expect(countSpan?.textContent).toBe('3');
    });

    test('updates badge for system label ^t (starred)', () => {
        createMockTabBar([{ value: '#starred', type: 'hash' }]);

        handleUnreadUpdates([{ label: '^t', count: 7 }]);

        const bar = document.getElementById('gmail-labels-as-tabs-bar')!;
        const countSpan = bar.querySelector('.unread-count');
        expect(countSpan?.textContent).toBe('7');
    });

    test('clears badge when count is 0', () => {
        createMockTabBar([{ value: '#inbox', type: 'hash' }]);

        handleUnreadUpdates([{ label: '^i', count: 0 }]);

        const bar = document.getElementById('gmail-labels-as-tabs-bar')!;
        const countSpan = bar.querySelector('.unread-count');
        expect(countSpan?.textContent).toBe('');
    });

    test('does nothing when bar is absent', () => {
        // No bar in DOM
        expect(() => handleUnreadUpdates([{ label: '^i', count: 5 }])).not.toThrow();
    });

    test('handles multiple updates in one call', () => {
        createMockTabBar([
            { value: '#inbox', type: 'hash' },
            { value: '#starred', type: 'hash' },
        ]);

        handleUnreadUpdates([
            { label: '^i', count: 2 },
            { label: '^t', count: 4 },
        ]);

        const bar = document.getElementById('gmail-labels-as-tabs-bar')!;
        const counts = bar.querySelectorAll('.unread-count');
        expect(counts[0].textContent).toBe('2');
        expect(counts[1].textContent).toBe('4');
    });
});
