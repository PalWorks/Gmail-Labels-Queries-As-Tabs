export {};
/**
 * contrast.test.ts
 *
 * Holds the palette to WCAG 2.1 AA.
 *
 * The 2026-09-21 audit found 33 text failures on the options page, all
 * traceable to four shared values. These tests read the palette straight out
 * of the stylesheets, so the next person who picks a slightly lighter grey
 * fails CI instead of shipping it.
 *
 * Everything asserted here is normal text, so the bar is 4.5:1 throughout.
 * Large text (>=24px, or >=18.66px bold) may sit at 3:1, but no token in this
 * project is large-text-only, so there is nothing to relax.
 */

import { contrastRatio, parseColor, flatten, readTokens, readCss } from './helpers/contrast';

const AA_NORMAL = 4.5;

/** Assert with a message that names the pair, so a failure reads usefully. */
function expectContrast(label: string, fg: string, bg: string, min: number): void {
    const ratio = contrastRatio(fg, bg);
    if (ratio < min) {
        throw new Error(`${label}: ${fg} on ${bg} is ${ratio}:1, needs ${min}:1`);
    }
    expect(ratio).toBeGreaterThanOrEqual(min);
}

// ---------------------------------------------------------------------------
// The maths itself
// ---------------------------------------------------------------------------

describe('contrast helper', () => {
    test('matches the known WCAG extremes', () => {
        expect(contrastRatio('#000000', '#ffffff')).toBe(21);
        expect(contrastRatio('#ffffff', '#ffffff')).toBe(1);
    });

    test('parses hex shorthand, rgb and rgba alike', () => {
        expect(parseColor('#fff')).toEqual({ r: 255, g: 255, b: 255, a: 1 });
        expect(parseColor('rgb(26, 115, 232)')).toEqual({ r: 26, g: 115, b: 232, a: 1 });
        expect(parseColor('rgba(0, 0, 0, 0.5)')).toEqual({ r: 0, g: 0, b: 0, a: 0.5 });
        expect(parseColor('linear-gradient(red, blue)')).toBeNull();
    });

    test('flattens a translucent foreground before measuring', () => {
        // Half-opacity black over white is mid grey, not black.
        expect(flatten({ r: 0, g: 0, b: 0, a: 0.5 }, { r: 255, g: 255, b: 255, a: 1 })).toEqual({
            r: 128,
            g: 128,
            b: 128,
            a: 1,
        });
        expect(contrastRatio('rgba(0, 0, 0, 0.5)', '#ffffff')).toBeLessThan(21);
    });
});

// ---------------------------------------------------------------------------
// Options page palette
// ---------------------------------------------------------------------------

describe('options page palette', () => {
    const dark = readTokens('src/options.css', ':root');
    const light = readTokens('src/options.css', 'body.theme-light');

    test.each([
        ['dark', dark],
        ['light', light],
    ])('%s theme declares every palette token', (_theme, tokens) => {
        for (const name of ['--surface-page', '--surface-card', '--text-accent', '--text-muted', '--text-danger']) {
            expect(tokens[name]).toBeTruthy();
        }
    });

    describe.each([
        ['dark', dark],
        ['light', light],
    ])('%s theme text on both surfaces', (theme, tokens) => {
        const surfaces: Array<[string, string]> = [
            ['page', tokens['--surface-page']],
            ['card', tokens['--surface-card']],
        ];

        test.each(surfaces)(`accent text on %s`, (where, surface) => {
            expectContrast(`${theme} --text-accent on ${where}`, tokens['--text-accent'], surface, AA_NORMAL);
        });

        test.each(surfaces)(`muted text on %s`, (where, surface) => {
            expectContrast(`${theme} --text-muted on ${where}`, tokens['--text-muted'], surface, AA_NORMAL);
        });

        test.each(surfaces)(`danger text on %s`, (where, surface) => {
            expectContrast(`${theme} --text-danger on ${where}`, tokens['--text-danger'], surface, AA_NORMAL);
        });
    });

    test('the primary button keeps white legible at both ends of its gradient', () => {
        const css = readCss('src/options.css');
        const gradients = [...css.matchAll(/\.btn-primary[^{]*\{[^}]*linear-gradient\(135deg,\s*(#[0-9a-f]{6}),\s*(#[0-9a-f]{6})\)/gi)];
        expect(gradients.length).toBeGreaterThan(0);

        for (const [, start, end] of gradients) {
            expectContrast('primary button gradient start', '#ffffff', start, AA_NORMAL);
            expectContrast('primary button gradient end', '#ffffff', end, AA_NORMAL);
        }
    });

    test('the retired low-contrast values are gone as text colors', () => {
        const css = readCss('src/options.css');
        // #3182ce 4.03:1, #718096 4.02:1, #8b95a8 3.02:1, #e53e3e 4.13:1
        for (const dead of ['#3182ce', '#718096', '#8b95a8', '#e53e3e']) {
            expect(css).not.toMatch(new RegExp('color:\\s*' + dead, 'i'));
        }
    });

    test('helper text is not faded with opacity, which contrast maths cannot see', () => {
        const css = readCss('src/options.css');
        const faded = ['.feedback-hint', '.feedback-footnote', '.feedback-optional', '.rt-desc', '.rt-meta'];
        for (const selector of faded) {
            const block = css.match(new RegExp(selector.replace('.', '\\.') + '\\s*\\{([^}]*)\\}'));
            expect(block).toBeTruthy();
            expect(block![1]).not.toMatch(/opacity:/);
        }
    });
});

// ---------------------------------------------------------------------------
// In-Gmail toolbar palette
// ---------------------------------------------------------------------------

describe('in-Gmail toolbar palette', () => {
    const light = readTokens('src/ui/toolbar.css', ':root');
    const dark = readTokens('src/ui/toolbar.css', 'body.force-dark');

    describe.each([
        ['light', light],
        ['dark', dark],
    ])('%s bar', (theme, tokens) => {
        test('resting tab label on the bar', () => {
            expectContrast(`${theme} tab text`, tokens['--gmail-tab-text'], tokens['--gmail-tabs-bg'], AA_NORMAL);
        });

        test('active tab label on its own background', () => {
            expectContrast(
                `${theme} active tab text`,
                tokens['--gmail-tab-active-text'],
                tokens['--gmail-tab-active-bg'],
                AA_NORMAL
            );
        });

        test('hovered tab label on the hover background', () => {
            expectContrast(
                `${theme} hover tab text`,
                tokens['--gmail-tab-hover-text'],
                tokens['--gmail-tab-hover-bg'],
                AA_NORMAL
            );
        });

        test('modal body text on the modal surface', () => {
            expectContrast(`${theme} modal text`, tokens['--modal-text'], tokens['--modal-bg'], AA_NORMAL);
        });

        test('input text on the input surface', () => {
            expectContrast(`${theme} input text`, tokens['--input-text'], tokens['--input-bg'], AA_NORMAL);
        });
    });
});

// ---------------------------------------------------------------------------
// Welcome page palette
// ---------------------------------------------------------------------------

describe('welcome page palette', () => {
    // Three scopes: light default, forced dark, and OS dark for someone who
    // never picked a theme. A token missing from any one of them ships a
    // broken combination, which is exactly what happened before this test.
    const scopes: Array<[string, Record<string, string>]> = [
        ['light (:root)', readTokens('src/welcome.css', ':root')],
        ['forced dark', readTokens('src/welcome.css', 'html[data-theme="dark"]')],
        ['OS dark', readTokens('src/welcome.css', ':root:not([data-theme="light"])')],
    ];

    test.each(scopes)('%s declares the selected-option text token', (_name, tokens) => {
        expect(tokens['--option-selected-text']).toBeTruthy();
    });

    test.each(scopes)('%s selected theme label on its chip', (name, tokens) => {
        expectContrast(`${name} selected option`, tokens['--option-selected-text'], tokens['--option-selected-bg'], AA_NORMAL);
    });

    test.each(scopes)('%s secondary text on the page', (name, tokens) => {
        expectContrast(`${name} secondary text`, tokens['--text-secondary'], tokens['--bg-color'], AA_NORMAL);
    });

    test.each(scopes)('%s primary text on cards', (name, tokens) => {
        expectContrast(`${name} primary text`, tokens['--text-primary'], tokens['--card-bg'], AA_NORMAL);
    });
});
