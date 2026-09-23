/**
 * gmail-drift-canary.mjs
 *
 * Watches the five structural facts about Gmail that the label-menu feature
 * depends on, and reports when one of them stops being true.
 *
 * It does NOT watch Gmail's obfuscated class names. Those are read at runtime
 * and never written into our source, so a rename cannot break us. Measured on
 * 2026-09-23: two independent Chrome installations, different user-data-dirs
 * and different Chrome patch builds, produced byte-identical class strings.
 * What varies is the Gmail build, and what a build can take away is structure.
 *
 * The contract, as recorded in .planning/phases/05-label-menu/PLAN.md:
 *
 *   C1  a label row exposes its name without classes
 *   C2  clicking the trigger makes exactly one [role="menu"] visible
 *   C3  that menu holds a [role="menuitem"] with no aria-haspopup and height
 *   C4  a clone of that item renders identically to it
 *   OURS  our own item is present, correctly labelled and correctly styled
 *
 * C5, whether Gmail reuses one menu node across labels, is **recorded but not
 * asserted**. It was written as an assertion because an implementation that
 * injected once and left the item there would depend on it absolutely: the
 * item would keep acting on the label before last. Ours removes the item when
 * a menu closes and rebuilds it when one opens, and its removal searches the
 * whole document rather than one menu, so either behaviour is fine. Gmail has
 * been observed doing both. A change is still worth seeing in the fingerprint
 * diff, which is why it is recorded rather than dropped.
 *
 * It never touches the browser you are using. It copies the cookie and
 * preference files out of a signed-in profile (about 1.2 MB), runs headless
 * Chrome on a private port against the copy, and deletes the copy afterwards
 * whatever happens.
 *
 *   NODE_PATH=$(npm root -g) node scripts/canary/gmail-drift-canary.mjs [options]
 *
 *     --profile <dir>   source Chrome profile (default: $CANARY_SOURCE_PROFILE,
 *                       else auto-detected from a running Chrome, else
 *                       ~/.config/google-chrome)
 *     --dist <dir>      built extension to load (default: ./dist)
 *     --json            print the fingerprint and nothing else
 *     --keep            do not delete the temporary profile (debugging)
 *
 * Exit codes, which the systemd unit and install-canary.sh depend on:
 *
 *     0  PASS     every contract held
 *     2  FAIL     at least one contract broke
 *     3  SKIPPED  could not reach a signed-in Gmail; nothing was learned
 *     4  ERROR    the canary itself could not run (no Playwright, no Chrome)
 *
 * SKIPPED is deliberately not FAIL. A canary that cries wolf when a cookie
 * expires is a canary that gets ignored inside a fortnight.
 *
 * Needs Playwright available (`npm i -g playwright`). It is intentionally not
 * a project dependency, for the same reason contrast-audit.mjs is not: it is a
 * tool, not part of `npm test`.
 */

import { createRequire } from 'node:module';
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let chromium;
try {
    ({ chromium } = require('playwright'));
} catch {
    console.error('Playwright not found. Install it (npm i -g playwright) and run with NODE_PATH=$(npm root -g).');
    process.exit(4);
}

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');

const EXIT = { PASS: 0, FAIL: 2, SKIPPED: 3, ERROR: 4 };

// ---------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------

function arg(name, fallback) {
    const i = process.argv.indexOf(name);
    return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const FLAG = (name) => process.argv.includes(name);

const JSON_ONLY = FLAG('--json');
const KEEP = FLAG('--keep');
const DIST = path.resolve(arg('--dist', path.join(REPO, 'dist')));

const say = (...a) => { if (!JSON_ONLY) console.log(...a); };

// ---------------------------------------------------------------------------
// Locating things
// ---------------------------------------------------------------------------

/**
 * The profile to copy from. A running Chrome is the best signal available:
 * it is the one that is actually signed in. Falls back to the standard path,
 * which is right on a machine that runs plain Chrome.
 */
function findSourceProfiles() {
    const explicit = arg('--profile', process.env.CANARY_SOURCE_PROFILE);
    // A list, not one path. Several Chrome profiles on a machine can each hold
    // cookies while only one of them is signed into the Gmail we want, and
    // nothing on disk distinguishes them cheaply: both carry an `account_info`
    // block naming the same address. So the canary tries them in turn and lets
    // reaching a signed-in Gmail be the test, which is the only honest one.
    if (explicit) return explicit.split(':').filter(Boolean).map((d) => path.resolve(d));

    const candidates = [];
    try {
        const ps = execSync('ps -eo args', { encoding: 'utf8' });
        for (const m of ps.matchAll(/--user-data-dir=(\S+)/g)) {
            const d = m[1];
            // A temporary profile of our own is not a source of cookies.
            if (d.includes('/tmp/')) continue;
            if (!candidates.includes(d) && fs.existsSync(path.join(d, 'Default', 'Cookies'))) candidates.push(d);
        }
    } catch {
        /* ps is optional */
    }
    const standard = path.join(os.homedir(), '.config', 'google-chrome');
    if (fs.existsSync(path.join(standard, 'Default', 'Cookies'))) candidates.push(standard);
    return candidates.length ? candidates : [standard];
}

function findChrome() {
    const candidates = [
        process.env.CANARY_CHROME,
        '/opt/google/chrome/chrome',
        '/usr/bin/google-chrome',
        '/usr/bin/google-chrome-stable',
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser',
    ].filter(Boolean);
    for (const c of candidates) if (fs.existsSync(c)) return c;
    return null;
}

function freePort() {
    return new Promise((resolve, reject) => {
        const s = net.createServer();
        s.once('error', reject);
        s.listen(0, '127.0.0.1', () => {
            const { port } = s.address();
            s.close(() => resolve(port));
        });
    });
}

// ---------------------------------------------------------------------------
// The slim clone
// ---------------------------------------------------------------------------

/**
 * Copy only what a signed-in session needs. A full profile is several GB and
 * copying it would be both slow and a good way to fill a disk; this is about
 * 1.2 MB and takes milliseconds.
 */
function cloneProfile(src, dst) {
    fs.mkdirSync(path.join(dst, 'Default'), { recursive: true });
    const root = ['Local State'];
    const inDefault = [
        'Cookies',
        'Preferences',
        'Secure Preferences',
        'Login Data',
        'Web Data',
        'Network Persistent State',
    ];
    let copied = 0;
    for (const f of root) {
        const from = path.join(src, f);
        if (fs.existsSync(from)) { fs.copyFileSync(from, path.join(dst, f)); copied++; }
    }
    for (const f of inDefault) {
        const from = path.join(src, 'Default', f);
        if (fs.existsSync(from)) { fs.copyFileSync(from, path.join(dst, 'Default', f)); copied++; }
    }
    // Newer Chrome keeps cookies under Default/Network.
    const netDir = path.join(src, 'Default', 'Network');
    if (fs.existsSync(netDir)) {
        fs.mkdirSync(path.join(dst, 'Default', 'Network'), { recursive: true });
        for (const f of fs.readdirSync(netDir)) {
            const from = path.join(netDir, f);
            if (fs.statSync(from).isFile()) { fs.copyFileSync(from, path.join(dst, 'Default', 'Network', f)); copied++; }
        }
    }
    return copied;
}

// ---------------------------------------------------------------------------
// The probe, which runs inside the Gmail page
// ---------------------------------------------------------------------------

/**
 * Everything the contract needs, measured in one pass so the menu is opened
 * as few times as possible. Returns plain data; every judgement is made here
 * in Node, where it can be tested by eye in the output.
 */
const PROBE = async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const click = (el) =>
        ['mousedown', 'mouseup', 'click'].forEach((t) =>
            el.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, view: window, button: 0 }))
        );
    const escape = () =>
        document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
    const visibleMenus = () =>
        [...document.querySelectorAll('[role="menu"]')].filter((m) => m.getBoundingClientRect().height > 0);

    /**
     * Open a label's menu and wait for it, rather than clicking once and
     * hoping. Gmail binds its own handlers on its own schedule, and a canary
     * that reports a redesign because it clicked 200ms too early is a canary
     * nobody reads. Three attempts, each polled for up to 2.5 seconds.
     */
    /**
     * Open a label's menu, patiently, and click **once**.
     *
     * The clicking-again-until-it-works instinct is wrong here, and measurably
     * so. On 2026-09-23 a loop that clicked every 2.3s for 152 seconds never
     * opened the menu at all, while a single click with a 12-second window
     * opened it in 4.1 seconds on the same profile: the second click arrives
     * while Gmail is still opening the menu and cancels it, and every
     * subsequent one does the same.
     *
     * So: one click, a long window, and at most one more attempt in case the
     * first genuinely landed before Gmail was listening.
     */
    const openMenu = async (trigger, windowMs = 12000, attempts = 3) => {
        const startedAt = Date.now();
        for (let attempt = 1; attempt <= attempts; attempt++) {
            const clickedAt = Date.now();
            click(trigger);
            for (let waited = 0; waited < windowMs; waited += 100) {
                await sleep(100);
                const m = visibleMenus();
                if (m.length) {
                    return {
                        menus: m,
                        attempts: attempt,
                        waitedMs: Date.now() - startedAt,
                        // How long Gmail took from the click that armed the
                        // extension. This is the number the extension's own
                        // ceiling is measured against, not the total above.
                        sinceClickMs: Date.now() - clickedAt,
                    };
                }
            }
            // Five seconds between attempts, not none. A retry that treads on
            // the previous one is the failure this whole comment exists about;
            // a retry five seconds later is a genuinely fresh attempt at a
            // Gmail that was not listening yet. Measured across three cold
            // profiles: opened at 4.9s, never, and 6.1s.
            escape();
            await sleep(5000);
        }
        return { menus: [], attempts, waitedMs: Date.now() - startedAt, sinceClickMs: null };
    };

    const r = {
        gmailBuild: (window.GLOBALS && window.GLOBALS[9]) || null,
        signedIn: false,
        // Proof that the extension under test is actually running here. If it
        // is not, an absent menu item says nothing about Gmail.
        extensionActive: Boolean(document.getElementById('gmail-labels-as-tabs-bar')),
        labelRows: document.querySelectorAll('div.aim').length,
        c1: { ok: false, source: null, sample: null, userLabels: 0 },
        c2: { ok: false, visibleMenus: 0, totalMenus: document.querySelectorAll('[role="menu"]').length },
        c3: { ok: false, menuItems: 0, modelText: null },
        c4: { ok: false, height: null, modelHeight: null, font: false, padding: false, colour: false },
        c5: { ok: false, sameNode: null },
        ours: { applicable: false, present: false, text: null, inheritedClasses: null, styledLikeSibling: null, highlights: null },
        hover: { gmailAddsClass: null, gmailClasses: null, modelRestored: null },
        observed: {},
    };

    r.signedIn = /mail\.google\.com/.test(location.href) && !/accounts\.google\.com/.test(location.href);
    if (!r.signedIn) return r;

    // --- C1: read a label name with no class in sight -----------------------
    let triggers = [...document.querySelectorAll('[data-label-name]')];
    let source = 'data-label-name';
    if (!triggers.length) {
        triggers = [...document.querySelectorAll('[data-tooltip]')].filter((e) => e.closest('[role="navigation"]'));
        source = 'data-tooltip';
    }
    if (!triggers.length) {
        triggers = [...document.querySelectorAll('a[href*="#label/"]')];
        source = 'label-href';
    }
    const nameOf = (e) =>
        e.getAttribute('data-label-name') ||
        e.getAttribute('data-tooltip') ||
        decodeURIComponent((e.getAttribute('href') || '').split('#label/')[1] || '').replace(/\+/g, ' ');

    const userTriggers = triggers.filter((e) => {
        const n = nameOf(e);
        return n && !n.startsWith('^') && !n.startsWith('#^');
    });
    r.c1.ok = userTriggers.length > 0;
    r.c1.source = source;
    r.c1.userLabels = userTriggers.length;
    r.c1.sample = userTriggers.length ? nameOf(userTriggers[0]) : null;
    r.observed.triggerClasses = userTriggers.length ? userTriggers[0].className : null;
    if (!r.c1.ok) return r;

    // --- C2: exactly one menu becomes visible -------------------------------
    const firstOpen = await openMenu(userTriggers[0]);
    const menusA = firstOpen.menus;
    r.openedAfterMs = firstOpen.waitedMs;
    r.openedSinceClickMs = firstOpen.sinceClickMs;
    r.openAttempts = firstOpen.attempts;
    r.c2.visibleMenus = menusA.length;
    r.c2.totalMenus = document.querySelectorAll('[role="menu"]').length;
    r.c2.ok = menusA.length === 1;
    const menuA = menusA[menusA.length - 1];
    if (!menuA) return r;
    r.observed.menuClasses = menuA.className;

    // --- C3: a plain item exists to use as a model --------------------------
    // Our own item is excluded: measuring a clone against our clone would be
    // circular, and it is exactly the mistake that makes a check look green
    // while testing nothing.
    const itemsA = [...menuA.querySelectorAll('[role="menuitem"]')].filter(
        (i) => i.getBoundingClientRect().height > 0 && i.id !== 'glt-show-as-tabs'
    );
    r.c3.menuItems = itemsA.length;
    const model = [...itemsA].reverse().find((i) => !i.hasAttribute('aria-haspopup'));
    r.c3.ok = Boolean(model);
    r.c3.modelText = model ? model.innerText.trim().replace(/\n/g, ' ') : null;
    if (!model) return r;
    r.observed.menuItemClasses = [...new Set(itemsA.map((i) => i.className))];
    // A separator, identified without a class: a direct child that carries no
    // role, holds no menu item and has no text of its own. The section
    // headings Gmail puts in this menu ("In message list") also carry no role,
    // which is why the empty-text test is what distinguishes them.
    const sep = [...menuA.children].find(
        (c) =>
            !c.hasAttribute('role') &&
            !c.querySelector('[role="menuitem"]') &&
            c.textContent.trim() === '' &&
            c.getBoundingClientRect().height > 0
    );
    r.observed.separatorClasses = sep ? sep.className : null;

    // --- OURS: did the extension put its item here? -------------------------
    // The extension polls for the menu on its own schedule, so it can only add
    // the item after Gmail has shown it. Reading immediately would be a race
    // the canary wins and the extension loses, reporting a broken feature that
    // is merely a few milliseconds behind.
    let ourItem = null;
    for (let waited = 0; waited < 3000 && !ourItem; waited += 100) {
        await sleep(100);
        ourItem = menuA.querySelector('#glt-show-as-tabs');
    }
    r.ours.present = Boolean(ourItem);
    if (ourItem) {
        const ocs = getComputedStyle(ourItem);
        const mcs = getComputedStyle(model);
        r.ours.text = ourItem.innerText.trim();
        r.ours.inheritedClasses = ourItem.className;
        r.ours.styledLikeSibling =
            ocs.fontSize === mcs.fontSize &&
            ocs.fontFamily === mcs.fontFamily &&
            ocs.padding === mcs.padding &&
            Math.round(ourItem.getBoundingClientRect().height) === Math.round(model.getBoundingClientRect().height);
    }

    // --- Hover: how Gmail highlights, and whether ours does too -------------
    // Gmail highlights the item under the pointer from its own `jsaction`
    // handler, not from a `:hover` rule, so a clone with its wiring stripped
    // sits dead under the pointer unless the extension puts the highlight back.
    // The extension learns the class at runtime; this watches that it still
    // can, and that our item lights up whichever way it ended up doing it.
    const hoverProbe = (el) => {
        const before = el.getAttribute('class') || '';
        const styleBefore = el.style.backgroundColor || '';
        el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true, view: window }));
        el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false, cancelable: true, view: window }));
        const during = { cls: el.getAttribute('class') || '', style: el.style.backgroundColor || '' };
        el.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, cancelable: true, view: window }));
        el.dispatchEvent(new MouseEvent('mouseleave', { bubbles: false, cancelable: true, view: window }));
        const after = el.getAttribute('class') || '';
        // Leave Gmail's own element exactly as it was found.
        if (after !== before) el.setAttribute('class', before);
        return { before, styleBefore, during, after };
    };

    const gmailHover = hoverProbe(model);
    const had = new Set(gmailHover.before.split(/\s+/).filter(Boolean));
    const gained = gmailHover.during.cls.split(/\s+/).filter((c) => c && !had.has(c));
    r.hover.gmailAddsClass = gained.length > 0;
    r.hover.gmailClasses = gained.join(' ') || null;
    r.hover.modelRestored = gmailHover.after === gmailHover.before;

    if (ourItem) {
        const ownHover = hoverProbe(ourItem);
        r.ours.highlights =
            ownHover.during.cls !== ownHover.before || ownHover.during.style !== ownHover.styleBefore;
    }

    // --- C4: a clone of the model renders identically -----------------------
    menuA.querySelector('#glt-canary-probe')?.remove();
    const clone = model.cloneNode(true);
    clone.id = 'glt-canary-probe';
    clone.removeAttribute('aria-hidden');
    (clone.firstElementChild || clone).textContent = 'Canary';
    model.after(clone);
    await sleep(200);
    const cr = clone.getBoundingClientRect();
    const mr = model.getBoundingClientRect();
    const ccs = getComputedStyle(clone);
    const mcs2 = getComputedStyle(model);
    r.c4.height = Math.round(cr.height);
    r.c4.modelHeight = Math.round(mr.height);
    r.c4.font = ccs.fontSize === mcs2.fontSize && ccs.fontFamily === mcs2.fontFamily;
    r.c4.padding = ccs.padding === mcs2.padding;
    r.c4.colour = ccs.color === mcs2.color;
    r.c4.ok = cr.height > 0 && r.c4.height === r.c4.modelHeight && r.c4.font && r.c4.padding && r.c4.colour;
    clone.remove();

    // --- C5: is the same menu node reused for another label? ----------------
    escape();
    await sleep(600);
    const second = userTriggers[1] || userTriggers[0];
    // Gmail is demonstrably awake by now, so this one needs less patience.
    const menusB = (await openMenu(second, 8000, 2)).menus;
    const menuB = menusB[menusB.length - 1];
    // Recorded, not asserted. Whether Gmail reuses one node or builds a fresh
    // one per open changes nothing for us, because the item is removed when a
    // menu closes and rebuilt when one opens, and `removeMenuItem` searches
    // the whole document rather than one menu. It is recorded because a change
    // in it is worth seeing in the fingerprint diff, and because a future
    // implementation that injected once would depend on it absolutely.
    r.c5.sameNode = Boolean(menuB) && menuA === menuB;
    r.c5.ok = Boolean(menuB);
    escape();
    await sleep(200);

    return r;
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

let chromeProc = null;
let tmpProfile = null;

/**
 * Stop Chrome and wait for it to actually be gone.
 *
 * Deleting the profile directory while Chrome is still shutting down does not
 * work: it flushes its own writes on the way out and recreates what was just
 * removed. The first version of this script left a temporary profile behind
 * after every successful run, which the phase-1 audit caught.
 */
function stopChrome() {
    return new Promise((resolve) => {
        if (!chromeProc || chromeProc.exitCode !== null || chromeProc.killed) return resolve();
        const done = () => { clearTimeout(hard); resolve(); };
        chromeProc.once('exit', done);
        const hard = setTimeout(() => {
            try { chromeProc.kill('SIGKILL'); } catch { /* already gone */ }
            setTimeout(done, 300);
        }, 4000);
        try { chromeProc.kill('SIGTERM'); } catch { done(); }
    });
}

/** Ordered cleanup: Chrome first, then the profile it was writing to. */
async function cleanupAsync() {
    await stopChrome();
    if (tmpProfile && !KEEP) {
        try { fs.rmSync(tmpProfile, { recursive: true, force: true }); } catch { /* backstop below */ }
    }
}

/**
 * Synchronous backstop for the paths that cannot await: an uncaught throw, a
 * signal, `process.exit` from somewhere unexpected. It can lose the race with
 * a shutting-down Chrome, which is exactly why cleanupAsync exists and runs
 * first on every normal path.
 */
function cleanup() {
    if (chromeProc && !chromeProc.killed) {
        try { chromeProc.kill('SIGKILL'); } catch { /* already gone */ }
    }
    if (tmpProfile && !KEEP) {
        try { fs.rmSync(tmpProfile, { recursive: true, force: true }); } catch { /* best effort */ }
    }
}
process.on('exit', cleanup);
process.on('SIGINT', () => { cleanup(); process.exit(EXIT.ERROR); });
process.on('SIGTERM', () => { cleanup(); process.exit(EXIT.ERROR); });

/**
 * The extension's own ceiling for how long it waits for a menu, read from the
 * source so the two cannot drift apart. Falls back to the value at the time of
 * writing if the source is not where this expects it.
 */
function readMenuWaitMs() {
    try {
        const src = fs.readFileSync(path.join(REPO, 'src', 'modules', 'labelMenu.ts'), 'utf8');
        const m = src.match(/const MENU_WAIT_MS\s*=\s*(\d+)/);
        if (m) return Number(m[1]);
    } catch {
        /* fall through */
    }
    return 10000;
}

function record(result, verdict, failures, probe) {
    const fp = {
        observedAt: new Date().toISOString(),
        verdict,
        gmailBuild: probe?.gmailBuild ?? null,
        chrome: result.chromeVersion ?? null,
        labelRows: probe?.labelRows ?? null,
        extensionActive: probe?.extensionActive ?? null,
        // Recorded, not asserted: how long Gmail took to answer is about the
        // canary's environment, not about Gmail's structure.
        menuOpenedAfterMs: probe?.openedAfterMs ?? null,
        menuOpenedSinceClickMs: probe?.openedSinceClickMs ?? null,
        labelTriggers: probe?.c1?.userLabels ?? null,
        labelNameSource: probe?.c1?.source ?? null,
        menuClasses: probe?.observed?.menuClasses ?? null,
        menuItemClasses: probe?.observed?.menuItemClasses ?? null,
        separatorClasses: probe?.observed?.separatorClasses ?? null,
        triggerClasses: probe?.observed?.triggerClasses ?? null,
        visibleMenuItems: probe?.c3?.menuItems ?? null,
        menuNodeReused: probe?.c5?.sameNode ?? null,
        // Recorded, not asserted, for the same reason as C5: whether Gmail
        // highlights by class or by stylesheet changes nothing for us, because
        // the extension falls back to a wash of its own. A change is still
        // worth seeing in the diff, and the class itself is the one Gmail
        // string this project deliberately never writes down.
        hoverAddsClass: probe?.hover?.gmailAddsClass ?? null,
        hoverClasses: probe?.hover?.gmailClasses ?? null,
        contract: {
            C1: probe?.c1?.ok ?? null,
            C2: probe?.c2?.ok ?? null,
            C3: probe?.c3?.ok ?? null,
            C4: probe?.c4?.ok ?? null,
            C5: 'recorded, not asserted',
            OURS: probe?.ours?.applicable ? probe.ours.present && probe.ours.styledLikeSibling : 'n/a',
            HOVER: 'recorded, not asserted',
        },
        ownItemText: probe?.ours?.text ?? null,
        failures,
    };

    const fpPath = path.join(HERE, 'fingerprint.json');
    const historyPath = path.join(HERE, 'history.ndjson');

    // Append every run, including skips: the rate of change is only knowable
    // if the quiet runs are recorded too.
    try {
        fs.appendFileSync(historyPath, JSON.stringify(fp) + '\n');
        // A daily job appending for years is a file nobody ever trims. Keeping
        // the last 500 runs is well over a year of history and stays readable.
        const lines = fs.readFileSync(historyPath, 'utf8').split('\n').filter(Boolean);
        if (lines.length > 500) {
            fs.writeFileSync(historyPath, lines.slice(-500).join('\n') + '\n');
        }
    } catch { /* non-fatal */ }

    // The committed fingerprint records what Gmail looks like when everything
    // works, so only a PASS may write it. A failing run that overwrote it
    // would destroy the very baseline needed to diagnose the failure, which
    // the phase-1 audit caught it doing.
    //
    // And even a PASS writes only when something it records has actually
    // moved, so the file's git history is a log of Gmail changes rather than
    // a daily timestamp commit.
    let changed = true;
    if (fs.existsSync(fpPath)) {
        try {
            const prev = JSON.parse(fs.readFileSync(fpPath, 'utf8'));
            // Everything that describes the run rather than Gmail is stripped
            // before comparing, or the file would be rewritten every single
            // day and its history would stop being a log of Gmail changes.
            const strip = (o) => {
                const c = { ...o };
                delete c.observedAt;
                delete c.chrome;
                delete c.menuOpenedAfterMs;
                delete c.menuOpenedSinceClickMs;
                return JSON.stringify(c);
            };
            changed = strip(prev) !== strip(fp);
        } catch { changed = true; }
    }
    if (changed && verdict === 'PASS') {
        fs.writeFileSync(fpPath, JSON.stringify(fp, null, 2) + '\n');
    }
    return { fp, changed };
}

async function runAgainst(chrome, src) {
    tmpProfile = fs.mkdtempSync(path.join(os.tmpdir(), 'glt-canary-'));
    const files = cloneProfile(src, tmpProfile);
    say(`profile: ${src} (${files} files cloned)`);

    const port = await freePort();
    chromeProc = spawn(
        chrome,
        [
            '--headless=new',
            `--remote-debugging-port=${port}`,
            `--user-data-dir=${tmpProfile}`,
            '--disable-sync',
            '--no-first-run',
            '--no-default-browser-check',
            '--window-size=1400,1000',
            '--hide-scrollbars',
            'about:blank',
        ],
        { stdio: 'ignore', detached: false }
    );

    // Wait for the debugging endpoint rather than sleeping a guessed amount.
    let browser = null;
    for (let i = 0; i < 60 && !browser; i++) {
        try {
            browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
        } catch {
            await new Promise((r) => setTimeout(r, 250));
        }
    }
    if (!browser) {
        console.error('Chrome did not expose a debugging endpoint.');
        return { code: EXIT.ERROR };
    }
    const result = { chromeVersion: browser.version?.() ?? null };

    // Chrome 137 and later ignore --load-extension. This is the supported way.
    let extensionLoaded = false;
    try {
        if (FLAG('--no-extension')) throw new Error('skipped by --no-extension');
        const session = await browser.newBrowserCDPSession();
        await session.send('Extensions.loadUnpacked', { path: DIST });
        extensionLoaded = true;
    } catch (err) {
        say(`note: could not load the extension (${err.message.split('\n')[0]}); contract checks still run`);
    }

    const ctx = browser.contexts()[0];
    const page = await ctx.newPage();
    let probe = null;
    try {
        // Gmail replaces its own initial navigation, which surfaces as
        // ERR_ABORTED even though the page goes on to load perfectly. The
        // selector wait below is the real readiness signal, so a goto that
        // throws is noted and stepped over rather than treated as failure.
        // Installing an unpacked extension aborts whatever navigation the
        // browser is in the middle of, so the first goto after it reliably
        // reports ERR_ABORTED and lands on about:blank. Retrying is the fix;
        // by the second attempt the extension is installed and settled.
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                await page.goto('https://mail.google.com/mail/u/0/#inbox', { waitUntil: 'commit', timeout: 90000 });
                break;
            } catch (err) {
                say(`note: navigation attempt ${attempt} reported "${err.message.split('\n')[0]}"`);
                await page.waitForTimeout(1500);
            }
        }
        try {
            // `attached`, not the default `visible`: the first matching
            // element is one of Gmail's own hidden system labels, so waiting
            // for visibility waits the full timeout on every single run.
            // Two waits, because they mean different things. The first is
            // "the label list exists"; the second is "Gmail has finished
            // laying it out", and only the second predicts whether a click on
            // a label's menu trigger will be answered.
            //
            // Measured on 2026-09-23: attached at 25.2s, visible at 25.3s,
            // and a click 2.3s later opened the menu. Before this was
            // explicit, the wait came from a `visible` selector that could
            // never match (Gmail's first label row is one of its own hidden
            // system labels) and therefore burned its full 60s timeout on
            // every run. That accident was load-bearing, which is the worst
            // kind of thing to leave in a canary.
            await page.waitForSelector('[data-label-name], a[href*="#label/"]', {
                state: 'attached',
                timeout: 60000,
            });
            await page.waitForSelector('a[href*="#label/"]', { state: 'visible', timeout: 90000 });
        } catch {
            /* handled by the signedIn check below */
        }
        // The extension installs its menu item after its own settings load,
        // which is not covered by any Gmail signal.
        await page.waitForTimeout(3000);
        say(`landed on: ${page.url()}`);
        probe = await page.evaluate(PROBE);
    } catch (err) {
        say(`navigation failed: ${err.message.split('\n')[0]}`);
    } finally {
        await browser.close().catch(() => {});
    }

    if (!probe || !probe.signedIn) {
        const { fp } = record(result, 'SKIPPED', ['not signed in, or Gmail never loaded'], probe);
        if (JSON_ONLY) console.log(JSON.stringify(fp, null, 2));
        else say('SKIPPED: could not reach a signed-in Gmail. Nothing was learned; this is not a failure.');
        return { code: EXIT.SKIPPED };
    }

    // Only judge our own item when the build actually ships it.
    let shipsOwnItem = false;
    try {
        shipsOwnItem = fs.readFileSync(path.join(DIST, 'js', 'content.js'), 'utf8').includes('glt-show-as-tabs');
    } catch { /* treated as not shipped */ }
    probe.ours.applicable = shipsOwnItem;

    // An extension that never injected cannot be judged on whether its menu
    // item appeared. That is a broken canary, not a Gmail change, and calling
    // it FAIL would send us looking in the wrong place.
    if (shipsOwnItem && !probe.extensionActive) {
        const { fp } = record(result, 'SKIPPED', ['the extension under test did not inject its tab bar'], probe);
        if (JSON_ONLY) console.log(JSON.stringify(fp, null, 2));
        else say('SKIPPED: the extension did not load in the canary browser, so its menu item could not be judged.');
        return { code: EXIT.SKIPPED };
    }

    const checks = [
        ['C1', probe.c1.ok, `label name readable without classes (via ${probe.c1.source}, ${probe.c1.userLabels} user labels)`],
        ['C2', probe.c2.ok, `exactly one [role="menu"] became visible (saw ${probe.c2.visibleMenus})`],
        ['C3', probe.c3.ok, `a plain [role="menuitem"] exists to clone (model: ${probe.c3.modelText})`],
        ['C4', probe.c4.ok, `a clone renders identically (h ${probe.c4.height} vs ${probe.c4.modelHeight}, font ${probe.c4.font}, padding ${probe.c4.padding}, colour ${probe.c4.colour})`],
    ];
    // The extension stops waiting for a menu after MENU_WAIT_MS. Read out of
    // the source rather than copied, because a copy of a constant is a copy
    // that goes stale, and a stale one here would make this canary report a
    // broken feature that is behaving exactly as built.
    const EXTENSION_MENU_WAIT_MS = readMenuWaitMs();
    const tookTooLong = (probe.openedSinceClickMs ?? 0) > EXTENSION_MENU_WAIT_MS;

    if (shipsOwnItem && tookTooLong && !probe.ours.present) {
        // Gmail took longer to open the menu than the extension waits, so an
        // absent item is the extension behaving exactly as designed. Failing
        // here would report a broken feature every time this cold headless
        // profile was slow, which is most of the reason a canary gets ignored.
        say(
            `note: Gmail took ${Math.round((probe.openedSinceClickMs ?? 0) / 1000)}s to open the menu, ` +
                `past the extension's ${EXTENSION_MENU_WAIT_MS / 1000}s ceiling. OURS not judged this run.`
        );
    } else if (shipsOwnItem) {
        checks.push([
            'OURS',
            probe.ours.present && probe.ours.styledLikeSibling === true,
            `our item is present and styled like its siblings (present ${probe.ours.present}, text ${JSON.stringify(probe.ours.text)}, styled ${probe.ours.styledLikeSibling})`,
        ]);
        // Asserted separately from OURS so a dead highlight reads as a dead
        // highlight rather than as a missing item. It is asserted at all
        // because an item that does not react to the pointer reads as broken
        // even though it works, which is the report a user actually sends.
        checks.push([
            'HOVER',
            probe.ours.highlights === true,
            `our item lights up under the pointer (Gmail adds ${JSON.stringify(probe.hover.gmailClasses)}, ours reacts ${probe.ours.highlights}, Gmail's item restored ${probe.hover.modelRestored})`,
        ]);
    }

    const failures = checks.filter(([, ok]) => !ok).map(([id, , why]) => `${id}: ${why}`);
    const verdict = failures.length ? 'FAIL' : 'PASS';
    const { fp, changed } = record(result, verdict, failures, probe);

    if (JSON_ONLY) {
        console.log(JSON.stringify(fp, null, 2));
    } else {
        say('');
        for (const [id, ok, why] of checks) say(`  ${ok ? 'ok  ' : 'FAIL'} ${id}  ${why}`);
        say('');
        say(
            `Gmail build ${probe.gmailBuild}, ${probe.labelRows} label rows, extension ` +
                `${probe.extensionActive ? 'active' : 'NOT active'}, menu opened after ` +
                `${Math.round((probe.openedAfterMs ?? 0) / 1000)}s on attempt ${probe.openAttempts ?? '?'}`
        );
        say(
            verdict !== 'PASS'
                ? 'fingerprint.json left alone: it records the last good state'
                : changed
                  ? 'fingerprint.json updated: something moved'
                  : 'fingerprint.json unchanged'
        );
        say(verdict === 'PASS' ? 'PASS' : `FAIL\n  ${failures.join('\n  ')}`);
    }
    if (verdict === 'PASS') return { code: EXIT.PASS };
    // A run where the menu simply never appeared is the one flaky outcome this
    // canary has. Everything downstream of C2 fails with it, so a whole fresh
    // browser is a genuinely independent second opinion, and worth taking
    // before telling anyone Gmail has changed.
    const onlyC2 = !probe.c2.ok;
    return { code: EXIT.FAIL, retryable: onlyC2 };
}

/**
 * Try each candidate profile until one reaches a signed-in Gmail.
 *
 * Only a SKIPPED moves on to the next: a FAIL means the canary got where it
 * was going and found Gmail changed, which is the answer, not a reason to go
 * looking somewhere else.
 */
async function main() {
    const chrome = findChrome();
    if (!chrome) {
        console.error('No Chrome binary found. Set CANARY_CHROME to its path.');
        return EXIT.ERROR;
    }
    if (!fs.existsSync(path.join(DIST, 'manifest.json'))) {
        console.error(`No built extension at ${DIST}. Run "npm run build" first.`);
        return EXIT.ERROR;
    }

    const candidates = findSourceProfiles().filter(
        (d) =>
            fs.existsSync(path.join(d, 'Default', 'Cookies')) ||
            fs.existsSync(path.join(d, 'Default', 'Network', 'Cookies'))
    );
    if (candidates.length === 0) {
        console.error('No Chrome profile with a cookie store. Pass --profile <dir> or set CANARY_SOURCE_PROFILE.');
        return EXIT.SKIPPED;
    }

    let last = EXIT.SKIPPED;
    for (const src of candidates) {
        let outcome = await runAgainst(chrome, src);

        if (outcome.retryable) {
            say('the menu never opened; taking a second opinion in a fresh browser before reporting it');
            await cleanupAsync();
            outcome = await runAgainst(chrome, src);
        }

        last = outcome.code;
        if (last !== EXIT.SKIPPED) return last;
        await cleanupAsync();
        if (candidates.length > 1) say(`(trying the next profile)`);
    }
    return last;
}

main()
    .then(async (code) => { await cleanupAsync(); process.exit(code); })
    .catch(async (err) => {
        console.error('canary error:', err);
        await cleanupAsync();
        process.exit(EXIT.ERROR);
    });
