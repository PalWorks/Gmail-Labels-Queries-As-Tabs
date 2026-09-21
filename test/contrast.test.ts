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

import * as fs from 'fs';
import * as path from 'path';
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

// ---------------------------------------------------------------------------
// Colours must live in CSS, where the guards above can see them
// ---------------------------------------------------------------------------
//
// Everything above reads .css files. That is the whole weakness: the two
// defects found on 2026-09-21 were hex values sitting in TypeScript template
// strings, one at 3.72:1 and one at 2.66:1, and neither guard could see
// either. The audit script could not either, because it measures whatever
// happened to be rendered when it ran.
//
// So the rule is not "check the colours in TypeScript too". It is that there
// are no colours in TypeScript.

describe('no colour literals outside the stylesheets', () => {
    const ROOT = path.join(__dirname, '..');

    /**
     * Places a colour may legitimately appear outside a stylesheet, each with
     * the reason. Adding an entry is a deliberate act.
     */
    const ALLOWED = new Map<string, string>([
        [
            'src/modules/theme.ts',
            "Gmail's own background colours, sampled to detect its theme. These are " +
                'values we read, never values we paint.',
        ],
    ]);

    function sourceFiles(dir: string, exts: string[]): string[] {
        return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) return sourceFiles(full, exts);
            return exts.some((e) => entry.name.endsWith(e)) ? [full] : [];
        });
    }

    /**
     * A hex colour is 3, 4, 6 or 8 hex digits after a `#`. Anything else that
     * starts with `#` is a Gmail route (`#inbox`), a selector, or an HTML
     * entity (`&#039;`) — hence the check that `&` does not precede it.
     */
    const HEX_COLOR = /(^|[^&\w])(#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3}))(?![0-9a-zA-Z_-])/g;
    const FUNCTIONAL_COLOR = /\b(?:rgba?|hsla?|color-mix|oklch)\s*\(/g;

    function findColors(file: string): string[] {
        const text = fs.readFileSync(file, 'utf8');
        const hits: string[] = [];
        for (const m of text.matchAll(HEX_COLOR)) hits.push(m[2]);
        for (const m of text.matchAll(FUNCTIONAL_COLOR)) hits.push(m[0]);
        return hits;
    }

    const files = [...sourceFiles(path.join(ROOT, 'src'), ['.ts']), ...sourceFiles(path.join(ROOT, 'src'), ['.html'])];

    test('scans the files it claims to scan', () => {
        const rel = files.map((f) => path.relative(ROOT, f));
        expect(rel).toContain('src/options.ts');
        expect(rel).toContain('src/options.html');
        expect(rel).toContain('src/modules/modals/settingsModal.ts');
        expect(rel.length).toBeGreaterThan(20);
    });

    test('no .ts or .html file paints a colour of its own', () => {
        const offenders = files
            .map((file) => ({ rel: path.relative(ROOT, file), colors: findColors(file) }))
            .filter(({ rel, colors }) => colors.length > 0 && !ALLOWED.has(rel));

        if (offenders.length > 0) {
            const detail = offenders.map((o) => `  ${o.rel}: ${[...new Set(o.colors)].join(', ')}`).join('\n');
            throw new Error(
                `Colour literals outside the stylesheets:\n${detail}\n\n` +
                    'Move the value into a CSS token so the contrast guards can see it, ' +
                    'or add the file to ALLOWED in this test with a reason.'
            );
        }
    });

    test('every allowlisted file still contains the colours it was allowed for', () => {
        // A stale allowlist is a hole. If the reason has gone, the entry must too.
        for (const rel of ALLOWED.keys()) {
            const full = path.join(ROOT, rel);
            expect(fs.existsSync(full)).toBe(true);
            expect(findColors(full).length).toBeGreaterThan(0);
        }
    });

    test('the scanner actually recognises a colour', () => {
        // Mutation check: without this, the test above passes on a broken regex.
        const tmp = path.join(__dirname, '__color_probe.ts');
        fs.writeFileSync(tmp, "const a = '#718096';\nconst b = 'rgba(1,2,3,0.5)';\nconst c = '#abc';\n");
        try {
            expect(findColors(tmp)).toEqual(['#718096', '#abc', 'rgba(']);
        } finally {
            fs.unlinkSync(tmp);
        }
    });

    test('the scanner does not mistake Gmail routes or HTML entities for colours', () => {
        const tmp = path.join(__dirname, '__color_probe_ok.ts');
        fs.writeFileSync(
            tmp,
            "const a = '#inbox';\nconst b = '#label/Work';\nconst c = '&#039;';\nconst d = '#search/is:unread';\nconst e = `section-${'x'}`;\n"
        );
        try {
            expect(findColors(tmp)).toEqual([]);
        } finally {
            fs.unlinkSync(tmp);
        }
    });
});
