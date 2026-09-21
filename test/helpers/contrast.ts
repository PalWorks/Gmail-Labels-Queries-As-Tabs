/**
 * contrast.ts (test helper)
 *
 * WCAG 2.1 relative-luminance and contrast-ratio math, plus a small CSS
 * custom-property reader, used by contrast.test.ts to hold the palette to
 * AA without needing a browser.
 *
 * Lives under test/ deliberately: it is a checking tool, not shipped code.
 */

import * as fs from 'fs';
import * as path from 'path';

export interface Rgb {
    r: number;
    g: number;
    b: number;
    a: number;
}

/** Parse #rgb, #rrggbb, rgb() or rgba(). Returns null for anything else. */
export function parseColor(value: string): Rgb | null {
    const v = value.trim();

    const hex = v.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (hex) {
        const h = hex[1];
        const full = h.length === 3 ? h[0] + h[0] + h[1] + h[1] + h[2] + h[2] : h;
        return {
            r: parseInt(full.slice(0, 2), 16),
            g: parseInt(full.slice(2, 4), 16),
            b: parseInt(full.slice(4, 6), 16),
            a: 1,
        };
    }

    const rgb = v.match(/^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,/\s]+([\d.]+))?\s*\)$/i);
    if (rgb) {
        return {
            r: +rgb[1],
            g: +rgb[2],
            b: +rgb[3],
            a: rgb[4] === undefined ? 1 : parseFloat(rgb[4]),
        };
    }

    return null;
}

/** Composite a translucent foreground over an opaque background. */
export function flatten(fg: Rgb, bg: Rgb): Rgb {
    if (fg.a >= 1) return fg;
    return {
        r: Math.round(fg.r * fg.a + bg.r * (1 - fg.a)),
        g: Math.round(fg.g * fg.a + bg.g * (1 - fg.a)),
        b: Math.round(fg.b * fg.a + bg.b * (1 - fg.a)),
        a: 1,
    };
}

/** WCAG 2.1 relative luminance. */
export function luminance(c: Rgb): number {
    const channel = (raw: number): number => {
        const v = raw / 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);
}

/** WCAG contrast ratio, rounded to two decimals, foreground flattened onto bg. */
export function contrastRatio(foreground: string, background: string): number {
    const bg = parseColor(background);
    const fgRaw = parseColor(foreground);
    if (!bg || !fgRaw) throw new Error(`Unparseable color pair: "${foreground}" on "${background}"`);
    const fg = flatten(fgRaw, bg);
    const l1 = luminance(fg);
    const l2 = luminance(bg);
    const hi = Math.max(l1, l2);
    const lo = Math.min(l1, l2);
    return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
}

/**
 * Read the custom properties declared by one selector block in a stylesheet.
 *
 * Deliberately simple: the palette blocks in this project are flat lists of
 * `--name: value;` declarations, and a regex keeps the test dependency-free.
 * `occurrence` picks between repeated selectors (welcome.css declares its dark
 * palette twice: once forced, once behind a media query).
 */
export function readTokens(cssFile: string, selector: string, occurrence = 0): Record<string, string> {
    const css = fs.readFileSync(path.join(__dirname, '..', '..', cssFile), 'utf8');
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const blocks = [...css.matchAll(new RegExp(escaped + '\\s*\\{([^}]*)\\}', 'g'))];
    if (blocks.length <= occurrence) {
        throw new Error(`Selector "${selector}" occurrence ${occurrence} not found in ${cssFile}`);
    }

    // Comments come out first: one of them mentions another token by name,
    // and a naive scan reads that as a declaration.
    const body = blocks[occurrence][1].replace(/\/\*[\s\S]*?\*\//g, '');

    const tokens: Record<string, string> = {};
    for (const decl of body.split(';')) {
        const m = decl.trim().match(/^(--[\w-]+)\s*:\s*([^\n]+)$/);
        if (m) tokens[m[1]] = m[2].trim();
    }
    return tokens;
}

/** Read a whole stylesheet (used for the "no stray hex" guards). */
export function readCss(cssFile: string): string {
    return fs.readFileSync(path.join(__dirname, '..', '..', cssFile), 'utf8');
}
