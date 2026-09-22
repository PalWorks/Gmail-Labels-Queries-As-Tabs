/**
 * wizardView.ts
 *
 * The onboarding wizard: a panel that narrates a capability and demonstrates
 * it in the same breath.
 *
 * The demonstration is inside the panel, directly above the sentence
 * describing it. An earlier draft animated the real Gmail page behind a dimmed
 * scrim, which asked the reader to look in one place and watch in another, and
 * then dimmed the half they were meant to watch. Whether the point landed
 * depended on whether they happened to be looking.
 *
 * This module knows nothing about where it is mounted. The in-Gmail modal and
 * the standalone welcome page both build one of these and supply a `WizardHost`
 * for the two things that differ: how a theme is persisted, and what the
 * surrounding surface should do when one is chosen.
 *
 * Every string is written with `textContent` and every node with
 * `createElement`. No onboarding copy can reach `innerHTML`.
 */

import { Theme } from '../../utils/storage';
import {
    SLIDES,
    THEME_SLIDE_INDEX,
    FINISH_LABEL,
    THEME_OPTIONS,
    DEMO_TABS,
    DEMO_RAIL,
    DEMO_ROWS,
    DEMO_QUERY,
    DEMO_RULE,
    DEMO_SCRIPT_LINES,
    CopySegment,
} from './wizardContent';

/** What the wizard needs from whatever is hosting it. */
export interface WizardHost {
    /** The theme to open on. */
    loadTheme(): Promise<Theme>;
    /** Persist a chosen theme, browser-wide. */
    saveTheme(theme: Theme): Promise<void>;
    /**
     * Retint everything around the wizard. In Gmail this is the live tab bar;
     * on the welcome page it is the page itself.
     */
    applyTheme(theme: Theme): void;
    /** The user is done, by finishing or by dismissing. */
    onFinish(): void;
    /** Offer a dismiss control. A modal wants one; a full page does not. */
    showClose?: boolean;
    /** Anything that went wrong, so the host can decide whether to say so. */
    onError?(error: unknown): void;
}

export interface WizardHandle {
    readonly element: HTMLElement;
    /** Jump to a slide. Exposed for tests and for re-entry from a menu. */
    goTo(index: number): void;
    /** Which slide is showing. */
    current(): number;
    /** Cancel every pending animation step and drop listeners. */
    destroy(): void;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

function el<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className?: string,
    text?: string
): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

function icon(path: string, size = 20): SVGSVGElement {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', String(size));
    svg.setAttribute('height', String(size));
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    const p = document.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', path);
    svg.appendChild(p);
    return svg;
}

const SEARCH_ICON =
    'M15.5 14h-.79l-.28-.27a6.5 6.5 0 1 0-.7.7l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 ' +
    '9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z';

const PLUS_ICON =
    'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5 11h-4v4h-2v-4H7v-2h4V7h2v4h4v2z';

/** Render body copy segments into a paragraph, never through innerHTML. */
function renderBody(target: HTMLElement, segments: readonly CopySegment[]): void {
    target.textContent = '';
    for (const segment of segments) {
        if ('code' in segment) {
            target.appendChild(el('code', 'glt-ob-code-inline', segment.code));
        } else {
            target.appendChild(document.createTextNode(segment.text));
        }
    }
}

export function createWizard(host: WizardHost): WizardHandle {
    const reduced =
        typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let timers: ReturnType<typeof setTimeout>[] = [];
    let destroyed = false;

    function later(fn: () => void, ms: number): void {
        if (destroyed) return;
        timers.push(setTimeout(fn, reduced ? 0 : ms));
    }

    function clearTimers(): void {
        timers.forEach(clearTimeout);
        timers = [];
    }

    // -----------------------------------------------------------------------
    // Structure
    // -----------------------------------------------------------------------

    const root = el('div', 'glt-ob');
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.dataset.resolved = 'light';

    // --- The miniature ------------------------------------------------------

    const frame = el('div', 'glt-ob-demo');
    const demo = el('div', 'glt-ob-stage');
    demo.dataset.bar = 'off';
    demo.dataset.counts = 'off';
    demo.dataset.colors = 'off';
    demo.dataset.lift = 'off';
    demo.dataset.highlight = 'off';
    demo.dataset.overlay = 'off';
    demo.setAttribute('aria-hidden', 'true'); // the caption carries the meaning
    frame.appendChild(demo);

    const demoTop = el('div', 'glt-ob-demotop');
    const searchBox = el('div', 'glt-ob-search');
    searchBox.appendChild(icon(SEARCH_ICON, 11));
    const searchText = el('span', 'glt-ob-search-text', 'Search mail');
    searchBox.appendChild(searchText);
    searchBox.appendChild(el('span', 'glt-ob-caret'));
    demoTop.appendChild(searchBox);
    demo.appendChild(demoTop);

    const barShell = el('div', 'glt-ob-barshell');
    const bar = el('div', 'glt-ob-bar');
    const tabNodes = new Map<string, HTMLElement>();
    const countNodes = new Map<string, HTMLElement>();

    for (const tab of DEMO_TABS) {
        const node = el('div', 'glt-ob-tab');
        if (tab.active) node.classList.add('is-active');
        if (tab.color) node.classList.add('glt-ob-color-' + tab.color);
        if (tab.pending) node.classList.add('is-pending');
        node.dataset.tab = tab.key;
        node.appendChild(el('span', 'glt-ob-dot'));
        node.appendChild(el('span', 'glt-ob-tab-name', tab.label));
        const count = el('span', 'glt-ob-count', String(tab.count));
        node.appendChild(count);
        countNodes.set(tab.key, count);
        tabNodes.set(tab.key, node);
        bar.appendChild(node);
    }

    const addBtn = el('div', 'glt-ob-addbtn');
    addBtn.appendChild(icon(PLUS_ICON, 18));
    bar.appendChild(addBtn);
    barShell.appendChild(bar);
    demo.appendChild(barShell);

    const demoBody = el('div', 'glt-ob-demobody');
    const rail = el('div', 'glt-ob-rail');
    for (const item of DEMO_RAIL) {
        const r = el('div', 'glt-ob-railitem');
        if (item.on) r.classList.add('is-on');
        if (item.lifts) r.dataset.lift = 'yes';
        r.appendChild(el('span', 'glt-ob-raildot'));
        r.appendChild(document.createTextNode(item.label));
        rail.appendChild(r);
    }
    demoBody.appendChild(rail);

    const list = el('div', 'glt-ob-list');
    for (const row of DEMO_ROWS) {
        const r = el('div', 'glt-ob-row');
        if (row.unread) r.classList.add('is-unread');
        r.appendChild(el('span', 'glt-ob-from', row.from));
        r.appendChild(el('span', 'glt-ob-subject', row.subject));
        if (row.chip) {
            const chip = el('span', 'glt-ob-chip glt-ob-color-' + row.chip, chipLabel(row.chip));
            r.appendChild(chip);
        }
        list.appendChild(r);
    }
    demoBody.appendChild(list);
    demo.appendChild(demoBody);

    // Slide 5 covers the miniature entirely.
    const overlay = el('div', 'glt-ob-overlay');
    const ruleRow = el('div', 'glt-ob-rule');
    ruleRow.appendChild(el('span', '', DEMO_RULE.label));
    ruleRow.appendChild(el('span', 'glt-ob-rule-arrow', '→'));
    ruleRow.appendChild(el('span', 'glt-ob-rule-pill', DEMO_RULE.action));
    overlay.appendChild(ruleRow);

    const code = el('pre', 'glt-ob-code');
    for (const line of DEMO_SCRIPT_LINES) {
        const span = el('span', line.kind ? 'is-' + line.kind : '', line.text);
        code.appendChild(span);
        code.appendChild(document.createTextNode('\n'));
    }
    overlay.appendChild(code);
    demo.appendChild(overlay);

    const caption = el('div', 'glt-ob-caption', SLIDES[0].caption);
    demo.appendChild(caption);
    root.appendChild(frame);

    // --- The narration ------------------------------------------------------

    const copyWrap = el('div', 'glt-ob-copy');
    const stepEl = el('p', 'glt-ob-step');
    const titleEl = el('h2', 'glt-ob-title');
    const titleId = 'glt-ob-title-' + Math.random().toString(36).slice(2, 8);
    titleEl.id = titleId;
    root.setAttribute('aria-labelledby', titleId);
    const bodyEl = el('p', 'glt-ob-bodytext');
    // The caption is aria-hidden inside the demo; announce it here instead, so
    // a screen reader is told what the animation is showing.
    const srCaption = el('p', 'glt-ob-sr');
    srCaption.setAttribute('role', 'status');
    srCaption.setAttribute('aria-live', 'polite');

    copyWrap.appendChild(stepEl);
    copyWrap.appendChild(titleEl);
    copyWrap.appendChild(bodyEl);
    copyWrap.appendChild(srCaption);

    const themeGrid = el('div', 'glt-ob-themes');
    themeGrid.hidden = true;
    const themeButtons = new Map<Theme, HTMLButtonElement>();

    for (const option of THEME_OPTIONS) {
        const b = el('button', 'glt-ob-theme');
        b.type = 'button';
        b.setAttribute('aria-pressed', 'false');
        b.appendChild(icon(option.path, 20));
        b.appendChild(el('span', '', option.label));
        b.addEventListener('click', () => chooseTheme(option.id));
        themeButtons.set(option.id, b);
        themeGrid.appendChild(b);
    }
    copyWrap.appendChild(themeGrid);
    root.appendChild(copyWrap);

    // --- Footer -------------------------------------------------------------

    const foot = el('div', 'glt-ob-foot');
    const dots = el('div', 'glt-ob-dots');
    dots.setAttribute('aria-hidden', 'true');
    const dotNodes: HTMLElement[] = [];
    for (let i = 0; i < SLIDES.length; i++) {
        const d = el('span', 'glt-ob-dot-nav');
        dotNodes.push(d);
        dots.appendChild(d);
    }
    foot.appendChild(dots);

    const backBtn = el('button', 'glt-ob-back', 'Back');
    backBtn.type = 'button';
    backBtn.hidden = true;
    backBtn.addEventListener('click', () => goTo(index - 1));
    foot.appendChild(backBtn);

    const nextBtn = el('button', 'glt-ob-next', 'Next');
    nextBtn.type = 'button';
    nextBtn.addEventListener('click', () => {
        if (index === SLIDES.length - 1) {
            host.onFinish();
            return;
        }
        goTo(index + 1);
    });
    foot.appendChild(nextBtn);
    root.appendChild(foot);

    if (host.showClose) {
        const close = el('button', 'glt-ob-close', '✕');
        close.type = 'button';
        close.setAttribute('aria-label', 'Close the tour');
        close.addEventListener('click', () => host.onFinish());
        root.appendChild(close);
    }

    // -----------------------------------------------------------------------
    // Theme
    // -----------------------------------------------------------------------

    function markTheme(theme: Theme): void {
        themeButtons.forEach((button, id) => {
            button.setAttribute('aria-pressed', String(id === theme));
        });
        const systemDark =
            typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches;
        root.dataset.resolved = theme === 'dark' || (theme === 'system' && systemDark) ? 'dark' : 'light';
    }

    /**
     * Set once the user picks a theme, so the initial read cannot undo it.
     *
     * `loadTheme()` is in flight while the wizard is already interactive. A
     * user who reaches the last slide and chooses before that read resolves
     * would otherwise watch their choice revert a moment later, with the
     * saved value written but the wrong card pressed.
     */
    let userChoseTheme = false;

    function chooseTheme(theme: Theme): void {
        userChoseTheme = true;
        // Paint first: the choice must feel instant even if the write is slow
        // or fails. A revert would be worse than an optimistic preview here,
        // because nothing is lost by showing a theme that did not persist.
        markTheme(theme);
        host.applyTheme(theme);
        host.saveTheme(theme).catch((e: unknown) => {
            if (host.onError) host.onError(e);
        });
    }

    host.loadTheme()
        .then((theme) => {
            if (!destroyed && !userChoseTheme) markTheme(theme);
        })
        .catch((e: unknown) => {
            // The wizard opens on its default look rather than not at all.
            if (host.onError) host.onError(e);
        });

    // -----------------------------------------------------------------------
    // Choreography
    // -----------------------------------------------------------------------

    function typeQuery(at: number): void {
        const saved = tabNodes.get('saved');
        if (reduced) {
            searchText.textContent = DEMO_QUERY;
            saved?.classList.remove('is-pending');
            return;
        }
        if (at > DEMO_QUERY.length) {
            later(() => addBtn.classList.add('is-pulsing'), 240);
            later(() => {
                addBtn.classList.remove('is-pulsing');
                saved?.classList.remove('is-pending');
                saved?.classList.add('is-landing');
            }, 1400);
            return;
        }
        searchText.textContent = DEMO_QUERY.slice(0, at) || ' ';
        later(() => typeQuery(at + 1), 45);
    }

    function countUp(node: HTMLElement, target: number): void {
        if (reduced) {
            node.textContent = String(target);
            return;
        }
        let n = 0;
        const step = Math.max(1, Math.ceil(target / 10));
        const tick = (): void => {
            n += step;
            if (n >= target) {
                node.textContent = String(target);
                return;
            }
            node.textContent = String(n);
            later(tick, 60);
        };
        node.textContent = '0';
        later(tick, 60);
    }

    function reorder(): void {
        const team = tabNodes.get('team');
        const clients = tabNodes.get('clients');
        if (!team || !clients) return;
        if (reduced) {
            bar.insertBefore(team, clients);
            return;
        }
        team.classList.add('is-lifting');
        later(() => {
            bar.insertBefore(team, clients);
            team.classList.remove('is-lifting');
        }, 850);
    }

    /** Return the miniature to the state a slide starts from. */
    function resetDemo(): void {
        clearTimers();
        addBtn.classList.remove('is-pulsing');
        searchBox.classList.remove('is-typing');
        demo.dataset.highlight = 'off';
        demo.dataset.lift = 'off';
        demo.dataset.overlay = 'off';
        // Skipping through slide 2 leaves a half-typed query behind, and an
        // empty search box reads as broken.
        searchText.textContent = 'Search mail';

        const team = tabNodes.get('team');
        const saved = tabNodes.get('saved');
        if (team && saved) bar.insertBefore(team, saved); // undo any reorder
        saved?.classList.remove('is-landing');
    }

    function playSlide(i: number): void {
        resetDemo();

        demo.dataset.bar = i >= 1 ? 'on' : 'off';
        demo.dataset.counts = i >= 2 ? 'on' : 'off';
        demo.dataset.colors = i >= 2 ? 'on' : 'off';

        const saved = tabNodes.get('saved');
        if (i <= 1) saved?.classList.add('is-pending');
        else saved?.classList.remove('is-pending');

        if (i === 0) {
            later(() => (demo.dataset.highlight = 'on'), 400);
            later(() => (demo.dataset.lift = 'on'), 1100);
            later(() => (demo.dataset.bar = 'on'), 1450);
            // The labels settle back into the sidebar. They did not leave
            // Gmail, they gained a second home, and leaving a hole there would
            // say otherwise.
            later(() => {
                demo.dataset.lift = 'off';
                demo.dataset.highlight = 'off';
            }, 2100);
        }

        if (i === 1) {
            searchText.textContent = ' ';
            searchBox.classList.add('is-typing');
            later(() => typeQuery(0), 350);
        }

        if (i === 2) {
            for (const tab of DEMO_TABS) {
                const node = countNodes.get(tab.key);
                if (node) countUp(node, tab.count);
            }
        }

        if (i === 3) later(reorder, 450);
        if (i === 4) later(() => (demo.dataset.overlay = 'on'), 200);
    }

    // -----------------------------------------------------------------------
    // Navigation
    // -----------------------------------------------------------------------

    let index = 0;

    function render(): void {
        const slide = SLIDES[index];
        stepEl.textContent = 'Step ' + (index + 1) + ' of ' + SLIDES.length;
        titleEl.textContent = slide.title;
        renderBody(bodyEl, slide.body);
        caption.textContent = slide.caption;
        srCaption.textContent = slide.caption;

        const last = index === THEME_SLIDE_INDEX;
        themeGrid.hidden = !last;
        nextBtn.textContent = last ? FINISH_LABEL : 'Next';
        backBtn.hidden = index === 0;

        dotNodes.forEach((d, n) => d.classList.toggle('is-on', n === index));
        playSlide(index);
    }

    function goTo(n: number): void {
        if (destroyed || n < 0 || n >= SLIDES.length) return;
        index = n;
        render();
    }

    const onKey = (e: KeyboardEvent): void => {
        if (e.key === 'ArrowRight') goTo(index + 1);
        if (e.key === 'ArrowLeft') goTo(index - 1);
    };
    root.addEventListener('keydown', onKey);

    render();

    return {
        element: root,
        goTo,
        current: () => index,
        destroy(): void {
            destroyed = true;
            clearTimers();
            root.removeEventListener('keydown', onKey);
            root.remove();
        },
    };
}

/** Capitalised label for a colour chip in the miniature's message list. */
function chipLabel(color: string): string {
    switch (color) {
        case 'orange':
            return 'Clients';
        case 'green':
            return 'Invoices';
        case 'purple':
            return 'Team';
        default:
            return '';
    }
}
