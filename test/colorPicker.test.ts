export {};
/**
 * colorPicker.test.ts
 *
 * Tests the shared accessible color-swatch UI: radiogroup selection semantics,
 * keyboard navigation, and the floating popover lifecycle.
 */

import { createColorSwatchRow, openColorPopover } from '../src/modules/colorPicker';
import { TAB_COLORS } from '../src/utils/colors';

beforeEach(() => {
    document.body.innerHTML = '';
    document.querySelectorAll('.color-popover').forEach((p) => p.remove());
});

describe('createColorSwatchRow', () => {
    test('renders a default swatch plus one per token as a radiogroup', () => {
        const row = createColorSwatchRow(undefined, () => {});
        expect(row.getAttribute('role')).toBe('radiogroup');
        const swatches = row.querySelectorAll('.color-swatch');
        expect(swatches).toHaveLength(TAB_COLORS.length + 1); // +1 for "default"
        // With no current color, the "none" swatch is selected.
        const none = row.querySelector('.color-swatch.is-none')!;
        expect(none.getAttribute('aria-checked')).toBe('true');
    });

    test('marks the current color as checked', () => {
        const row = createColorSwatchRow('green', () => {});
        const green = row.querySelector('.color-swatch.tab-color-green')!;
        expect(green.getAttribute('aria-checked')).toBe('true');
        expect((green as HTMLElement).tabIndex).toBe(0);
    });

    test('clicking a swatch fires onSelect and moves the checked state', () => {
        const onSelect = jest.fn();
        const row = createColorSwatchRow(undefined, onSelect);
        const blue = row.querySelector('.color-swatch.tab-color-blue') as HTMLButtonElement;
        blue.click();
        expect(onSelect).toHaveBeenCalledWith('blue');
        expect(blue.getAttribute('aria-checked')).toBe('true');
        // Only one swatch checked at a time.
        expect(row.querySelectorAll('.color-swatch[aria-checked="true"]')).toHaveLength(1);
    });

    test('selecting the default swatch reports undefined', () => {
        const onSelect = jest.fn();
        const row = createColorSwatchRow('red', onSelect);
        (row.querySelector('.color-swatch.is-none') as HTMLButtonElement).click();
        expect(onSelect).toHaveBeenCalledWith(undefined);
    });

    test('ArrowRight moves focus without committing a selection', () => {
        const onSelect = jest.fn();
        const row = createColorSwatchRow(undefined, onSelect);
        document.body.appendChild(row);
        const swatches = Array.from(row.querySelectorAll<HTMLButtonElement>('.color-swatch'));
        swatches[0].focus();
        row.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
        // Focus moved to the next swatch, but nothing was persisted yet.
        expect(document.activeElement).toBe(swatches[1]);
        expect(swatches[1].tabIndex).toBe(0);
        expect(onSelect).not.toHaveBeenCalled();
        // Activating the focused swatch (native button click) commits.
        swatches[1].click();
        expect(onSelect).toHaveBeenCalledTimes(1);
    });
});

describe('openColorPopover', () => {
    test('opens a single dialog popover anchored to the trigger', () => {
        const anchor = document.createElement('button');
        document.body.appendChild(anchor);
        openColorPopover(anchor, 'teal', () => {});
        const popovers = document.querySelectorAll('.color-popover');
        expect(popovers).toHaveLength(1);
        expect(popovers[0].getAttribute('role')).toBe('dialog');
    });

    test('selecting a color reports it and closes the popover', () => {
        const anchor = document.createElement('button');
        document.body.appendChild(anchor);
        const onSelect = jest.fn();
        openColorPopover(anchor, undefined, onSelect);
        const purple = document.querySelector('.color-popover .color-swatch.tab-color-purple') as HTMLButtonElement;
        purple.click();
        expect(onSelect).toHaveBeenCalledWith('purple');
        expect(document.querySelectorAll('.color-popover')).toHaveLength(0);
    });

    test('re-opening from the same anchor toggles it closed', () => {
        const anchor = document.createElement('button');
        document.body.appendChild(anchor);
        openColorPopover(anchor, undefined, () => {});
        openColorPopover(anchor, undefined, () => {});
        expect(document.querySelectorAll('.color-popover')).toHaveLength(0);
    });

    test('opening from a different anchor replaces the previous popover', () => {
        const a = document.createElement('button');
        const b = document.createElement('button');
        document.body.append(a, b);
        openColorPopover(a, undefined, () => {});
        openColorPopover(b, undefined, () => {});
        expect(document.querySelectorAll('.color-popover')).toHaveLength(1);
    });

    test('closing detaches document listeners (no leak across opens)', () => {
        const addSpy = jest.spyOn(document, 'addEventListener');
        const removeSpy = jest.spyOn(document, 'removeEventListener');
        const a = document.createElement('button');
        const b = document.createElement('button');
        document.body.append(a, b);
        jest.useFakeTimers();
        openColorPopover(a, undefined, () => {});
        jest.runAllTimers(); // attach A's capture listeners
        openColorPopover(b, undefined, () => {}); // must remove A's before attaching B's
        jest.runAllTimers();
        jest.useRealTimers();
        // Both click and keydown capture listeners from A were removed.
        expect(removeSpy).toHaveBeenCalledWith('click', expect.any(Function), true);
        expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function), true);
        addSpy.mockRestore();
        removeSpy.mockRestore();
    });

    test('an unknown current color selects Default, keeping a swatch focusable', () => {
        // Cast: guards against a corrupted store leaving nothing in the tab order.
        const row = createColorSwatchRow('not-a-color' as never, () => {});
        document.body.appendChild(row);

        const selected = row.querySelectorAll('.color-swatch[aria-checked="true"]');
        expect(selected).toHaveLength(1);
        expect(selected[0].getAttribute('aria-label')).toBe('Default (no color)');
        expect((selected[0] as HTMLButtonElement).tabIndex).toBe(0);
    });
});
