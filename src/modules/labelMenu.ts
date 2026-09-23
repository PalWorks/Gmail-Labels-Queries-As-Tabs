/**
 * labelMenu.ts
 *
 * Adds one item to the menu Gmail opens from a label's three-dot button:
 * "Show as Tabs", or "Remove from Tabs" when that label already has a tab.
 *
 * ## Why this hardcodes no Gmail class name
 *
 * Gmail's class names (`J-N`, `J-M J-M-ayU aka`, `pM aj0`) are obfuscated, but
 * they are **not** randomised per installation: measured on 2026-09-23 across
 * two independent Chrome installations with different user-data-dirs and
 * different Chrome patch builds, every string was byte-identical. What varies
 * is the Gmail build, which is global and occasional.
 *
 * So the risk is not that our selectors are wrong for some users. It is that
 * they go stale for all of them at once, on a day Gmail chooses. A competitor
 * shipping this same feature hardcodes `J-N`, `J-N-Jz` and `J-Kh`, and their
 * label selector has already rotted.
 *
 * This module reads Gmail's classes instead of writing them. It finds an
 * ordinary menu item, clones it, and changes its text. The clone inherits
 * whatever Gmail's classes happen to be that day, so a rename is not an event.
 *
 * Its only inputs are ARIA roles and data attributes:
 *
 *   [role="menu"]        which element is the menu
 *   [role="menuitem"]    which children are items
 *   aria-haspopup        which of those open a submenu, so are poor models
 *   [data-label-name]    which label was clicked (with two fallbacks)
 *
 * ## Fail closed
 *
 * Every step can give up, and giving up means Gmail is left exactly as it was.
 * There is no degraded mode, no half-drawn item and no guess. Each give-up
 * path records why in `health.ts`, so a user in an A/B bucket we cannot see
 * has something to report.
 *
 * ## Why the item is rebuilt on every open
 *
 * Gmail reuses **one** menu node for every label: opening the menu on two
 * different labels returns the identical DOM element, and an item injected
 * into it survives close and reopen on its own. Left alone, our item would
 * keep the first label it was built for and silently act on the wrong one.
 *
 * It would also risk appearing in a menu that is not a label menu, since a
 * Gmail page holds eight to ten `[role="menu"]` nodes and we have confirmed
 * reuse within label menus, not the absence of reuse across kinds.
 *
 * So: removed when the menu closes, rebuilt when it opens. One clone per menu
 * open costs nothing, and it makes both faults structurally impossible rather
 * than merely unobserved.
 */

import { Tab } from '../utils/storage';
import { recordIntegrationHealth } from './health';

/** The id our item carries, which is also what the drift canary looks for. */
export const MENU_ITEM_ID = 'glt-show-as-tabs';

/**
 * How long to wait for Gmail to open a menu after the trigger was clicked.
 *
 * Ten seconds, which sounds absurd for a menu, and is not. Measured on a cold
 * profile on 2026-09-23, Gmail took **2.3 seconds** once and **4.1 seconds**
 * another time to show it. The 1.5 second ceiling this had first would have
 * meant no item at all for anyone on a slow machine or a slow connection, and
 * that looks exactly like the feature not existing rather than like a timeout.
 *
 * The cost of a high ceiling is one cheap query every 50ms while a menu is
 * opening. The poll stops the moment the menu appears, the moment the user
 * clicks anywhere else, and at the ceiling. A user who opens a menu and waits
 * ten seconds has already gone somewhere else, and going somewhere else is
 * itself what stops the poll.
 */
const MENU_WAIT_MS = 10000;
const MENU_POLL_MS = 50;

/**
 * How long a menu that was already open when the press happened is ignored.
 *
 * Gmail closes the old menu and opens the new one in its own handlers, which
 * run after ours. Past this grace period, a still-visible menu is taken at face
 * value, which is right when Gmail reuses one node and simply repositions it.
 */
const STALE_MENU_GRACE_MS = 300;

export interface LabelMenuDeps {
    /** The signed-in address, or null before it has been detected. */
    getAccountId: () => string | null;
    /** The account's current tabs, for deciding which way the item reads. */
    getTabs: () => Tab[];
    /** Add a label tab. */
    addLabelTab: (title: string, labelName: string) => Promise<void>;
    /** Remove a tab by id. */
    removeLabelTab: (tabId: string) => Promise<void>;
    /** Redraw the tab bar after a change. */
    onChanged: () => void;
    /** Report a failure the user should be told about. */
    onError?: (error: unknown) => void;
}

let deps: LabelMenuDeps | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let installed = false;

// ---------------------------------------------------------------------------
// Reading Gmail, without reading Gmail's classes
// ---------------------------------------------------------------------------

/**
 * True for Gmail's internal label identifiers (`^i`, `#^assistive_purchase`).
 * They appear in the same list as the user's own labels and are not things a
 * user would ever want a tab for.
 */
function isInternalLabel(name: string): boolean {
    return name.startsWith('^') || name.startsWith('#^');
}

/**
 * Which label the click was on, read three ways.
 *
 * The first is what today's Gmail provides. The other two exist because a
 * single attribute is a single point of failure, and both were confirmed
 * present alongside it: 31 elements carry `data-label-name`, their ancestors
 * carry `data-tooltip`, and 26 anchors carry a `#label/` href.
 *
 * The fallbacks are deliberately gated on `aria-haspopup`, so they only fire
 * for something that actually opens a menu. Without that gate, `data-tooltip`
 * would match half of Gmail's chrome.
 */
export function resolveLabelName(target: EventTarget | null): string | null {
    // A mousedown dispatched on `document` (the menu's own dismissal path, and
    // ours) has a target that is not an Element and has no `closest`.
    if (!target || typeof (target as Element).closest !== 'function') return null;
    const element = target as Element;

    const direct = element.closest('[data-label-name]');
    if (direct) {
        const name = direct.getAttribute('data-label-name') ?? '';
        if (name && !isInternalLabel(name)) return name;
        return null;
    }

    const trigger = element.closest('[aria-haspopup="true"]');
    if (!trigger) return null;

    const tooltipHost = trigger.closest('[data-tooltip]');
    const tooltip = tooltipHost?.getAttribute('data-tooltip') ?? '';
    if (tooltip && !isInternalLabel(tooltip)) return tooltip;

    // The row that holds both the trigger and the label's own link.
    let row: Element | null = trigger.parentElement;
    for (let depth = 0; row && depth < 5; depth++, row = row.parentElement) {
        const link = row.querySelector('a[href*="#label/"]');
        const href = link?.getAttribute('href') ?? '';
        const raw = href.split('#label/')[1];
        if (raw) {
            const name = decodeURIComponent(raw).replace(/\+/g, ' ');
            if (name && !isInternalLabel(name)) return name;
        }
    }
    return null;
}

/** The menu Gmail currently has open, if exactly one is open. */
function visibleMenu(): HTMLElement | null {
    const open = Array.from(document.querySelectorAll<HTMLElement>('[role="menu"]')).filter(
        (m) => m.getBoundingClientRect().height > 0
    );
    return open.length ? open[open.length - 1] : null;
}

/**
 * An ordinary item to copy: the last one that is visible and does not open a
 * submenu. A submenu item carries an arrow glyph and a different inner shape,
 * so cloning it produces an item with an arrow that goes nowhere.
 */
function pickModel(menu: HTMLElement): HTMLElement | null {
    const items = Array.from(menu.querySelectorAll<HTMLElement>('[role="menuitem"]')).filter(
        (i) => i.getBoundingClientRect().height > 0
    );
    for (let i = items.length - 1; i >= 0; i--) {
        if (!items[i].hasAttribute('aria-haspopup')) return items[i];
    }
    return null;
}

/**
 * A separator to copy, identified without a class: a direct child that carries
 * no role, holds no menu item and has no text of its own.
 *
 * The empty-text test is what distinguishes it from the section headings Gmail
 * puts in this same menu ("In message list"), which also carry no role.
 */
function pickSeparator(menu: HTMLElement): HTMLElement | null {
    for (const child of Array.from(menu.children)) {
        const el = child as HTMLElement;
        if (el.hasAttribute('role')) continue;
        if (el.querySelector('[role="menuitem"]')) continue;
        if ((el.textContent ?? '').trim() !== '') continue;
        if (el.getBoundingClientRect().height <= 0) continue;
        return el;
    }
    return null;
}

// ---------------------------------------------------------------------------
// What the item says and does
// ---------------------------------------------------------------------------

/** The tab for this label, if the account already has one. */
export function findTabForLabel(tabs: Tab[], labelName: string): Tab | undefined {
    const wanted = labelName.toLowerCase();
    return tabs.find((t) => t.type === 'label' && t.value.toLowerCase() === wanted);
}

/**
 * What the tab should be called.
 *
 * Gmail shows a nested label by its leaf ("ADCB Bank", indented under
 * "Banking") while its real name is the full path, and the tab bar is
 * horizontal, where width is the scarce resource. So: the leaf, unless another
 * tab already reads that, in which case the full path, which is never
 * ambiguous. Either way the user can rename it afterwards.
 */
export function deriveTabTitle(labelName: string, existingTabs: Tab[]): string {
    const slash = labelName.lastIndexOf('/');
    if (slash === -1) return labelName;
    const leaf = labelName.slice(slash + 1);
    if (!leaf) return labelName;
    const clash = existingTabs.some(
        (t) => t.title.toLowerCase() === leaf.toLowerCase() && t.value.toLowerCase() !== labelName.toLowerCase()
    );
    return clash ? labelName : leaf;
}

/**
 * The item's text, translated where a translation exists.
 *
 * The rest of this extension's copy is hardcoded English, and this deliberately
 * is not: the item sits among Gmail's own items, which are localised, so an
 * English line in a French menu reads as a broken menu rather than as our menu.
 */
function label(key: 'labelMenuShowAsTabs' | 'labelMenuRemoveFromTabs', fallback: string): string {
    try {
        return chrome.i18n?.getMessage?.(key) || fallback;
    } catch {
        return fallback;
    }
}

// ---------------------------------------------------------------------------
// Building the item
// ---------------------------------------------------------------------------

/** Remove our item wherever it is. Safe to call when there is none. */
export function removeMenuItem(): void {
    document.getElementById(MENU_ITEM_ID)?.remove();
    document.querySelector(`[data-glt-separator="${MENU_ITEM_ID}"]`)?.remove();
}

/**
 * Replace an item's visible text without assuming its inner shape.
 *
 * Gmail wraps the label in one child div today. Setting that child's text
 * keeps whatever wrapper it uses; falling back to the item itself keeps
 * working if it ever stops using one.
 */
function setItemText(item: HTMLElement, text: string): void {
    const wrapper = item.firstElementChild as HTMLElement | null;
    if (wrapper) wrapper.textContent = text;
    else item.textContent = text;
}

/**
 * Does the clone render like the item it was cloned from?
 *
 * Height is compared only when the model has one. A model of zero height means
 * the page is not laying out (jsdom, a hidden menu), and in that case the
 * comparison would report a mismatch that says nothing about the real browser.
 */
function rendersLikeModel(item: HTMLElement, model: HTMLElement): boolean {
    const modelBox = model.getBoundingClientRect();
    const itemBox = item.getBoundingClientRect();
    if (modelBox.height > 0 && Math.round(itemBox.height) !== Math.round(modelBox.height)) return false;

    const a = window.getComputedStyle(item);
    const b = window.getComputedStyle(model);
    return a.fontSize === b.fontSize && a.fontFamily === b.fontFamily && a.padding === b.padding;
}

/**
 * Build the item and put it at the bottom of the menu.
 *
 * Returns true when the item is in place. Every false is a give-up that has
 * already been recorded, and leaves the menu untouched.
 */
function injectInto(menu: HTMLElement, labelName: string): boolean {
    if (!deps) return false;

    const account = deps.getAccountId();
    if (!account) {
        recordIntegrationHealth('labelMenu', 'unavailable', 'no-account');
        return false;
    }

    const model = pickModel(menu);
    if (!model) {
        recordIntegrationHealth('labelMenu', 'unavailable', 'no-model');
        return false;
    }

    removeMenuItem();

    const tabs = deps.getTabs();
    const existing = findTabForLabel(tabs, labelName);

    const item = model.cloneNode(true) as HTMLElement;
    item.id = MENU_ITEM_ID;
    item.removeAttribute('aria-hidden');
    item.removeAttribute('aria-haspopup');
    item.style.removeProperty('display');
    // Gmail dispatches through `jsaction` attributes. Today's menu items carry
    // none, but a clone that inherited one would run Gmail's handler for
    // whatever item it was copied from, which is a bug that would look like
    // Gmail misbehaving rather than like us.
    item.removeAttribute('jsaction');
    item.querySelectorAll('[jsaction]').forEach((el) => el.removeAttribute('jsaction'));
    item.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'));
    // Gmail's own keyboard handling walks its own list of items, which will
    // never include ours. Making it focusable and handling the two activation
    // keys ourselves is what keeps it reachable without a mouse.
    item.setAttribute('tabindex', '0');
    setItemText(
        item,
        existing
            ? label('labelMenuRemoveFromTabs', 'Remove from Tabs')
            : label('labelMenuShowAsTabs', 'Show as Tabs')
    );

    const separatorSource = pickSeparator(menu);
    const separator = separatorSource ? (separatorSource.cloneNode(false) as HTMLElement) : null;
    if (separator) {
        separator.removeAttribute('id');
        separator.setAttribute('data-glt-separator', MENU_ITEM_ID);
        menu.appendChild(separator);
    }
    menu.appendChild(item);

    if (!rendersLikeModel(item, model)) {
        removeMenuItem();
        recordIntegrationHealth('labelMenu', 'unavailable', 'clone-mismatch');
        return false;
    }

    // Gmail tears its menu down on **mousedown**, not on click. Measured with
    // a real mouse through Chrome's input pipeline: our item receives
    // pointerdown and mousedown, and then the click lands on whatever Gmail has
    // put under the cursor by the time the button comes back up. Binding to
    // click alone meant the item did nothing at all for a real user, while
    // every test and every scripted check passed, because a dispatched click
    // goes wherever it is aimed.
    //
    // So mousedown is the activator, which is also what Gmail's own items do.
    // Click stays bound for the case where something fires it instead; the
    // flag makes the pair idempotent.
    let activated = false;
    const activate = (event: Event): void => {
        if (activated) return;
        activated = true;
        event.preventDefault();
        event.stopPropagation();
        // The tab list is read again here rather than reusing the one the
        // wording was built from. A menu can sit open while the user adds or
        // removes that very tab from the options page or another Gmail tab, in
        // which case the stale answer would try to add a duplicate or remove a
        // tab that has gone. `addTab` would dedupe the first and `removeTab`
        // would no-op the second, so nothing breaks either way; this simply
        // does the thing the user actually asked for.
        void act(labelName);
    };
    item.addEventListener('mousedown', activate);
    item.addEventListener('click', activate);
    item.addEventListener('keydown', (event) => {
        const key = (event as KeyboardEvent).key;
        if (key === 'Enter' || key === ' ' || key === 'Spacebar') activate(event);
    });

    recordIntegrationHealth('labelMenu', 'active');
    return true;
}

/**
 * Close the menu we just acted in.
 *
 * Gmail's own items close it through handlers we are not part of, so ours has
 * to do it. Escape is what Gmail itself listens for; the mousedown is the
 * dismissal path for the case where Escape is handled somewhere we cannot see.
 */
function closeMenu(): void {
    try {
        document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
        document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    } catch {
        /* a menu that will not close is still better than a thrown handler */
    }
    removeMenuItem();
}

/** Add or remove the tab, then close the menu and redraw the bar. */
async function act(labelName: string): Promise<void> {
    if (!deps) return;
    closeMenu();
    const tabs = deps.getTabs();
    const existing = findTabForLabel(tabs, labelName);
    try {
        if (existing) {
            await deps.removeLabelTab(existing.id);
        } else {
            await deps.addLabelTab(deriveTabTitle(labelName, tabs), labelName);
        }
        deps.onChanged();
    } catch (error) {
        // The write path can fail (orphaned context, storage quota) and a menu
        // item that silently does nothing is the defect this codebase has
        // fixed most often. See ADR-017. The menu is already closed by now, so
        // the only places left to say so are the caller's own reporting and
        // the health row on the options page.
        recordIntegrationHealth('labelMenu', 'unavailable', 'write-failed');
        deps.onError?.(error);
    }
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

function stopWaiting(): void {
    if (pollTimer !== null) {
        clearInterval(pollTimer);
        pollTimer = null;
    }
}

/**
 * Wait for Gmail to open the menu, then inject once.
 *
 * Polled rather than observed: a MutationObserver over the whole body for a
 * menu that appears within a second is more machinery, and more of it running
 * all the time, than twenty-odd cheap queries that stop as soon as they find
 * what they came for.
 */
function waitForMenu(labelName: string): void {
    stopWaiting();
    removeMenuItem();
    const startedAt = Date.now();
    // Whatever was already on screen when the press happened. Our own capture
    // listener runs before Gmail's, so at this instant the menu from the
    // previous label is still open, and a poll 50ms later could inject into it
    // and then stop, leaving nothing in the menu that actually opens.
    const alreadyOpen = visibleMenu();

    pollTimer = setInterval(() => {
        const menu = visibleMenu();
        if (menu && (menu !== alreadyOpen || Date.now() - startedAt >= STALE_MENU_GRACE_MS)) {
            stopWaiting();
            injectInto(menu, labelName);
            return;
        }
        if (Date.now() - startedAt >= MENU_WAIT_MS) {
            stopWaiting();
            recordIntegrationHealth('labelMenu', 'unavailable', 'no-menu');
        }
    }, MENU_POLL_MS);
}

/**
 * Capture-phase, so the decision is made before Gmail's own handlers run and
 * whatever they do to the DOM.
 */
function onPointerDown(event: Event): void {
    const target = event.target as Element | null;

    // A press on our own item is not "a click somewhere else". Removing the
    // item here would take it out of the document between mousedown and
    // mouseup, and the browser then dispatches the click to the nearest
    // ancestor still in the document rather than to the removed node: the
    // handler would never run and the item would do nothing at all.
    //
    // Neither the unit tests nor the live check could have caught it, because
    // both dispatch `click` directly at the element, and a detached node
    // receives a directly dispatched event perfectly well. Only a real mouse
    // would have found it.
    if (typeof target?.closest === 'function' && target.closest(`#${MENU_ITEM_ID}`)) return;

    const labelName = resolveLabelName(event.target);
    if (!labelName) {
        // A click anywhere else is the menu closing, or another menu opening.
        stopWaiting();
        removeMenuItem();
        return;
    }
    waitForMenu(labelName);
}

/** Start watching for label menus. Calling it twice is a no-op. */
export function installLabelMenu(dependencies: LabelMenuDeps): void {
    deps = dependencies;
    if (installed) return;
    installed = true;
    document.addEventListener('mousedown', onPointerDown, true);
    // Deliberately records nothing here. Writing 'not-attempted' on install
    // would run on every Gmail page load, so opening a second tab would wipe
    // out the 'unavailable' a first tab had just recorded, which is the one
    // reading anybody cares about. An absent record already reads as "not
    // used yet" on the options page.
}

/** Stop watching and remove anything left behind. Used by tests. */
export function uninstallLabelMenu(): void {
    document.removeEventListener('mousedown', onPointerDown, true);
    stopWaiting();
    removeMenuItem();
    installed = false;
    deps = null;
}
