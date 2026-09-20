/**
 * colorPicker.ts
 *
 * Shared, accessible color-swatch UI reused by the in-Gmail Edit Tab modal and
 * the options-page tab list. Markup is theme-agnostic: each swatch carries a
 * `tab-color-<token>` class and the owning stylesheet supplies the actual color.
 *
 * The swatch row is a WAI-ARIA radiogroup. It always offers a "Default" (no
 * color) option first, then one swatch per palette token.
 */

import { TAB_COLORS, TAB_COLOR_LABELS, TabColor, normalizeTabColor, tabColorClass } from '../utils/colors';

export type ColorSelectHandler = (color: TabColor | undefined) => void;

/**
 * Build an accessible swatch row. Selecting a swatch invokes `onSelect` with the
 * token (or `undefined` for default) and updates the visual/aria selection state.
 */
export function createColorSwatchRow(current: TabColor | undefined, onSelect: ColorSelectHandler): HTMLElement {
    // An unknown token would match no swatch, leaving nothing selected and
    // nothing in the tab order — keyboard users would be stranded on the
    // trigger. Treat it as "no color" so Default is selected and focusable.
    current = normalizeTabColor(current);

    const row = document.createElement('div');
    row.className = 'color-swatch-row';
    row.setAttribute('role', 'radiogroup');
    row.setAttribute('aria-label', 'Tab color');

    const makeSwatch = (color: TabColor | undefined): HTMLButtonElement => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'color-swatch' + (color ? ' ' + tabColorClass(color) : ' is-none');
        btn.setAttribute('role', 'radio');
        const label = color ? TAB_COLOR_LABELS[color] : 'Default (no color)';
        btn.setAttribute('aria-label', label);
        btn.title = label;
        const selected = color === current || (!color && !current);
        btn.setAttribute('aria-checked', selected ? 'true' : 'false');
        btn.classList.toggle('selected', selected);
        // Roving tabindex: only the selected swatch is in the tab order.
        btn.tabIndex = selected ? 0 : -1;
        btn.addEventListener('click', () => {
            row.querySelectorAll<HTMLButtonElement>('.color-swatch').forEach((s) => {
                s.setAttribute('aria-checked', 'false');
                s.classList.remove('selected');
                s.tabIndex = -1;
            });
            btn.setAttribute('aria-checked', 'true');
            btn.classList.add('selected');
            btn.tabIndex = 0;
            onSelect(color);
        });
        return btn;
    };

    const swatches: HTMLButtonElement[] = [makeSwatch(undefined), ...TAB_COLORS.map((c) => makeSwatch(c))];
    swatches.forEach((s) => row.appendChild(s));

    // Arrow-key navigation moves focus only (roving tabindex); it does not
    // commit a selection. Activation is via click or Enter/Space on the focused
    // swatch (native button behavior), so browsing swatches with the keyboard
    // never persists or dismisses anything until the user actually activates.
    row.addEventListener('keydown', (e) => {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        e.preventDefault();
        const idx = swatches.indexOf(document.activeElement as HTMLButtonElement);
        if (idx === -1) return;
        const dir = e.key === 'ArrowRight' ? 1 : -1;
        const next = swatches[(idx + dir + swatches.length) % swatches.length];
        swatches.forEach((s) => {
            s.tabIndex = -1;
        });
        next.tabIndex = 0;
        next.focus();
    });

    return row;
}

// Tracks the single open popover so we can always tear it down cleanly (its
// document-level capture listeners live in the closure, so removing the DOM node
// alone would leak them). Only one popover is ever open at a time.
let activeClose: (() => void) | null = null;
let activeAnchor: HTMLElement | null = null;

/**
 * Open a floating color popover anchored to `anchor`. Closes on selection,
 * outside click, or Escape; re-invoking with the same anchor toggles it shut.
 * Used by the options-page tab rows where space is tight; the edit modal embeds
 * `createColorSwatchRow` inline instead.
 */
export function openColorPopover(anchor: HTMLElement, current: TabColor | undefined, onSelect: ColorSelectHandler): void {
    // Tear down any existing popover via its own close() so its listeners are
    // detached. If it was anchored to this same trigger, treat the click as a
    // toggle-off and stop here.
    const wasSameAnchor = activeAnchor === anchor && activeClose !== null;
    activeClose?.();
    if (wasSameAnchor) return;

    const popover = document.createElement('div');
    popover.className = 'color-popover';
    popover.setAttribute('role', 'dialog');
    popover.setAttribute('aria-label', 'Choose tab color');

    const close = (): void => {
        popover.remove();
        document.removeEventListener('click', onOutside, true);
        document.removeEventListener('keydown', onKey, true);
        if (activeClose === close) {
            activeClose = null;
            activeAnchor = null;
        }
    };
    // Clicks on the anchor itself are handled by the trigger (which toggles);
    // only genuinely-outside clicks dismiss here.
    const onOutside = (e: MouseEvent): void => {
        const target = e.target as Node;
        if (!popover.contains(target) && !anchor.contains(target)) close();
    };
    const onKey = (e: KeyboardEvent): void => {
        if (e.key === 'Escape') {
            close();
            anchor.focus();
        }
    };

    const row = createColorSwatchRow(current, (color) => {
        onSelect(color);
        close();
        anchor.focus();
    });
    popover.appendChild(row);

    document.body.appendChild(popover);

    const rect = anchor.getBoundingClientRect();
    popover.style.top = `${rect.bottom + window.scrollY + 4}px`;
    popover.style.left = `${rect.left + window.scrollX}px`;

    activeClose = close;
    activeAnchor = anchor;

    // Defer listener attach so the opening click doesn't immediately close it.
    setTimeout(() => {
        document.addEventListener('click', onOutside, true);
        document.addEventListener('keydown', onKey, true);
    }, 0);

    (popover.querySelector('.color-swatch.selected') as HTMLElement | null)?.focus();
}
