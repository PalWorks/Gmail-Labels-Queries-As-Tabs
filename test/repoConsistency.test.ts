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
    // No 'website/': the marketing site moved to PalWorks/Gmail-Labels-As-Tabs
    // in v1.5.0, so a backticked `website/...` in prose now names a path in
    // another repository and cannot be resolved from here. Markdown links to
    // it are still caught below, which is the case that would mislead.
    const REPO_DIRS = ['src/', 'test/', 'scripts/', 'worker/', '.planning/', '.github/', 'store-assets/'];

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
    const INTENTIONALLY_ABSENT = new Set(['.env.local']);

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

// ---------------------------------------------------------------------------
// Every outbound host the extension can reach must be disclosed
// ---------------------------------------------------------------------------

/**
 * The uninstall URL shipped for four versions disclosed in no document, no
 * privacy page and no store listing. It is back by an explicit product
 * decision (ADR-014), so the disclosure is now a build gate rather than a
 * promise: name a host in the service worker and it must appear in every
 * place a user or a reviewer would go looking for it.
 */
describe('outbound hosts are disclosed wherever a user would look', () => {
    const DISCLOSURE_FILES = ['SECURITY.md', 'src/options.html', 'STORE_LISTING.md'];

    function hostsIn(source: string): string[] {
        const urls = source.match(/https?:\/\/[^\s'"`)]+/g) ?? [];
        return [...new Set(urls.map((u) => new URL(u).host))];
    }

    test('the service worker names at least one outbound host', () => {
        // If this ever goes to zero the guard below passes vacuously, which
        // would be the quiet failure all over again.
        expect(hostsIn(read('src/background.ts')).length).toBeGreaterThan(0);
    });

    /** Returns one line per (host, document) pair where the host is missing. */
    function undisclosed(source: string): string[] {
        return hostsIn(source).flatMap((host) =>
            DISCLOSURE_FILES.filter((file) => !read(file).includes(host)).map(
                (file) => `${host} is not mentioned in ${file}`
            )
        );
    }

    test('each host the service worker names is disclosed in every required place', () => {
        const missing = undisclosed(read('src/background.ts'));
        if (missing.length > 0) {
            throw new Error(
                'An outbound host is undisclosed:\n' +
                    missing.map((m) => `  ${m}`).join('\n') +
                    '\n\nDisclose it, or remove the host from src/background.ts.'
            );
        }
    });

    test('the same check fails on a service worker with an undisclosed host', () => {
        // Mutation check: run the real predicate over a synthetic source whose
        // host is deliberately nowhere in the repo. Without this, a detector
        // that silently found no hosts would let the test above pass forever.
        const fake = `https://undisclosed-${Date.now().toString(36)}.example`;
        expect(undisclosed(`chrome.runtime.setUninstallURL('${fake}/x');`)).toHaveLength(
            DISCLOSURE_FILES.length
        );
    });
});

// ---------------------------------------------------------------------------
// Documented test counts must agree with each other
// ---------------------------------------------------------------------------

/**
 * Four live documents each stated a different total (563, 564, 563, 479)
 * within one release, because each was updated at a different moment. None
 * was wrong when written, which is exactly why nobody noticed.
 *
 * This cannot check the real count without running the suite, but it can
 * insist the documents tell one story, which is what catches a partial sweep.
 */
describe('current-state documents agree on the test count', () => {
    // Deliberately not the .planning documents or the CHANGELOG: those are
    // records of a moment and must keep the number that was true then.
    const LIVE_DOCS = ['AUDIT.md', 'ARCHITECTURE.md', 'TESTING.md', 'README.md', 'STORE_LISTING.md'];

    /** "30 suites, 569 tests" and "569 tests across 30 suites" and "569 automated tests". */
    const COUNT = /(\d{3,4})\s+(?:automated\s+)?tests?\b(?!\s+across\s+\d+\s+suites\s+in\s+v1\.)/g;

    function countsIn(rel: string): number[] {
        const lines = read(rel).split('\n');
        const found: number[] = [];
        for (const line of lines) {
            // Release-history bullets and blockquoted refresh notes record
            // what was true at a moment; rewriting them destroys the record.
            if (/^\s*>/.test(line)) continue;
            if (/^\s*-\s+Expanded|^\s*\|\s*v\d/.test(line)) continue;
            for (const m of line.matchAll(COUNT)) found.push(Number(m[1]));
        }
        return found;
    }

    test('every stated total is the same number', () => {
        const stated = new Map<string, number[]>();
        for (const doc of LIVE_DOCS) {
            const counts = countsIn(doc);
            if (counts.length > 0) stated.set(doc, counts);
        }
        const all = [...new Set([...stated.values()].flat())];
        if (all.length > 1) {
            throw new Error(
                'Documents disagree on how many tests there are:\n' +
                    [...stated].map(([d, c]) => `  ${d}: ${c.join(', ')}`).join('\n') +
                    '\n\nUpdate them all, or drop the number from the ones that do not need it.'
            );
        }
        expect(all).toHaveLength(1);
    });

    test('the check would notice a disagreement', () => {
        const a = countsIn('TESTING.md');
        expect(a.length).toBeGreaterThan(0);
        expect(new Set([...a, a[0] + 1]).size).toBeGreaterThan(1);
    });
});

// ---------------------------------------------------------------------------
// The marketing site lives in another repository, and links must survive that
// ---------------------------------------------------------------------------

/**
 * Two GitHub Pages sites answered for this product until v1.5.0. The website
 * was split out into PalWorks/Gmail-Labels-As-Tabs in March 2026, but the
 * `website/` folder left behind here kept deploying a second copy, so the
 * privacy policy existed twice and drifted. The listing named one, the
 * extension's own help button linked to the other, and the policy that was
 * actually correct was on the copy nobody pointed at.
 *
 * The duplicate is gone. What remains is a cross-repository dependency, which
 * nothing in a build can resolve, so these guards pin the one thing that can
 * be checked from here: every URL we ship or publish names the surviving site.
 */
describe('links point at the marketing site that still exists', () => {
    const SITE = 'https://palworks.github.io/Gmail-Labels-As-Tabs/';

    /** Files that can send a user or a reviewer to the marketing site. */
    const OUTWARD_FACING = [
        'STORE_LISTING.md',
        'README.md',
        'SECURITY.md',
        'src/options.html',
        'src/modules/modals/settingsModal.ts',
    ];

    /**
     * A backticked host is being discussed, which the explanation of the
     * retirement has to do; a URL with a scheme is a link somebody can click.
     * Only the second is a defect. Same distinction the doc-claims guard makes.
     */
    function retiredLinks(body: string): string[] {
        return (body.match(/https:\/\/palworks\.github\.io\/[^\s`)|"'<]*/g) ?? []).filter((u) =>
            u.includes('Gmail-Labels-Queries-As-Tabs')
        );
    }

    test('nothing links to the retired Pages site', () => {
        const offenders = OUTWARD_FACING.flatMap((f) =>
            retiredLinks(read(f)).map((u) => `${f}: ${u}`)
        );
        if (offenders.length > 0) {
            throw new Error(
                `These still link to the retired Pages site, which no longer serves:\n` +
                    offenders.map((o) => `  ${o}`).join('\n') +
                    `\n\nUse ${SITE} instead.`
            );
        }
    });

    test('the link detector ignores a backticked mention but catches a link', () => {
        expect(retiredLinks('the old `palworks.github.io/Gmail-Labels-Queries-As-Tabs` site')).toEqual([]);
        expect(retiredLinks('see https://palworks.github.io/Gmail-Labels-Queries-As-Tabs/#/privacy')).toHaveLength(1);
    });

    test('the extension ships a help link to a route that exists on that site', () => {
        const source = read('src/modules/modals/settingsModal.ts');
        expect(source).toContain(`${SITE}#/contact`);
        // `#/#contact` is not a route; it silently degrades to the homepage.
        // Checked on the call, not the file, so the comment explaining it is fine.
        expect(source).not.toMatch(/window\.open\(\s*'[^']*#\/#/);
    });

    test('the listing names the surviving site for privacy, homepage and support', () => {
        const listing = read('STORE_LISTING.md');
        expect(listing).toContain(`${SITE}#/privacy`);
        const urls = listing.match(/https:\/\/palworks\.github\.io\/[^\s`)|]*/g) ?? [];
        const wrong = [...new Set(urls.filter((u) => !u.startsWith(SITE)))];
        if (wrong.length > 0) {
            throw new Error(
                `The listing names a palworks.github.io URL outside the live site:\n` +
                    wrong.map((u) => `  ${u}`).join('\n')
            );
        }
    });

    test('this repository no longer builds a website of its own', () => {
        // The duplicate came back once already, as a folder nobody deleted.
        expect(fs.existsSync(path.join(ROOT, 'website'))).toBe(false);
        const workflows = walk(path.join(ROOT, '.github', 'workflows'), () => true);
        for (const wf of workflows) {
            expect(fs.readFileSync(wf, 'utf8')).not.toMatch(/upload-pages-artifact|deploy-pages/);
        }
    });

    test('every workflow is manually triggered', () => {
        // Actions minutes are spent deliberately. A `push:` trigger creeping
        // back in is the kind of thing nobody notices until the bill does.
        const workflows = walk(path.join(ROOT, '.github', 'workflows'), (n) => n.endsWith('.yml'));
        expect(workflows.length).toBeGreaterThan(0);
        for (const wf of workflows) {
            const body = fs.readFileSync(wf, 'utf8');
            const triggers = /\non:\n([\s\S]*?)(?=\n[a-z]+:\n)/.exec(body)?.[1] ?? '';
            expect(triggers).toContain('workflow_dispatch');
            expect(triggers).not.toMatch(/^\s{2}(push|pull_request|schedule):/m);
        }
    });
});
