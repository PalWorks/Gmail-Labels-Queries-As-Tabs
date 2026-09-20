export {};
/**
 * colors.test.ts
 *
 * Unit tests for the tab color palette utilities.
 */

import { TAB_COLORS, TAB_COLOR_LABELS, isValidTabColor, normalizeTabColor, tabColorClass } from '../src/utils/colors';

describe('isValidTabColor', () => {
    test('accepts every declared palette token', () => {
        TAB_COLORS.forEach((c) => expect(isValidTabColor(c)).toBe(true));
    });

    test('rejects unknown strings and non-strings', () => {
        expect(isValidTabColor('mauve')).toBe(false);
        expect(isValidTabColor('#ff0000')).toBe(false);
        expect(isValidTabColor('')).toBe(false);
        expect(isValidTabColor(undefined)).toBe(false);
        expect(isValidTabColor(null)).toBe(false);
        expect(isValidTabColor(42)).toBe(false);
    });
});

describe('normalizeTabColor', () => {
    test('passes valid tokens through', () => {
        expect(normalizeTabColor('blue')).toBe('blue');
    });

    test('maps invalid values to undefined (default)', () => {
        expect(normalizeTabColor('rainbow')).toBeUndefined();
        expect(normalizeTabColor(undefined)).toBeUndefined();
        expect(normalizeTabColor(123)).toBeUndefined();
    });
});

describe('tabColorClass', () => {
    test('builds the tab-color-<token> class', () => {
        expect(tabColorClass('green')).toBe('tab-color-green');
    });
});

describe('palette integrity', () => {
    test('every token has a human label', () => {
        TAB_COLORS.forEach((c) => {
            expect(typeof TAB_COLOR_LABELS[c]).toBe('string');
            expect(TAB_COLOR_LABELS[c].length).toBeGreaterThan(0);
        });
    });
});
