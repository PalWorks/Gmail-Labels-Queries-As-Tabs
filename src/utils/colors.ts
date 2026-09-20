/**
 * colors.ts
 *
 * Fixed palette of tab color tokens. We store a named token (not a raw hex
 * value) on each tab so colors stay theme-safe and accessible: the actual
 * rendered color for each token is owned by CSS and can differ per theme,
 * while stored data remains a small, validatable enum.
 *
 * Color is always decorative, never the sole indicator of a tab. The absence
 * of a color means default styling.
 */

export type TabColor = 'red' | 'orange' | 'yellow' | 'green' | 'teal' | 'blue' | 'purple' | 'pink';

/** All selectable color tokens, in swatch display order. */
export const TAB_COLORS: readonly TabColor[] = [
    'red',
    'orange',
    'yellow',
    'green',
    'teal',
    'blue',
    'purple',
    'pink',
] as const;

/** Human-readable accessible names for each token (used for aria-labels). */
export const TAB_COLOR_LABELS: Record<TabColor, string> = {
    red: 'Red',
    orange: 'Orange',
    yellow: 'Yellow',
    green: 'Green',
    teal: 'Teal',
    blue: 'Blue',
    purple: 'Purple',
    pink: 'Pink',
};

/** Type guard: true when `value` is a known palette token. */
export function isValidTabColor(value: unknown): value is TabColor {
    return typeof value === 'string' && (TAB_COLORS as readonly string[]).includes(value);
}

/**
 * Normalize an arbitrary stored/imported value to a valid token or `undefined`
 * (default). Used on import so a malformed color silently falls back to default
 * rather than corrupting the tab.
 */
export function normalizeTabColor(value: unknown): TabColor | undefined {
    return isValidTabColor(value) ? value : undefined;
}

/** CSS class applied to a colored tab/element, e.g. `tab-color-blue`. */
export function tabColorClass(color: TabColor): string {
    return `tab-color-${color}`;
}
