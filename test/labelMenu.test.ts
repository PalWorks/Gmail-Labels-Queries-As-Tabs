export {};
/**
 * labelMenu.test.ts
 *
 * The "Show as Tabs" item in Gmail's own label menu.
 *
 * The fixture below is not invented. It is the structure captured from a live
 * Gmail on 2026-09-23 and recorded in scripts/canary/fingerprint.json: a
 * `[role="menu"]` carrying `J-N` items, a `J-Kh` separator with no role and no
 * text, a `J-Ph` submenu item, a section heading that also has no role but
 * does have text, and `pM aj0` triggers with `data-label-name`.
 *
 * Two of these tests exist because of failure modes that are *silent* rather
 * than visible, and neither would be caught by looking at a working Gmail:
 *
 *  - Gmail reuses one menu node for every label, so an item left in place acts
 *    on the label before last.
 *  - Our module must hardcode none of the classes above, which is asserted
 *    directly rather than left to review.
 */

import {
    installLabelMenu,
    uninstallLabelMenu,
    resolveLabelName,
    findTabForLabel,
    deriveTabTitle,
    removeMenuItem,
    MENU_ITEM_ID,
} from '../src/modules/labelMenu';
import { Tab } from '../src/utils/storage';

const mockRecordHealth = jest.fn();
jest.mock('../src/modules/health', () => ({
    recordIntegrationHealth: (...args: unknown[]) => mockRecordHealth(...args),
}));

jest.useFakeTimers();

// ---------------------------------------------------------------------------
// A Gmail, as measured
// ---------------------------------------------------------------------------

/**
 * jsdom lays nothing out, so every rect is zero and the module's visibility
 * tests would reject the whole fixture.
 *
 * Height comes from an attribute rather than a patched method on each element,
 * for one reason that matters: `cloneNode` copies attributes but not own
 * properties. A clone must be laid out like the item it was cloned from, which
 * is exactly what the module checks before it commits, so a fixture where
 * clones have no height would report a mismatch that says nothing about a real
 * browser.
 */
const HEIGHT_ATTR = 'data-test-height';

Element.prototype.getBoundingClientRect = function (this: Element): DOMRect {
    const height = Number(this.getAttribute(HEIGHT_ATTR) ?? 0);
    const width = height > 0 ? 200 : 0;
    return {
        height,
        width,
        top: 0,
        left: 0,
        right: width,
        bottom: height,
        x: 0,
        y: 0,
        toJSON: () => ({}),
    } as DOMRect;
};

function withHeight(el: Element, height: number): void {
    el.setAttribute(HEIGHT_ATTR, String(height));
}

function buildGmail(labels: string[]): void {
    document.body.innerHTML = `
        <div role="navigation">
            ${labels
                .map(
                    (name) => `
                <div class="aim">
                  <div class="TO" data-tooltip="${name}">
                    <div class="TN aY7xie aEc">
                      <a href="https://mail.google.com/mail/u/0/#label/${encodeURIComponent(name).replace(/%20/g, '+')}">${name}</a>
                      <div class="nL aig">
                        <div class="pM aj0" data-label-name="${name}" aria-haspopup="true" tabindex="0">&#9660;</div>
                      </div>
                    </div>
                  </div>
                </div>`
                )
                .join('')}
        </div>
        <div class="J-M J-M-ayU aka" role="menu" id="gmail-label-menu" style="display:none">
            <div class="J-N J-Ph" role="menuitem" aria-haspopup="true"><div class="J-N-Jz">Label colour</div></div>
            <div class="J-Kh"></div>
            <div class="J-awr J-awr-JE">In message list</div>
            <div class="J-N" role="menuitem"><div class="J-N-Jz">Show</div></div>
            <div class="J-Kh"></div>
            <div class="J-N" role="menuitem"><div class="J-N-Jz">Edit</div></div>
            <div class="J-N" role="menuitem"><div class="J-N-Jz">Add sublabel</div></div>
        </div>
        <div class="J-M" role="menu" id="some-other-menu" style="display:none"></div>
    `;
}

function menu(): HTMLElement {
    return document.getElementById('gmail-label-menu') as HTMLElement;
}

/** Gmail opening its menu: it becomes laid out, and its items with it. */
function openMenu(): void {
    const m = menu();
    withHeight(m, 292);
    m.querySelectorAll('[role="menuitem"]').forEach((i) => withHeight(i, 32));
    m.querySelectorAll('.J-Kh').forEach((s) => withHeight(s, 9));
    m.querySelectorAll('.J-awr').forEach((s) => withHeight(s, 24));
}

function closeMenu(): void {
    const m = menu();
    m.removeAttribute(HEIGHT_ATTR);
    m.querySelectorAll('*').forEach((el) => el.removeAttribute(HEIGHT_ATTR));
}

function clickTrigger(labelName: string): void {
    const trigger = document.querySelector(`[data-label-name="${labelName}"]`) as HTMLElement;
    trigger.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
}

/**
 * Gmail opens the menu a moment after the press; drive the module's poll.
 *
 * Past the grace period in which a menu that was already open is ignored, so
 * this models the ordinary case: press, Gmail closes whatever was open, Gmail
 * opens the new one. The test that cares about the boundary steps the timers
 * itself.
 */
function letMenuOpen(): void {
    openMenu();
    jest.advanceTimersByTime(400);
}

// ---------------------------------------------------------------------------
// Dependencies
// ---------------------------------------------------------------------------

let tabs: Tab[];
let addLabelTab: jest.Mock;
let removeLabelTab: jest.Mock;
let onChanged: jest.Mock;
let onError: jest.Mock;
let accountId: string | null;

function install(): void {
    installLabelMenu({
        getAccountId: () => accountId,
        getTabs: () => tabs,
        addLabelTab,
        removeLabelTab,
        onChanged,
        onError,
    });
}

beforeEach(() => {
    tabs = [];
    accountId = 'user@gmail.com';
    addLabelTab = jest.fn().mockResolvedValue(undefined);
    removeLabelTab = jest.fn().mockResolvedValue(undefined);
    onChanged = jest.fn();
    onError = jest.fn();
    (global as any).chrome = {
        runtime: { id: 'test-id', lastError: undefined },
        storage: { local: { get: jest.fn((_k: string[], cb: (v: any) => void) => cb({})), set: jest.fn() } },
        i18n: { getMessage: () => '' },
    };
    mockRecordHealth.mockClear();
    buildGmail(['Banking', 'Banking/ADCB Bank', 'Receipts']);
});

afterEach(() => {
    uninstallLabelMenu();
    jest.clearAllTimers();
});

// ---------------------------------------------------------------------------

describe('reading which label was clicked', () => {
    test('from the attribute Gmail provides today', () => {
        const trigger = document.querySelector('[data-label-name="Receipts"]') as HTMLElement;
        expect(resolveLabelName(trigger)).toBe('Receipts');
    });

    test('from a descendant of the trigger', () => {
        const trigger = document.querySelector('[data-label-name="Receipts"]') as HTMLElement;
        const child = document.createElement('span');
        trigger.appendChild(child);
        expect(resolveLabelName(child)).toBe('Receipts');
    });

    test('falls back to the tooltip when the attribute is gone', () => {
        document.querySelectorAll('[data-label-name]').forEach((e) => e.removeAttribute('data-label-name'));
        const trigger = document.querySelector('[aria-haspopup="true"]') as HTMLElement;
        expect(resolveLabelName(trigger)).toBe('Banking');
    });

    test('falls back to the label link when both are gone', () => {
        document.querySelectorAll('[data-label-name]').forEach((e) => e.removeAttribute('data-label-name'));
        document.querySelectorAll('[data-tooltip]').forEach((e) => e.removeAttribute('data-tooltip'));
        const trigger = document.querySelectorAll('[aria-haspopup="true"]')[1] as HTMLElement;
        expect(resolveLabelName(trigger)).toBe('Banking/ADCB Bank');
    });

    test('a click on something that opens no menu is not a label', () => {
        // Without this gate, `data-tooltip` alone would match half of Gmail.
        const elsewhere = document.createElement('div');
        elsewhere.setAttribute('data-tooltip', 'Compose');
        document.body.appendChild(elsewhere);
        expect(resolveLabelName(elsewhere)).toBeNull();
    });

    test("Gmail's internal labels are not offered as tabs", () => {
        const trigger = document.querySelector('[data-label-name="Receipts"]') as HTMLElement;
        trigger.setAttribute('data-label-name', '^i');
        expect(resolveLabelName(trigger)).toBeNull();
    });
});

describe('adding the item', () => {
    test('it appears at the bottom of the menu, after a separator', () => {
        install();
        clickTrigger('Receipts');
        letMenuOpen();

        const item = document.getElementById(MENU_ITEM_ID);
        expect(item).not.toBeNull();
        expect(menu().lastElementChild).toBe(item);
        expect(item!.previousElementSibling?.getAttribute('data-glt-separator')).toBe(MENU_ITEM_ID);
    });

    test('it inherits Gmail’s classes rather than any of our own', () => {
        install();
        clickTrigger('Receipts');
        letMenuOpen();

        const item = document.getElementById(MENU_ITEM_ID) as HTMLElement;
        // Exactly the model's classes: whatever Gmail calls them that day.
        expect(item.className).toBe('J-N');
        expect(item.getAttribute('role')).toBe('menuitem');
    });

    test('it does not clone the submenu item', () => {
        // Cloning "Label colour" would produce an item with an arrow glyph
        // that opens nothing.
        install();
        clickTrigger('Receipts');
        letMenuOpen();

        const item = document.getElementById(MENU_ITEM_ID) as HTMLElement;
        expect(item.textContent).not.toContain('Label colour');
        expect(item.hasAttribute('aria-haspopup')).toBe(false);
    });

    test('it is reachable from the keyboard', () => {
        install();
        clickTrigger('Receipts');
        letMenuOpen();
        expect(document.getElementById(MENU_ITEM_ID)?.getAttribute('tabindex')).toBe('0');
    });
});

describe('what the item says', () => {
    test('a label with no tab is offered as one', () => {
        install();
        clickTrigger('Receipts');
        letMenuOpen();
        expect(document.getElementById(MENU_ITEM_ID)?.textContent).toBe('Show as Tabs');
    });

    test('a label that already has a tab is offered the other way', () => {
        tabs = [{ id: 't1', title: 'Receipts', type: 'label', value: 'Receipts' }];
        install();
        clickTrigger('Receipts');
        letMenuOpen();
        expect(document.getElementById(MENU_ITEM_ID)?.textContent).toBe('Remove from Tabs');
    });

    test('matching a label to its tab ignores case', () => {
        const list: Tab[] = [{ id: 't1', title: 'Receipts', type: 'label', value: 'receipts' }];
        expect(findTabForLabel(list, 'Receipts')?.id).toBe('t1');
    });

    test('a hash tab with the same value is not the label’s tab', () => {
        const list: Tab[] = [{ id: 't1', title: 'Receipts', type: 'hash', value: 'Receipts' }];
        expect(findTabForLabel(list, 'Receipts')).toBeUndefined();
    });
});

describe('acting on it', () => {
    test('adds a label tab for the label that was clicked', async () => {
        install();
        clickTrigger('Receipts');
        letMenuOpen();

        document.getElementById(MENU_ITEM_ID)!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await Promise.resolve();

        expect(addLabelTab).toHaveBeenCalledWith('Receipts', 'Receipts');
        expect(onChanged).toHaveBeenCalled();
    });

    test('Enter activates it as a click does', async () => {
        install();
        clickTrigger('Receipts');
        letMenuOpen();

        document.getElementById(MENU_ITEM_ID)!.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })
        );
        await Promise.resolve();

        expect(addLabelTab).toHaveBeenCalledWith('Receipts', 'Receipts');
    });

    test('removes the tab when the label already has one', async () => {
        tabs = [{ id: 'tab-9', title: 'Receipts', type: 'label', value: 'Receipts' }];
        install();
        clickTrigger('Receipts');
        letMenuOpen();

        document.getElementById(MENU_ITEM_ID)!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await Promise.resolve();

        expect(removeLabelTab).toHaveBeenCalledWith('tab-9');
        expect(addLabelTab).not.toHaveBeenCalled();
    });

    test('the menu is closed and the item taken away afterwards', async () => {
        install();
        clickTrigger('Receipts');
        letMenuOpen();

        document.getElementById(MENU_ITEM_ID)!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await Promise.resolve();

        expect(document.getElementById(MENU_ITEM_ID)).toBeNull();
    });

    test('a failed write is reported rather than swallowed', async () => {
        // A menu item that silently does nothing is the defect this codebase
        // has fixed most often. See ADR-017.
        addLabelTab.mockRejectedValue(new Error('storage is full'));
        install();
        clickTrigger('Receipts');
        letMenuOpen();

        document.getElementById(MENU_ITEM_ID)!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await Promise.resolve();
        await Promise.resolve();

        expect(onError).toHaveBeenCalled();
        expect(onChanged).not.toHaveBeenCalled();
    });
});

describe('sublabels', () => {
    test('a sublabel gets its own tab, carrying the full path as the value', async () => {
        install();
        clickTrigger('Banking/ADCB Bank');
        letMenuOpen();

        document.getElementById(MENU_ITEM_ID)!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await Promise.resolve();

        // Leaf as the title, full path as the value: the bar is horizontal and
        // narrow, and navigation needs the real label name.
        expect(addLabelTab).toHaveBeenCalledWith('ADCB Bank', 'Banking/ADCB Bank');
    });

    test('a leaf that would collide falls back to the full path', () => {
        const existing: Tab[] = [{ id: 't1', title: 'ADCB Bank', type: 'label', value: 'Old/ADCB Bank' }];
        expect(deriveTabTitle('Banking/ADCB Bank', existing)).toBe('Banking/ADCB Bank');
    });

    test('a leaf that collides with its own tab is not a collision', () => {
        const existing: Tab[] = [{ id: 't1', title: 'ADCB Bank', type: 'label', value: 'Banking/ADCB Bank' }];
        expect(deriveTabTitle('Banking/ADCB Bank', existing)).toBe('ADCB Bank');
    });

    test('a top-level label keeps its whole name', () => {
        expect(deriveTabTitle('Receipts', [])).toBe('Receipts');
    });

    test('a trailing slash is not read as an empty leaf', () => {
        expect(deriveTabTitle('Banking/', [])).toBe('Banking/');
    });
});

describe('the menu node Gmail reuses', () => {
    test('a second label rebuilds the item, so it never acts on the first', async () => {
        // This is the one failure mode that is silently wrong rather than
        // visibly absent: Gmail hands back the identical menu element for
        // every label, so an item left in place would keep its first target.
        install();

        clickTrigger('Receipts');
        letMenuOpen();
        expect(document.getElementById(MENU_ITEM_ID)?.textContent).toBe('Show as Tabs');

        closeMenu();
        document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        expect(document.getElementById(MENU_ITEM_ID)).toBeNull();

        tabs = [{ id: 'tab-1', title: 'Banking', type: 'label', value: 'Banking' }];
        clickTrigger('Banking');
        letMenuOpen();
        expect(document.getElementById(MENU_ITEM_ID)?.textContent).toBe('Remove from Tabs');

        document.getElementById(MENU_ITEM_ID)!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await Promise.resolve();
        expect(removeLabelTab).toHaveBeenCalledWith('tab-1');
    });

    test('only one item exists however many times a menu is opened', () => {
        install();
        for (const name of ['Receipts', 'Banking', 'Receipts']) {
            clickTrigger(name);
            letMenuOpen();
        }
        expect(document.querySelectorAll(`#${MENU_ITEM_ID}`).length).toBe(1);
        expect(document.querySelectorAll('[data-glt-separator]').length).toBe(1);
    });

    test('clicking away takes the item out, so it cannot surface in another menu', () => {
        install();
        clickTrigger('Receipts');
        letMenuOpen();
        expect(document.getElementById(MENU_ITEM_ID)).not.toBeNull();

        document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        expect(document.getElementById(MENU_ITEM_ID)).toBeNull();
    });
});

describe('giving up', () => {
    test('no menu ever opens: nothing is added and the poll stops', () => {
        install();
        clickTrigger('Receipts');
        // Past MENU_WAIT_MS, which is ten seconds because Gmail was measured
        // taking 2.3 of them once and 4.1 another time.
        jest.advanceTimersByTime(11000);
        expect(document.getElementById(MENU_ITEM_ID)).toBeNull();
    });

    test('a menu with no ordinary item to copy is left alone', () => {
        install();
        menu()
            .querySelectorAll('[role="menuitem"]:not([aria-haspopup])')
            .forEach((i) => i.remove());
        clickTrigger('Receipts');
        letMenuOpen();
        expect(document.getElementById(MENU_ITEM_ID)).toBeNull();
        expect(menu().querySelectorAll('[data-glt-separator]').length).toBe(0);
    });

    test('no account yet: nothing is added', () => {
        accountId = null;
        install();
        clickTrigger('Receipts');
        letMenuOpen();
        expect(document.getElementById(MENU_ITEM_ID)).toBeNull();
    });

    test('a menu with no separator still gets the item', () => {
        // The separator is decoration. Losing it must not lose the feature.
        install();
        menu()
            .querySelectorAll('.J-Kh')
            .forEach((s) => s.remove());
        clickTrigger('Receipts');
        letMenuOpen();
        expect(document.getElementById(MENU_ITEM_ID)).not.toBeNull();
        expect(document.querySelectorAll('[data-glt-separator]').length).toBe(0);
    });

    test('the section heading is never mistaken for a separator', () => {
        // "In message list" has no role either. Only the empty one is a rule.
        install();
        clickTrigger('Receipts');
        letMenuOpen();
        const separator = document.querySelector('[data-glt-separator]') as HTMLElement;
        expect(separator.textContent).toBe('');
        expect(separator.className).toBe('J-Kh');
    });
});

describe('housekeeping', () => {
    test('removing the item when there is none is harmless', () => {
        expect(() => removeMenuItem()).not.toThrow();
    });

    test('uninstalling stops it responding to clicks', () => {
        install();
        uninstallLabelMenu();
        clickTrigger('Receipts');
        letMenuOpen();
        expect(document.getElementById(MENU_ITEM_ID)).toBeNull();
    });

    test('installing twice does not attach twice', () => {
        install();
        install();
        clickTrigger('Receipts');
        letMenuOpen();
        expect(document.querySelectorAll(`#${MENU_ITEM_ID}`).length).toBe(1);
    });
});

// ---------------------------------------------------------------------------
// What the user is told when it does not work
// ---------------------------------------------------------------------------

describe('recording its own health', () => {
    const lastCall = (): unknown[] => mockRecordHealth.mock.calls[mockRecordHealth.mock.calls.length - 1];

    test('installing records nothing, so a second Gmail tab cannot wipe the first one\u2019s verdict', () => {
        // Every Gmail page load installs this. A write here would overwrite an
        // 'unavailable' that another tab had just recorded, which is the one
        // reading anybody cares about. Absence already reads as "not used yet".
        install();
        expect(mockRecordHealth).not.toHaveBeenCalled();
    });

    test('a successful injection records that it is working', () => {
        install();
        clickTrigger('Receipts');
        letMenuOpen();
        expect(lastCall()).toEqual(['labelMenu', 'active']);
    });

    test('a menu that never opens is recorded as such', () => {
        install();
        clickTrigger('Receipts');
        jest.advanceTimersByTime(11000);
        expect(lastCall()).toEqual(['labelMenu', 'unavailable', 'no-menu']);
    });

    test('a menu with nothing to clone is recorded as such', () => {
        install();
        menu()
            .querySelectorAll('[role="menuitem"]:not([aria-haspopup])')
            .forEach((i) => i.remove());
        clickTrigger('Receipts');
        letMenuOpen();
        expect(lastCall()).toEqual(['labelMenu', 'unavailable', 'no-model']);
    });

    test('no account yet is recorded as such', () => {
        accountId = null;
        install();
        clickTrigger('Receipts');
        letMenuOpen();
        expect(lastCall()).toEqual(['labelMenu', 'unavailable', 'no-account']);
    });

    test('an item that does not render like its model is withdrawn, not left looking foreign', () => {
        // The one check that cannot be made before the item is in the DOM.
        const real = window.getComputedStyle.bind(window);
        const spy = jest.spyOn(window, 'getComputedStyle').mockImplementation(((el: Element) => {
            const base = real(el as HTMLElement);
            if ((el as HTMLElement).id === MENU_ITEM_ID) {
                return { ...base, fontSize: '99px', fontFamily: 'Comic Sans', padding: '0px' } as CSSStyleDeclaration;
            }
            return { ...base, fontSize: '14px', fontFamily: 'Google Sans', padding: '6px 12px' } as CSSStyleDeclaration;
        }) as typeof window.getComputedStyle);

        install();
        clickTrigger('Receipts');
        letMenuOpen();

        expect(document.getElementById(MENU_ITEM_ID)).toBeNull();
        expect(document.querySelectorAll('[data-glt-separator]').length).toBe(0);
        expect(lastCall()).toEqual(['labelMenu', 'unavailable', 'clone-mismatch']);
        spy.mockRestore();
    });

    test('a click that is not on a label records nothing at all', () => {
        install();
        mockRecordHealth.mockClear();
        document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        jest.advanceTimersByTime(11000);
        expect(mockRecordHealth).not.toHaveBeenCalled();
    });
});

// ---------------------------------------------------------------------------
// Hardening found by audit rather than by a report
// ---------------------------------------------------------------------------

describe('things that go wrong between opening the menu and clicking it', () => {
    test('a tab added elsewhere while the menu was open is not duplicated', async () => {
        install();
        clickTrigger('Receipts');
        letMenuOpen();
        expect(document.getElementById(MENU_ITEM_ID)?.textContent).toBe('Show as Tabs');

        // The options page, or another Gmail tab, adds it while this menu sits
        // open. The wording is now stale; what the click does must not be.
        tabs = [{ id: 'elsewhere', title: 'Receipts', type: 'label', value: 'Receipts' }];

        document.getElementById(MENU_ITEM_ID)!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await Promise.resolve();

        expect(addLabelTab).not.toHaveBeenCalled();
        expect(removeLabelTab).toHaveBeenCalledWith('elsewhere');
    });

    test('a tab removed elsewhere while the menu was open is added, not removed again', async () => {
        tabs = [{ id: 'doomed', title: 'Receipts', type: 'label', value: 'Receipts' }];
        install();
        clickTrigger('Receipts');
        letMenuOpen();
        expect(document.getElementById(MENU_ITEM_ID)?.textContent).toBe('Remove from Tabs');

        tabs = [];
        document.getElementById(MENU_ITEM_ID)!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await Promise.resolve();

        expect(removeLabelTab).not.toHaveBeenCalled();
        expect(addLabelTab).toHaveBeenCalledWith('Receipts', 'Receipts');
    });

    test('a failed write is recorded where the user can see it', async () => {
        addLabelTab.mockRejectedValue(new Error('storage is full'));
        install();
        clickTrigger('Receipts');
        letMenuOpen();

        document.getElementById(MENU_ITEM_ID)!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await Promise.resolve();
        await Promise.resolve();

        expect(mockRecordHealth).toHaveBeenCalledWith('labelMenu', 'unavailable', 'write-failed');
    });
});

describe('what the clone must not inherit', () => {
    test("Gmail's own event wiring is stripped", () => {
        // Gmail dispatches through `jsaction`. A clone that kept one would run
        // Gmail's handler for the item it was copied from.
        const model = menu().querySelectorAll('[role="menuitem"]')[3] as HTMLElement;
        model.setAttribute('jsaction', 'someGmailHandler');
        (model.firstElementChild as HTMLElement).setAttribute('jsaction', 'anotherOne');

        install();
        clickTrigger('Receipts');
        letMenuOpen();

        const item = document.getElementById(MENU_ITEM_ID) as HTMLElement;
        expect(item.hasAttribute('jsaction')).toBe(false);
        expect(item.querySelectorAll('[jsaction]').length).toBe(0);
    });

    test("the model's element ids are stripped, so nothing is duplicated in the document", () => {
        const model = menu().querySelectorAll('[role="menuitem"]')[3] as HTMLElement;
        (model.firstElementChild as HTMLElement).id = 'gmail-owns-this-id';

        install();
        clickTrigger('Receipts');
        letMenuOpen();

        expect(document.querySelectorAll('#gmail-owns-this-id').length).toBe(1);
    });
});

// ---------------------------------------------------------------------------
// What only a real mouse would have found
// ---------------------------------------------------------------------------

describe('a real mouse press, not a dispatched click', () => {
    /**
     * A browser fires mousedown, then mouseup, then click. If the mousedown
     * target has left the document by then, the click goes to the nearest
     * ancestor still in it, and the removed node's handler never runs.
     *
     * Every other test here dispatches `click` straight at the element, and a
     * detached node receives a directly dispatched event perfectly well. So
     * does the live browser check. This is the sequence that tells them apart.
     */
    function pressAndRelease(el: HTMLElement): void {
        el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        if (el.isConnected) el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }

    test('pressing the item does not remove it before the click lands', async () => {
        install();
        clickTrigger('Receipts');
        letMenuOpen();

        const item = document.getElementById(MENU_ITEM_ID) as HTMLElement;
        pressAndRelease(item);
        await Promise.resolve();

        expect(addLabelTab).toHaveBeenCalledWith('Receipts', 'Receipts');
    });

    test('pressing anywhere else still takes the item away', () => {
        install();
        clickTrigger('Receipts');
        letMenuOpen();
        expect(document.getElementById(MENU_ITEM_ID)).not.toBeNull();

        pressAndRelease(document.body);
        expect(document.getElementById(MENU_ITEM_ID)).toBeNull();
    });
});

describe('a menu that was already open', () => {
    test('is not mistaken for the one the new label is about to open', () => {
        // Our capture listener runs before Gmail's, so when the user presses a
        // second label the first label's menu is still on screen. Injecting
        // into it and stopping would leave nothing in the menu that opens.
        install();
        clickTrigger('Receipts');
        letMenuOpen();
        expect(document.getElementById(MENU_ITEM_ID)?.textContent).toBe('Show as Tabs');

        // Second label, while the first menu is still laid out.
        tabs = [{ id: 'tab-1', title: 'Banking', type: 'label', value: 'Banking' }];
        clickTrigger('Banking');

        // Within the grace period the still-open menu is ignored, so nothing
        // has been put back yet.
        jest.advanceTimersByTime(200);
        expect(document.getElementById(MENU_ITEM_ID)).toBeNull();

        // Past it, the menu is taken at face value: Gmail reuses one node and
        // repositions it, so this is the right menu after all.
        jest.advanceTimersByTime(200);
        expect(document.getElementById(MENU_ITEM_ID)?.textContent).toBe('Remove from Tabs');
    });

    test('a genuinely new menu node is used at once, with no grace period', () => {
        install();
        clickTrigger('Receipts');
        letMenuOpen();

        // Gmail builds a fresh node for the next label instead of reusing one.
        closeMenu();
        const fresh = menu().cloneNode(true) as HTMLElement;
        fresh.id = 'gmail-label-menu-2';
        fresh.querySelector(`#${MENU_ITEM_ID}`)?.remove();
        document.body.appendChild(fresh);

        clickTrigger('Banking');
        withHeight(fresh, 292);
        fresh.querySelectorAll('[role="menuitem"]').forEach((i) => withHeight(i, 32));
        fresh.querySelectorAll('.J-Kh').forEach((s) => withHeight(s, 9));
        jest.advanceTimersByTime(100);

        expect(fresh.querySelector(`#${MENU_ITEM_ID}`)).not.toBeNull();
    });
});

// ---------------------------------------------------------------------------
// Which event actually activates it
// ---------------------------------------------------------------------------

describe('activation', () => {
    /**
     * Gmail tears its menu down on mousedown, not on click. Measured with a
     * real mouse through Chrome's input pipeline: our item receives pointerdown
     * and mousedown, and the click then lands on whatever Gmail has put under
     * the cursor by the time the button comes back up.
     *
     * So binding to click alone meant the item did nothing at all for a real
     * user, while every test here and every scripted browser check passed,
     * because a dispatched click goes wherever it is aimed. These tests are
     * what stop that coming back.
     */
    test('mousedown alone is enough', async () => {
        install();
        clickTrigger('Receipts');
        letMenuOpen();

        document.getElementById(MENU_ITEM_ID)!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        await Promise.resolve();

        expect(addLabelTab).toHaveBeenCalledWith('Receipts', 'Receipts');
    });

    test('a mousedown followed by a click acts once, not twice', async () => {
        install();
        clickTrigger('Receipts');
        letMenuOpen();

        const item = document.getElementById(MENU_ITEM_ID) as HTMLElement;
        item.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        item.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await Promise.resolve();

        expect(addLabelTab).toHaveBeenCalledTimes(1);
    });

    test('a rebuilt item can act again', () => {
        // The one-shot flag lives with the item, not with the module, so the
        // next menu open gets a fresh one.
        install();
        clickTrigger('Receipts');
        letMenuOpen();
        document.getElementById(MENU_ITEM_ID)!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

        document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        clickTrigger('Banking');
        letMenuOpen();
        document.getElementById(MENU_ITEM_ID)!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

        expect(addLabelTab).toHaveBeenCalledTimes(2);
    });
});

// ---------------------------------------------------------------------------
// The highlight under the pointer
// ---------------------------------------------------------------------------

describe('lighting up under the pointer, the way Gmail\'s own items do', () => {
    /**
     * Gmail highlights by adding a class from its own `jsaction` handler, not
     * by a `:hover` rule: measured against a live inbox on 2026-09-23, the
     * hovered item went from `J-N` to `J-N J-N-JT` while no stylesheet in the
     * page carried a `:hover` selector matching it. A clone therefore inherits
     * a dead item, and the class has to be learned at runtime rather than
     * written down here.
     *
     * This stands in for that handler. The class name is this test's invention,
     * which is the point: nothing in the module knows it.
     */
    function giveGmailAHighlight(added = 'HOVER-CLASS'): HTMLElement {
        const model = Array.from(menu().querySelectorAll<HTMLElement>('[role="menuitem"]')).filter(
            (i) => !i.hasAttribute('aria-haspopup')
        ).pop() as HTMLElement;
        model.addEventListener('mouseover', () => model.classList.add(...added.split(' ')));
        model.addEventListener('mouseout', () => model.classList.remove(...added.split(' ')));
        return model;
    }

    function hover(el: HTMLElement, on: boolean): void {
        el.dispatchEvent(new MouseEvent(on ? 'mouseenter' : 'mouseleave', { bubbles: false }));
    }

    test('our item takes on whatever class Gmail puts on a hovered item', () => {
        giveGmailAHighlight();
        install();
        clickTrigger('Receipts');
        letMenuOpen();

        const item = document.getElementById(MENU_ITEM_ID) as HTMLElement;
        expect(item.classList.contains('HOVER-CLASS')).toBe(false);

        hover(item, true);
        expect(item.classList.contains('HOVER-CLASS')).toBe(true);

        hover(item, false);
        expect(item.classList.contains('HOVER-CLASS')).toBe(false);
    });

    test('the keyboard gets the same highlight as the mouse', () => {
        giveGmailAHighlight();
        install();
        clickTrigger('Receipts');
        letMenuOpen();

        const item = document.getElementById(MENU_ITEM_ID) as HTMLElement;
        item.dispatchEvent(new FocusEvent('focus'));
        expect(item.classList.contains('HOVER-CLASS')).toBe(true);
        item.dispatchEvent(new FocusEvent('blur'));
        expect(item.classList.contains('HOVER-CLASS')).toBe(false);
    });

    test('Gmail\'s own item is left exactly as it was found', () => {
        const model = giveGmailAHighlight();
        const before = model.getAttribute('class');
        install();
        clickTrigger('Receipts');
        letMenuOpen();
        expect(model.getAttribute('class')).toBe(before);
    });

    test('a handler that highlights and never un-highlights still leaves it clean', () => {
        const model = Array.from(menu().querySelectorAll<HTMLElement>('[role="menuitem"]')).filter(
            (i) => !i.hasAttribute('aria-haspopup')
        ).pop() as HTMLElement;
        const before = model.getAttribute('class');
        model.addEventListener('mouseover', () => model.classList.add('STICKY'));

        install();
        clickTrigger('Receipts');
        letMenuOpen();

        expect(model.getAttribute('class')).toBe(before);

        const item = document.getElementById(MENU_ITEM_ID) as HTMLElement;
        hover(item, true);
        expect(item.classList.contains('STICKY')).toBe(true);
    });

    test('a Gmail that highlights nothing gets a wash instead, dark on light', () => {
        install();
        clickTrigger('Receipts');
        letMenuOpen();

        const item = document.getElementById(MENU_ITEM_ID) as HTMLElement;
        hover(item, true);
        expect(item.style.backgroundColor).toBe('rgba(0, 0, 0, 0.06)');
        hover(item, false);
        expect(item.style.backgroundColor).toBe('');
    });

    test('and light on dark, read from the menu Gmail drew', () => {
        const real = window.getComputedStyle.bind(window);
        const spy = jest.spyOn(window, 'getComputedStyle').mockImplementation(((el: Element) => {
            const base = real(el as HTMLElement);
            if ((el as HTMLElement).getAttribute('role') === 'menu') {
                return { ...base, backgroundColor: 'rgb(32, 33, 36)' } as CSSStyleDeclaration;
            }
            return base;
        }) as typeof window.getComputedStyle);

        install();
        clickTrigger('Receipts');
        letMenuOpen();

        const item = document.getElementById(MENU_ITEM_ID) as HTMLElement;
        hover(item, true);
        expect(item.style.backgroundColor).toBe('rgba(255, 255, 255, 0.1)');
        spy.mockRestore();
    });

    test('a handler that does something wilder than a highlight is not copied', () => {
        // Six classes is not a highlight. Copying whatever appears would make
        // us imitate a behaviour we have not understood.
        giveGmailAHighlight('A B C D E F');
        install();
        clickTrigger('Receipts');
        letMenuOpen();

        const item = document.getElementById(MENU_ITEM_ID) as HTMLElement;
        hover(item, true);
        expect(item.classList.contains('A')).toBe(false);
        expect(item.style.backgroundColor).toBe('rgba(0, 0, 0, 0.06)');
    });
});
