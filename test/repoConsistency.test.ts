export {};
/**
 * repoConsistency.test.ts
 *
 * Guards against documentation and stylesheets drifting away from the code.
 *
 * Both failure modes have already happened here. In v1.4.0 five documents
 * still said the extension made "zero external network requests" months after
 * a feedback relay shipped, including AGENTS.md rule 1 — which would have told
 * the next agent that the feedback feature was a blocking defect to remove.
 * And five CSS rules survived the components they styled, found only by
 * reading the stylesheet line by line.
 *
 * Prose cannot be typechecked, but the specific claims that matter can be.
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.join(__dirname, '..');

function read(rel: string): string {
    return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function walk(dir: string, predicate: (name: string) => boolean): string[] {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') return [];
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) return walk(full, predicate);
        return predicate(entry.name) ? [full] : [];
    });
}

/**
 * Point-in-time records, not current guidance. A phase plan is a log of what
 * was decided in March; rewriting it to match September would destroy the
 * record. `.planning/phases/README.md` says so where a reader will find it.
 */
const ARCHIVED = (rel: string): boolean => rel.startsWith('.planning/phases/') || rel === 'IMPLEMENTATION_PLAN.md';

const MARKDOWN = walk(ROOT, (n) => n.endsWith('.md'))
    .filter((f) => !f.includes(`${path.sep}website${path.sep}`))
    .map((f) => path.relative(ROOT, f).split(path.sep).join('/'));

const LIVE_DOCS = MARKDOWN.filter((rel) => !ARCHIVED(rel));

// ---------------------------------------------------------------------------
// Claims the code contradicts
// ---------------------------------------------------------------------------

describe('documentation claims match the code', () => {
    test('finds the documents it is meant to check', () => {
        expect(MARKDOWN).toContain('README.md');
        expect(MARKDOWN).toContain('AGENTS.md');
        expect(MARKDOWN).toContain('SECURITY.md');
        expect(MARKDOWN.length).toBeGreaterThan(10);
    });

    test('the extension really does contact an external origin', () => {
        // The premise of the next test. If the feedback relay is ever removed,
        // this fails first and tells you to relax the claim check rather than
        // leaving a guard that silently guards nothing.
        const feedback = read('src/modules/feedback.ts');
        expect(feedback).toMatch(/https:\/\/[a-z0-9.-]+\//i);
    });

    test('no document claims the extension makes no network requests', () => {
        const FORBIDDEN = [
            /zero external network requests/i,
            /no external network requests/i,
            /makes no network requests/i,
            /never makes (?:any )?network requests/i,
            /does not make (?:any )?network requests/i,
        ];

        // A superseded ADR keeps its original title on purpose: the record of
        // what was once decided is the point of an ADR. What matters is that
        // the section says it no longer holds.
        const SUPERSEDED = /superseded|amended by|no longer|used to|previously|was corrected|becomes|until v1\.\d/i;

        // Quoting the claim in order to discuss it is not making it. A plan
        // that says it will guard against "zero external network requests",
        // or an ADR naming the decision it retired, must not trip this.
        const quotedClaim = (line: string, re: RegExp): boolean => {
            const m = re.exec(line);
            if (!m) return false;
            const before = line[m.index - 1];
            const after = line[m.index + m[0].length];
            return (before === '"' && after === '"') || (before === '`' && after === '`');
        };

        const offenders: string[] = [];
        for (const rel of LIVE_DOCS) {
            const lines = read(rel).split('\n');
            const headings = lines.flatMap((l, i) => (/^#{1,3} /.test(l) ? [i] : []));

            lines.forEach((line, i) => {
                const hit = FORBIDDEN.find((re) => re.test(line));
                if (!hit) return;
                if (quotedClaim(line, new RegExp(hit.source, 'i'))) return;

                // Judge the whole enclosing section, not a fixed window: an
                // ADR states its supersession in a paragraph at the end, which
                // can be a long way below the title that carries the claim.
                const start = headings.filter((h) => h <= i).pop() ?? 0;
                const end = headings.find((h) => h > i) ?? lines.length;
                if (SUPERSEDED.test(lines.slice(start, end).join('\n'))) return;

                offenders.push(`  ${rel}:${i + 1}  ${line.trim()}`);
            });
        }

        if (offenders.length > 0) {
            throw new Error(
                `Documents claim the extension makes no network requests, but it contacts a ` +
                    `feedback relay when the user presses Send:\n${offenders.join('\n')}`
            );
        }
    });

    test('the claim check still fires on an unquoted assertion', () => {
        // Mutation check: the exemptions above must not have neutered it.
        const FORBIDDEN = /zero external network requests/i;
        const asserted = 'The extension makes zero external network requests.';
        const quoted = 'Guard against the "zero external network requests" claim.';

        const isQuoted = (line: string): boolean => {
            const m = FORBIDDEN.exec(line);
            if (!m) return false;
            const b = line[m.index - 1];
            const a = line[m.index + m[0].length];
            return (b === '"' && a === '"') || (b === '`' && a === '`');
        };

        expect(FORBIDDEN.test(asserted) && !isQuoted(asserted)).toBe(true);
        expect(FORBIDDEN.test(quoted) && !isQuoted(quoted)).toBe(false);
    });

    test('the manifest and package versions agree', () => {
        const manifest = JSON.parse(read('manifest.json'));
        const pkg = JSON.parse(read('package.json'));
        expect(manifest.version).toBe(pkg.version);
    });
});

// ---------------------------------------------------------------------------
// Paths referenced in prose
// ---------------------------------------------------------------------------

describe('documentation points at files that exist', () => {
    /** Directories whose contents docs link to; anything else is a URL or anchor. */
    const REPO_DIRS = ['src/', 'test/', 'scripts/', 'worker/', 'website/', '.planning/', '.github/', 'store-assets/'];

    function referencedPaths(text: string): string[] {
        const out = new Set<string>();

        // Markdown links: [label](path)
        for (const m of text.matchAll(/\]\(([^)\s]+)\)/g)) {
            const target = m[1].split('#')[0];
            if (!target || /^[a-z]+:/i.test(target)) continue;
            out.add(target);
        }
        // Inline code spans that look like repo paths
        for (const m of text.matchAll(/`([^`\n]+)`/g)) {
            const candidate = m[1].trim();
            if (REPO_DIRS.some((d) => candidate.startsWith(d)) && !candidate.includes(' ')) out.add(candidate);
        }
        return [...out];
    }

    /** Documented on purpose, absent on purpose. */
    const INTENTIONALLY_ABSENT = new Set(['website/.env.local', '.env.local']);

    test('every repo path named in a document resolves', () => {
        const missing: string[] = [];

        for (const rel of LIVE_DOCS) {
            const docDir = path.dirname(path.join(ROOT, rel));
            for (const target of referencedPaths(read(rel))) {
                // Skip globs, wildcards and shell fragments.
                if (/[*?<>|]/.test(target)) continue;
                if (INTENTIONALLY_ABSENT.has(target)) continue;
                const isRepoPath =
                    REPO_DIRS.some((d) => target.startsWith(d)) || /^[A-Za-z0-9_.-]+\.(md|json|js)$/.test(target);
                if (!isRepoPath) continue;
                // A markdown link is relative to its own file; try that first.
                if (fs.existsSync(path.join(docDir, target))) continue;
                if (fs.existsSync(path.join(ROOT, target))) continue;
                missing.push(`  ${rel} -> ${target}`);
            }
        }

        if (missing.length > 0) {
            throw new Error(`Documents reference paths that do not exist:\n${missing.join('\n')}`);
        }
    });
});

// ---------------------------------------------------------------------------
// The source map keeps up with the source
// ---------------------------------------------------------------------------

describe('CONTEXT_MAP covers the source tree', () => {
    const contextMap = read('CONTEXT_MAP.md');

    const modules = [
        ...walk(path.join(ROOT, 'src'), (n) => n.endsWith('.ts')),
    ].map((f) => path.relative(ROOT, f).split(path.sep).join('/'));

    test('finds the modules it is meant to check', () => {
        expect(modules).toContain('src/utils/storage.ts');
        expect(modules.length).toBeGreaterThan(20);
    });

    test('every source module appears in the map', () => {
        // This is the check that would have caught five modules added in July
        // and mapped in September.
        const missing = modules.filter((m) => !contextMap.includes(m));
        if (missing.length > 0) {
            throw new Error(
                `These modules are not in CONTEXT_MAP.md, so nobody reading it would know ` +
                    `they exist:\n${missing.map((m) => `  ${m}`).join('\n')}`
            );
        }
    });
});

// ---------------------------------------------------------------------------
// Dead CSS
// ---------------------------------------------------------------------------

describe('no stylesheet rule outlives what it styled', () => {
    const STYLESHEETS = ['src/options.css', 'src/welcome.css', 'src/ui/toolbar.css'];

    /**
     * Classes nothing in this repo mentions by name, and why that is correct.
     * Everything else must appear somewhere in the source.
     */
    const EXTERNALLY_APPLIED = new Set<string>([
        // Applied by the browser or by Gmail/InboxSDK, not by our code.
        'inboxsdk__appId',
    ]);

    /**
     * Some class names are built at runtime from a prefix plus a token, e.g.
     * `tab-color-${color}` in colors.ts. The full name never appears in the
     * source, but the prefix does, and a prefix that appears nowhere at all is
     * still the thing worth reporting.
     */
    const MIN_PREFIX = 8;
    function isReferenced(name: string, haystack: string): boolean {
        if (haystack.includes(name)) return true;
        let prefix = name;
        while (prefix.includes('-')) {
            prefix = prefix.slice(0, prefix.lastIndexOf('-') + 1);
            if (prefix.length >= MIN_PREFIX && haystack.includes(prefix)) return true;
            prefix = prefix.slice(0, -1);
        }
        return false;
    }

    function classNames(css: string): string[] {
        // Strip comments so a commented-out rule is not counted as live.
        const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
        const names = new Set<string>();
        for (const m of withoutComments.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) names.add(m[1]);
        return [...names];
    }

    const sources = [
        ...walk(path.join(ROOT, 'src'), (n) => n.endsWith('.ts') || n.endsWith('.html')),
        ...walk(path.join(ROOT, 'test'), (n) => n.endsWith('.ts')),
        ...walk(path.join(ROOT, 'scripts'), (n) => n.endsWith('.mjs') || n.endsWith('.html')),
    ]
        .map((f) => fs.readFileSync(f, 'utf8'))
        .join('\n');

    test('reads the stylesheets and the sources', () => {
        STYLESHEETS.forEach((s) => expect(fs.existsSync(path.join(ROOT, s))).toBe(true));
        expect(sources).toContain('force-dark');
        expect(sources.length).toBeGreaterThan(50_000);
    });

    test.each(STYLESHEETS)('%s mentions no class the code never uses', (sheet) => {
        const css = read(sheet);
        const orphans = classNames(css).filter(
            (name) => !EXTERNALLY_APPLIED.has(name) && !isReferenced(name, sources)
        );

        if (orphans.length > 0) {
            throw new Error(
                `${sheet} styles classes that appear nowhere in src/, test/ or scripts/:\n` +
                    orphans.map((o) => `  .${o}`).join('\n') +
                    '\n\nDelete the rule, or add the class to EXTERNALLY_APPLIED with a reason.'
            );
        }
    });

    test('the detector actually finds an orphan', () => {
        // Mutation check. The name is assembled at runtime so this very file
        // does not contain it and count as a usage.
        const name = ['orphaned', 'rule', 'probe', Date.now().toString(36)].join('-');
        const orphans = classNames(`.${name} { color: red; }`).filter((n) => !isReferenced(n, sources));
        expect(orphans).toEqual([name]);
    });

    test('the detector accepts a dynamically composed name', () => {
        // `tab-color-red` never appears literally; `tab-color-` does.
        expect(isReferenced('tab-color-red', 'const c = `tab-color-${color}`;')).toBe(true);
        expect(isReferenced('tab-nonsense-red', 'const c = `tab-color-${color}`;')).toBe(false);
    });

    test('the detector ignores a commented-out rule', () => {
        expect(classNames('/* .old-thing { color: red; } */\n.kept {}')).toEqual(['kept']);
    });
});
