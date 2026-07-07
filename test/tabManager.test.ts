export {};
/**
 * tabManager.test.ts
 *
 * Unit tests for the shared tab-manager module: add-tab input parsing and the
 * managed tab-list rendering/reorder/remove wiring used by both surfaces.
 */

const mockRemoveTab = jest.fn().mockResolvedValue(undefined);
const mockUpdateTabOrder = jest.fn().mockResolvedValue(undefined);

jest.mock('../src/utils/storage', () => ({
    removeTab: (...args: any[]) => mockRemoveTab(...args),
    updateTabOrder: (...args: any[]) => mockUpdateTabOrder(...args),
}));

// Real tabListRenderer + dragdrop are used (they work under jsdom).
import {
    isUrlLikeInput,
    deriveTitleFromUrl,
    parseTabInput,
    renderManagedTabList,
} from '../src/modules/tabManager';
import { Tab } from '../src/utils/storage';

beforeEach(() => {
    jest.clearAllMocks();
    document.body.innerHTML = '';
});

// ---------------------------------------------------------------------------
// Pure parsers
// ---------------------------------------------------------------------------

describe('isUrlLikeInput', () => {
    test('detects URLs, gmail links, and hash routes', () => {
        expect(isUrlLikeInput('https://mail.google.com/#label/Work')).toBe(true);
        expect(isUrlLikeInput('mail.google.com/mail/u/0/#inbox')).toBe(true);
        expect(isUrlLikeInput('#starred')).toBe(true);
    });

    test('treats bare label names as non-URL', () => {
        expect(isUrlLikeInput('Work')).toBe(false);
        expect(isUrlLikeInput('Personal/Projects')).toBe(false);
    });
});

describe('deriveTitleFromUrl', () => {
    test('extracts and decodes a search title', () => {
        expect(deriveTitleFromUrl('#search/is%3Aunread+from%3Aboss')).toBe('is:unread from:boss');
    });

    test('extracts and decodes a label title', () => {
        expect(deriveTitleFromUrl('#label/Team+Updates')).toBe('Team Updates');
    });

    test('returns empty string when nothing to derive', () => {
        expect(deriveTitleFromUrl('#inbox')).toBe('');
        expect(deriveTitleFromUrl('Work')).toBe('');
    });
});

describe('parseTabInput', () => {
    test('parses a bare label', () => {
        expect(parseTabInput('Work')).toEqual({ type: 'label', value: 'Work' });
    });

    test('strips a leading label: operator', () => {
        expect(parseTabInput('label:Work')).toEqual({ type: 'label', value: 'Work' });
    });

    test('parses a hash route as a hash tab', () => {
        expect(parseTabInput('#starred')).toEqual({ type: 'hash', value: '#starred' });
    });

    test('keeps only the hash portion of a full URL', () => {
        expect(parseTabInput('https://mail.google.com/mail/u/0/#label/Work')).toEqual({
            type: 'hash',
            value: '#label/Work',
        });
    });
});

// ---------------------------------------------------------------------------
// renderManagedTabList
// ---------------------------------------------------------------------------

describe('renderManagedTabList', () => {
    const tabs: Tab[] = [
        { id: 'a', title: 'Inbox', type: 'hash', value: '#inbox' },
        { id: 'b', title: 'Work', type: 'label', value: 'Work' },
    ];

    function setup() {
        const list = document.createElement('ul');
        document.body.appendChild(list);
        const reRender = jest.fn().mockResolvedValue(undefined);
        renderManagedTabList({
            listEl: list,
            tabs,
            getAccountId: () => 'user@gmail.com',
            reRender,
            renderTabBar: jest.fn(),
        });
        return { list, reRender };
    }

    test('renders one list item per tab', () => {
        const { list } = setup();
        expect(list.querySelectorAll('li[draggable]').length).toBe(2);
    });

    test('remove button persists via removeTab and triggers reRender', async () => {
        const { list, reRender } = setup();
        (list.querySelector('.remove-btn') as HTMLElement).click();
        await new Promise((r) => setTimeout(r, 0));

        expect(mockRemoveTab).toHaveBeenCalledWith('user@gmail.com', 'a');
        expect(reRender).toHaveBeenCalled();
    });

    test('move-down persists a reordered array via updateTabOrder', async () => {
        const { list, reRender } = setup();
        (list.querySelector('.down-btn') as HTMLElement).click();
        await new Promise((r) => setTimeout(r, 0));

        expect(mockUpdateTabOrder).toHaveBeenCalledTimes(1);
        const reordered = mockUpdateTabOrder.mock.calls[0][1];
        expect(reordered.map((t: Tab) => t.id)).toEqual(['b', 'a']);
        expect(reRender).toHaveBeenCalled();
    });
});
