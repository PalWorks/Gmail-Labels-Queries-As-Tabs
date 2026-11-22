/**
 * build.mjs: the Chrome Web Store screenshots and promo tiles, from the real
 * extension in a real Gmail.
 *
 * The extension is loaded unpacked into a throwaway copy of a signed-in Chrome
 * profile, run headless with sync off, and deleted afterwards, so the real
 * account's settings are never touched and nothing opens on the desktop.
 *
 * What is real and what is demo, stated once because the listing depends on it:
 * the tab bar, the sender chips, the label menu item, the options pages and
 * Gmail's own interface are the running product. The inbox rows and the label
 * names in Gmail's sidebar are replaced, in the page and only for the shot,
 * with invented senders, subjects and labels, so no real mail, contact or
 * label reaches an image. The account avatar, the side panel and anything else
 * that could carry personal content stay blurred. Every row is checked against
 * the demo text before a shot is kept; a row that still carries anything else
 * fails the run.
 *
 *   NODE_PATH=$(npm root -g) node scripts/store-assets/build.mjs [--profile <dir>] [--account <address>] [--probe]
 *
 * --account defaults to the first CANARY_ACCOUNT in
 * ~/.config/gmail-labels-as-tabs/alerts.env, the account the drift canary
 * watches; it must have user labels. GLT_DEBUG=1 reports where a row's
 * leftover text sits (element classes and lengths, never the text) when the
 * demo-text check refuses a row.
 *
 * Needs a global Playwright and a built dist/. Output: store-assets/.
 */

import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { parseAccounts, gmailUrl, observedAccount, isExpectedAccount } from '../canary/accounts.mjs';
import { parseEnvFile, CONFIG_FILE } from '../canary/notify.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const OUT = path.join(ROOT, 'store-assets');
const RAW = path.join(OUT, 'raw');
const DIST = path.join(ROOT, 'dist');
const arg = (n, d) => {
    const i = process.argv.indexOf(n);
    return i !== -1 ? process.argv[i + 1] : d;
};
// The first profile the drift canary copies, else Chrome's default one.
const SRC = arg('--profile', process.env.CANARY_SOURCE_PROFILE?.split(':')[0] || path.join(os.homedir(), '.config/google-chrome'));
const PROBE = process.argv.includes('--probe');
// Which Gmail account to shoot: --account, else the first CANARY_ACCOUNT the
// drift canary measures (alerts.env), else whichever is /u/0. The account
// needs user labels for the label menu shot, and naming it means a new
// account signing in to the profile cannot change what is captured.
const ACCOUNT = (() => {
    let v = arg('--account', process.env.CANARY_ACCOUNT);
    if (!v) {
        try { v = parseEnvFile(fs.readFileSync(CONFIG_FILE, 'utf8')).CANARY_ACCOUNT; } catch { /* none */ }
    }
    return parseAccounts(v)[0] ?? null;
})();

// The viewport the shots are taken at, in CSS pixels, drawn at twice the
// density so a crop can be enlarged in the frame and stay sharp.
const VW = 1440;
const VH = 900;

fs.mkdirSync(RAW, { recursive: true });
const WORK = fs.mkdtempSync(path.join(os.tmpdir(), 'glt-shots-'));
const PROFILE = path.join(WORK, 'profile');

// ---------------------------------------------------------------------------
// Demo content
// ---------------------------------------------------------------------------

const DEMO_TABS = [
    { id: 's1', title: 'Inbox', type: 'hash', value: '#inbox' },
    { id: 's2', title: 'Clients', type: 'label', value: 'Clients', color: 'blue' },
    { id: 's3', title: 'Invoices', type: 'label', value: 'Invoices', color: 'green' },
    { id: 's4', title: 'Travel', type: 'label', value: 'Travel', color: 'teal' },
    { id: 's5', title: 'Starred', type: 'hash', value: '#starred', color: 'orange' },
    { id: 's6', title: 'Unread', type: 'hash', value: '#search/is%3Aunread' },
];

/** The options pages show this account, so the account picker never shows a real one. */
const DEMO_ACCOUNT = 'demo@palworks.ai';
const DEMO_OPTIONS_SETTINGS = {
    tabs: [
        ...DEMO_TABS.slice(0, 4),
        { id: 's7', title: 'Promotions', type: 'hash', value: '#category/promotions' },
        { id: 's8', title: 'Newsletters', type: 'label', value: 'Newsletters', color: 'purple' },
    ],
    rules: [
        { tabId: 's7', action: 'trash', daysOld: 30, enabled: true },
        { tabId: 's8', action: 'archive', daysOld: 14, enabled: true },
        { tabId: 's3', action: 'moveToLabel', daysOld: 90, enabled: false, targetLabel: 'Invoices/Paid' },
    ],
    theme: 'light',
    showUnreadCount: true,
    senderIcons: true,
    senderIconsFavicons: false,
    senderIconsDomain: true,
    senderIconsMailbox: 'initial',
};

/**
 * Invented senders. The domains are made up, and website icons stay off, so
 * each chip shows the coloured letter every user sees by default. Two come
 * from mailbox providers, which show the sender's initial instead.
 */
const DEMO_ROWS = [
    { name: 'Ledgerly', email: 'billing@ledgerly.co', subject: 'Invoice INV-2041 is ready', snippet: 'Your invoice for September is attached. Amount due: $1,240.00', date: '10:24' },
    { name: 'Priya Raman', email: 'priya.raman@gmail.com', subject: "Notes from Thursday's call", snippet: 'Thanks for your time. Here is a summary of what we agreed', date: '09:58' },
    { name: 'Northwind Studio', email: 'hello@northwindstudio.com', subject: 'Revised proposal and timeline', snippet: 'We have updated the scope based on your feedback', date: '09:12' },
    { name: 'Skyport Air', email: 'bookings@skyportair.com', subject: 'Your booking is confirmed', snippet: 'Bengaluru to Singapore, 14 October. Check in opens 24 hours before', date: '08:40' },
    { name: 'Harbor Bank', email: 'statements@harborbank.com', subject: 'Your September statement is available', snippet: 'Sign in to view and download your statement', date: '07:05' },
    { name: 'Tomás Ortega', email: 'tomas.ortega@outlook.com', subject: 'Re: contract draft v3', snippet: 'Looks good to me. Two small comments on section 4', date: 'Sep 29' },
    { name: 'Fieldnote', email: 'digest@fieldnote.io', subject: 'Your weekly digest', snippet: 'Five new posts from the writers you follow', date: 'Sep 29' },
    { name: 'Kite Cloud', email: 'alerts@kitecloud.dev', subject: 'Usage alert: 80% of your plan', snippet: 'Your project is close to its monthly limit', date: 'Sep 28' },
    { name: 'Mira Chen', email: 'mira.chen@gmail.com', subject: 'Photos from the offsite', snippet: 'Uploaded the album, have a look when you get a minute', date: 'Sep 28' },
    { name: 'Parcelhub', email: 'orders@parcelhub.com', subject: 'Your order has shipped', snippet: 'Arriving Friday. Track your parcel any time', date: 'Sep 27' },
    { name: 'Ledgerly', email: 'billing@ledgerly.co', subject: 'Payment received, thank you', snippet: 'We have received your payment for INV-2033', date: 'Sep 26' },
    { name: 'Northwind Studio', email: 'hello@northwindstudio.com', subject: 'Kick-off agenda', snippet: 'Here is what we would like to cover on Monday', date: 'Sep 25' },
    { name: 'Openbook', email: 'team@openbook.app', subject: 'Welcome to your new workspace', snippet: 'Three things to try in your first week', date: 'Sep 24' },
    { name: 'Skyport Air', email: 'bookings@skyportair.com', subject: 'Receipt for your flight', snippet: 'Booking reference QX7L2P. Total paid $412.60', date: 'Sep 23' },
    { name: 'Harbor Bank', email: 'alerts@harborbank.com', subject: 'New sign-in to your account', snippet: 'If this was you, there is nothing more to do', date: 'Sep 22' },
];

/** Sidebar label names, in place of the account's own. */
const DEMO_LABELS = ['Clients', 'Invoices', 'Newsletters', 'Projects', 'Receipts', 'Travel'];

/**
 * Anything left that could carry personal content: the header (avatar and
 * account), the side panel and add-ons, and the search suggestions.
 */
const BLUR = `
  header [aria-label^="Google Account"], header img, .gb_A, .gb_B, .gb_Q,
  [role="complementary"], .bq9, .brC-brG, [role="listbox"] { filter: blur(10px) !important; }
`;

// ---------------------------------------------------------------------------
// Browser
// ---------------------------------------------------------------------------

function cloneProfile(src, dst) {
    fs.mkdirSync(path.join(dst, 'Default', 'Network'), { recursive: true });
    if (fs.existsSync(path.join(src, 'Local State'))) fs.copyFileSync(path.join(src, 'Local State'), path.join(dst, 'Local State'));
    for (const f of ['Cookies', 'Preferences', 'Secure Preferences', 'Web Data', 'Network Persistent State']) {
        const p = path.join(src, 'Default', f);
        if (fs.existsSync(p)) fs.copyFileSync(p, path.join(dst, 'Default', f));
    }
    const nd = path.join(src, 'Default', 'Network');
    if (fs.existsSync(nd))
        for (const f of fs.readdirSync(nd)) {
            const p = path.join(nd, f);
            if (fs.statSync(p).isFile()) fs.copyFileSync(p, path.join(dst, 'Default', 'Network', f));
        }
}

const freePort = () =>
    new Promise((r) => {
        const s = net.createServer();
        s.listen(0, '127.0.0.1', () => {
            const p = s.address().port;
            s.close(() => r(p));
        });
    });

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

cloneProfile(SRC, PROFILE);
const port = await freePort();
const proc = spawn('/usr/bin/google-chrome', [
    '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${PROFILE}`, '--disable-sync',
    '--no-first-run', '--no-default-browser-check', `--window-size=${VW},${VH}`, '--hide-scrollbars',
    '--enable-unsafe-extension-debugging', '--force-device-scale-factor=2', 'about:blank',
], { stdio: 'ignore' });

let cleaned = null;
function cleanup() {
    cleaned ??= (async () => {
        try { proc.kill('SIGTERM'); } catch { /* gone */ }
        await wait(1500);
        try { proc.kill('SIGKILL'); } catch { /* gone */ }
        // The copy holds the account's cookies: it never outlives the run.
        fs.rmSync(WORK, { recursive: true, force: true });
    })();
    return cleaned;
}
for (const [signal, code] of [['SIGINT', 130], ['SIGTERM', 143]]) {
    process.once(signal, () => {
        console.error(`\n${signal}: deleting the profile copy`);
        cleanup().finally(() => process.exit(code));
    });
}

// ---------------------------------------------------------------------------
// In-page helpers, run in Gmail's page
// ---------------------------------------------------------------------------

/**
 * Put the demo senders, subjects and dates into the visible rows, and drop
 * everything else a row can show (label chips, attachment chips, participant
 * lists). Returns how many rows still hold text that is not demo text.
 */
function fillDemoInbox(rows) {
    const trs = [...document.querySelectorAll('tr.zA')];
    trs.forEach((tr, i) => {
        const d = rows[i % rows.length];
        const yw = tr.querySelector('.yW');
        if (yw) {
            const first = yw.querySelector('span[email]');
            const holder = first ? [...yw.children].find((c) => c.contains(first)) : null;
            if (holder) {
                yw.replaceChildren(holder);
                // A thread names every participant in one holder ("Ann, Bob");
                // keep only the first, separators included.
                holder.querySelectorAll('span[email]').forEach((e) => e !== first && e.remove());
                const walker = document.createTreeWalker(holder, NodeFilter.SHOW_TEXT);
                const stray = [];
                for (let n = walker.nextNode(); n; n = walker.nextNode()) if (!first.contains(n)) stray.push(n);
                stray.forEach((n) => n.remove());
            }
        }
        tr.querySelectorAll('span[email]').forEach((s) => {
            s.setAttribute('email', d.email);
            s.setAttribute('name', d.name);
            if (s.hasAttribute('data-hovercard-id')) s.setAttribute('data-hovercard-id', d.email);
            s.textContent = d.name;
        });
        tr.querySelectorAll('.afn').forEach((a) => (a.textContent = `${d.name}, ${d.subject}, ${d.date}`));
        const xt = tr.querySelector('.xT');
        const y6 = xt?.querySelector('.y6');
        if (xt && y6) {
            xt.replaceChildren(y6);
            const bog = y6.querySelector('.bog');
            if (bog) bog.textContent = d.subject;
            const y2 = y6.querySelector('.y2');
            if (y2) y2.textContent = ` - ${d.snippet}`;
            else y6.replaceChildren(Object.assign(document.createElement('span'), { className: 'bog', textContent: d.subject }));
        }
        tr.querySelectorAll('.brc, .aKS, .brd, .bq4, .aZo, .ar, .at, .av').forEach((el) => el.remove());
        // The importance marker carries a hidden tooltip ("Important because
        // ..."). Never drawn in a shot, but it is text, and it can name why a
        // real message mattered, so it goes too.
        tr.querySelectorAll('.pG .T-ays-a45, .pG .aol').forEach((el) => el.replaceChildren());
        const date = tr.querySelector('td.xW span');
        if (date) {
            date.textContent = d.date;
            date.setAttribute('title', d.date);
            date.setAttribute('aria-label', d.date);
        }
        tr.setAttribute('aria-label', `${d.name} ${d.subject}`);
    });

    // Every row must read as demo text and nothing else, chips aside.
    const allowed = rows.flatMap((d) => [d.name, d.subject, ` - ${d.snippet}`, d.snippet, d.date, d.email.split('@')[1]]);
    let dirty = 0;
    for (const tr of trs) {
        const clone = tr.cloneNode(true);
        clone.querySelectorAll('.glt-sender-chip, .afn').forEach((c) => c.remove());
        let text = clone.innerText ?? clone.textContent ?? '';
        for (const a of [...allowed].sort((x, y) => y.length - x.length)) text = text.split(a).join(' ');
        if (/[A-Za-z]{3,}/.test(text.replace(/\b(me|Inbox)\b/g, ''))) {
            dirty++;
            if (dirty === 1 && window.__gltDebug) {
                // Where the leftover text sits, never what it says.
                const walker = document.createTreeWalker(clone, NodeFilter.SHOW_TEXT);
                const out = [];
                for (let n = walker.nextNode(); n; n = walker.nextNode()) {
                    let t = n.nodeValue;
                    for (const a of [...allowed].sort((x, y) => y.length - x.length)) t = t.split(a).join(' ');
                    if (/[A-Za-z]{3,}/.test(t.replace(/\b(me|Inbox)\b/g, ''))) {
                        const chain = [];
                        for (let e = n.parentElement; e && e !== clone && chain.length < 4; e = e.parentElement) chain.push(`${e.tagName.toLowerCase()}.${[...e.classList].join('.')}`);
                        out.push(`${chain.join(' < ')} len=${t.trim().length}`);
                    }
                }
                window.__gltDebug.push(...out);
            }
        }
    }
    return dirty;
}

/**
 * Give the sidebar's labels demo names. Only top-level labels are shown, the
 * first few renamed and every other label row hidden, sublabels included.
 * Hiding a parent's sublabels leaves its expand arrow, which reads as a
 * collapsed label, as it would in anyone's sidebar.
 * Returns how many label rows are still visible with a name that is not a
 * demo name, which must be zero before any shot is kept.
 *
 * The label list is not inside Gmail's [role="navigation"] (it was once);
 * each label is an a[href*="#label/"] inside a .aim row, which is what the
 * drift canary watches too.
 */
function fillDemoLabels(names) {
    const links = [...document.querySelectorAll('.aim a[href*="#label/"]')];
    const rowOf = (a) => a.closest('.aim');
    // Sublabels are sibling rows drawn indented, not nested ones, so the
    // top level is the leftmost indent among the rows being drawn.
    const left = (a) => a.getBoundingClientRect().left;
    const drawn = links.filter((a) => a.getClientRects().length > 0);
    const minLeft = Math.min(...drawn.map(left));
    const topLevel = drawn.filter((a) => left(a) - minLeft < 4);
    links.forEach((a) => {
        const i = topLevel.indexOf(a);
        const row = rowOf(a);
        if (i === -1 || i >= names.length) {
            if (row) row.style.display = 'none';
            return;
        }
        const name = names[i];
        a.textContent = name;
        a.setAttribute('title', name);
        a.setAttribute('aria-label', name);
        row.querySelectorAll('[data-tooltip]').forEach((el) => el.setAttribute('data-tooltip', name));
        row.querySelectorAll('[data-label-name]').forEach((el) => el.setAttribute('aria-label', name));
        row.querySelectorAll('.bsU').forEach((el) => (el.textContent = i === 0 ? '4' : i === 1 ? '2' : ''));
    });
    return links.filter((a) => a.getClientRects().length > 0 && !names.includes(a.textContent.trim())).length;
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

let browser = null;
try {
    for (let i = 0; i < 80 && !browser; i++) {
        try {
            browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
        } catch {
            await wait(250);
        }
    }
    if (!browser) throw new Error('Chrome did not start');
    const session = await browser.newBrowserCDPSession();
    const { id: extId } = await session.send('Extensions.loadUnpacked', { path: DIST });
    const ctx = browser.contexts()[0];
    let sw = null;
    for (let i = 0; i < 40 && !sw; i++) {
        sw = ctx.serviceWorkers().find((w) => w.url().startsWith(`chrome-extension://${extId}/`));
        if (!sw) await wait(250);
    }
    if (!sw) throw new Error('the extension did not start');
    // Storage is reached through one of the extension's own pages rather than
    // the service worker, which Chrome may restart under a caller at any time.
    const store = await ctx.newPage();
    await store.goto(`chrome-extension://${extId}/popup.html`, { waitUntil: 'domcontentloaded' });
    await store.evaluate(() => chrome.storage.local.set({ pendingOnboarding: false, globalTheme: 'light' }));

    const page = await ctx.newPage();
    await page.setViewportSize({ width: VW, height: VH });
    const gmail = async () => {
        // Gmail sometimes cancels the first navigation with one of its own
        // redirects; what matters is where the page ends up.
        await page.goto(gmailUrl(ACCOUNT), { waitUntil: 'commit', timeout: 90000 }).catch((e) => {
            if (!/ERR_ABORTED/.test(String(e))) throw new Error(String(e).replace(/authuser=[^&#\s"]*/g, 'authuser=…'));
        });
        await page.waitForSelector('tr.zA', { state: 'visible', timeout: 90000 });
        const seen = await page.evaluate(() => ({
            title: document.title,
            g10: (window.GLOBALS && typeof window.GLOBALS[10] === 'string' && window.GLOBALS[10]) || null,
        }));
        if (!isExpectedAccount(ACCOUNT, observedAccount(seen.title, seen.g10))) {
            throw new Error('Gmail opened a different account than the one asked for; is it signed in to this profile?');
        }
        await page.addStyleTag({ content: BLUR });
        await page.waitForSelector('.gmail-tabs-bar .gmail-tab', { timeout: 30000 });
    };
    await gmail();

    // The demo tabs go into whichever account the content script registered,
    // with sender icons off for now: they are switched on after the rows hold
    // demo senders, so no chip is ever drawn from a real one.
    const accounts = await store.evaluate(async (tabs) => {
        const all = await chrome.storage.sync.get(null);
        const keys = Object.keys(all).filter((k) => k.startsWith('account_'));
        for (const k of keys) {
            await chrome.storage.sync.set({ [k]: { ...all[k], tabs, rules: [], senderIcons: false } });
        }
        return keys.length;
    }, DEMO_TABS);
    if (!accounts) throw new Error('no account registered; is the profile signed in to Gmail?');
    await gmail();
    await wait(4000);

    const setSenderIcons = (on) =>
        store.evaluate(async (enabled) => {
            const all = await chrome.storage.sync.get(null);
            for (const k of Object.keys(all).filter((k) => k.startsWith('account_') && !k.endsWith('demo@palworks.ai'))) {
                await chrome.storage.sync.set({
                    [k]: { ...all[k], senderIcons: enabled, senderIconsFavicons: false, senderIconsDomain: true, senderIconsMailbox: 'initial' },
                });
            }
        }, on);

    const dress = async () => {
        const realLabels = await page.evaluate(fillDemoLabels, DEMO_LABELS);
        if (realLabels) throw new Error(`${realLabels} sidebar label(s) still show a name that is not a demo name`);
        const labels = await page.evaluate(() => document.querySelectorAll('.aim a[href*="#label/"]').length);
        if (process.env.GLT_DEBUG) await page.evaluate(() => (window.__gltDebug = []));
        const dirty = await page.evaluate(fillDemoInbox, DEMO_ROWS);
        if (process.env.GLT_DEBUG) console.log((await page.evaluate(() => window.__gltDebug)).join('\n'));
        if (dirty) throw new Error(`${dirty} inbox row(s) still show something other than demo text`);
        return labels;
    };

    // 1. The bar over the inbox, and 2. the sender chips.
    const labelCount = await dress();
    if (labelCount < 3) console.warn(`only ${labelCount} labels in the sidebar; the label menu shot needs one`);
    await setSenderIcons(true);
    await page.waitForSelector('.glt-sender-chip', { timeout: 15000 });
    await wait(1500);
    // Gmail redraws the top rows on its own; dress again after the chips land,
    // then check once more before the shutter.
    if (await page.evaluate(fillDemoInbox, DEMO_ROWS)) throw new Error('a row changed back to real content');
    await wait(900);
    if (await page.evaluate(fillDemoInbox, DEMO_ROWS)) throw new Error('a row changed back to real content');

    if (PROBE) {
        await page.screenshot({ path: path.join(WORK, '..', 'glt-probe.png') });
        console.log('probe written to', path.join(WORK, '..', 'glt-probe.png'));
    }

    const box = async (sel) => {
        const b = await page.locator(sel).first().boundingBox();
        if (!b) throw new Error(`nothing to frame: ${sel}`);
        return b;
    };
    const bar = await box('.gmail-tabs-bar');
    const nav = await box('[role="navigation"]');
    const list = await box('tr.zA');

    // Hero: the sidebar's edge, the bar, the category tabs and the first rows.
    const heroX = Math.max(0, nav.x + nav.width - 190);
    await page.screenshot({
        path: path.join(RAW, 'listing-hero.png'),
        clip: { x: heroX, y: bar.y - 62, width: Math.min(VW - heroX, 1180), height: 700 },
    });

    // Sender chips: the sender column and the start of each subject, enlarged.
    await page.screenshot({
        path: path.join(RAW, 'listing-senders.png'),
        clip: { x: list.x, y: list.y - 6, width: 820, height: 470 },
    });
    console.log('captured the bar and the sender chips');

    // 3. "Show as Tabs" in Gmail's own label menu. Gmail shows a label's
    // three-dot trigger only under a real pointer, and headless Chrome raises
    // that hover a few times in ten, so this retries.
    // Taller than the other shots: Gmail's label menu is about 420 pixels and
    // opens below the label, and a clip cannot reach past the viewport.
    await page.setViewportSize({ width: VW, height: 1300 });
    await wait(1500);
    let menuShot = false;
    for (let attempt = 0; attempt < 12 && !menuShot; attempt++) {
        await page.keyboard.press('Escape');
        await dress();
        // Only the renamed, visible labels: a hidden row has no pointer target.
        const boxes = await page.evaluate(() =>
            [...document.querySelectorAll('.aim a[href*="#label/"]')]
                .map((a) => a.getBoundingClientRect())
                .filter((r) => r.width > 0 && r.height > 0)
                .map((r) => ({ x: r.x, y: r.y, width: r.width, height: r.height }))
        );
        if (!boxes.length) throw new Error('no visible label to open a menu on');
        const lb = boxes[attempt % Math.min(3, boxes.length)];
        // Start from the message list, never the corner: a pointer gliding
        // from (0, 0) crosses the Chat button on the left rail, and Chat's
        // hover panel then covers the sidebar with real contacts' names and
        // photos. The guard below refuses such a shot anyway.
        await page.mouse.move(VW / 2, VH - 40);
        await wait(400);
        await page.mouse.move(lb.x + 20, lb.y + lb.height / 2, { steps: 6 });
        await wait(700);
        // The label's menu trigger is the [data-label-name] button in its row.
        // A real pointer press when Gmail has drawn it; otherwise the same
        // event sequence the drift canary opens it with, which Gmail answers
        // whether or not it has drawn the button under a hover yet.
        const trigger = await page.evaluate((y) => {
            const row = [...document.querySelectorAll('.aim')].find((r) => {
                const a = r.querySelector('a[href*="#label/"]');
                const b = a?.getBoundingClientRect();
                return b && b.width > 0 && Math.abs(b.top + b.height / 2 - y) < 14;
            });
            const t = row?.querySelector('[data-label-name]');
            if (!t) return null;
            const r = t.getBoundingClientRect();
            return { drawn: r.width > 0 && r.height > 0, x: r.x + r.width / 2, y: r.y + r.height / 2 };
        }, lb.y + lb.height / 2);
        if (!trigger) continue;
        if (trigger.drawn) {
            await page.mouse.move(trigger.x, trigger.y, { steps: 4 });
            await wait(300);
            await page.mouse.down();
            await page.mouse.up();
        } else {
            await page.evaluate((y) => {
                const row = [...document.querySelectorAll('.aim')].find((r) => {
                    const b = r.querySelector('a[href*="#label/"]')?.getBoundingClientRect();
                    return b && b.width > 0 && Math.abs(b.top + b.height / 2 - y) < 14;
                });
                const t = row.querySelector('[data-label-name]');
                for (const type of ['mousedown', 'mouseup', 'click']) {
                    t.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window, button: 0 }));
                }
            }, lb.y + lb.height / 2);
        }
        try {
            await page.waitForSelector('#glt-show-as-tabs', { state: 'visible', timeout: 12000 });
        } catch {
            continue;
        }
        // Park the pointer on our item, as a person reading it would.
        const item = await box('#glt-show-as-tabs');
        await page.mouse.move(item.x + 40, item.y + item.height / 2, { steps: 5 });
        await wait(700);
        const menu = await page.evaluate(() => {
            const r = document.getElementById('glt-show-as-tabs').closest('[role="menu"]').getBoundingClientRect();
            return { x: r.x, y: r.y, width: r.width, height: r.height };
        });
        // Nothing may sit over the sidebar but our menu: every sampled point
        // in the label column must land in the sidebar itself or the menu.
        // A hover panel (Chat, Meet) or a tooltip would carry real content.
        const covered = await page.evaluate(({ top, bottom }) => {
            const first = document.querySelector('.aim');
            let side = first;
            for (let e = first; e; e = e.parentElement) if (e.getBoundingClientRect().width <= 320) side = e;
            const menuEl = document.getElementById('glt-show-as-tabs').closest('[role="menu"]');
            const sr = side.getBoundingClientRect();
            let bad = 0;
            for (let y = Math.max(top, sr.top + 4); y < Math.min(bottom, sr.bottom - 4); y += 24) {
                for (const x of [sr.left + 30, sr.left + sr.width / 2, sr.right - 30]) {
                    const hit = document.elementFromPoint(x, y);
                    if (hit && !side.contains(hit) && !menuEl.contains(hit)) bad++;
                }
            }
            return bad;
        }, { top: Math.min(menu.y, lb.y) - 90, bottom: menu.y + menu.height + 40 });
        if (covered) {
            console.warn(`something other than the sidebar and our menu covers ${covered} sampled point(s); retrying`);
            continue;
        }
        // From the label's row down to the end of the menu, where our item
        // is, at the frame's own shape (1136 by 508), so the whole menu shows
        // unscaled and nothing that matters falls below the frame's edge.
        const y = Math.max(0, lb.y - 30);
        const height = Math.ceil(menu.y + menu.height + 16 - y);
        const x = Math.max(0, Math.floor(lb.x - 70));
        const width = Math.min(VW - x, Math.ceil(height * 2.2));
        await page.screenshot({ path: path.join(RAW, 'listing-labelmenu.png'), clip: { x, y, width, height } });
        menuShot = true;
    }
    if (!menuShot) throw new Error('could not open a label menu with the pointer; run again');
    console.log('captured the label menu');
    await page.keyboard.press('Escape');

    // 4 and 5. The options pages, against a demo account shown in the picker.
    await store.evaluate(async ([k, v]) => chrome.storage.sync.set({ [k]: v }), [`account_${DEMO_ACCOUNT}`, DEMO_OPTIONS_SETTINGS]);
    const opts = await ctx.newPage();
    await opts.setViewportSize({ width: VW, height: VH });
    for (const [hash, file] of [['#rules', 'listing-rules.png'], ['#privacy', 'listing-privacy.png']]) {
        await opts.goto(`chrome-extension://${extId}/options.html${hash}`, { waitUntil: 'domcontentloaded' });
        await wait(1500);
        await opts.evaluate((demo) => {
            const sel = document.getElementById('account-select');
            if (sel && [...sel.options].some((o) => o.value === demo)) {
                sel.value = demo;
                sel.dispatchEvent(new Event('change'));
            }
        }, DEMO_ACCOUNT);
        await wait(1500);
        const shown = await opts.evaluate(() => document.getElementById('account-select')?.selectedOptions[0]?.value ?? '');
        if (shown !== DEMO_ACCOUNT) throw new Error(`the options page shows an account other than the demo one (${file})`);
        // The picker lists every account; closed, it shows only the demo one.
        await opts.screenshot({ path: path.join(RAW, file) });
    }
    console.log('captured the options pages');
} finally {
    await cleanup();
}

// ---------------------------------------------------------------------------
// Compose
// ---------------------------------------------------------------------------

const composer = await chromium.launch();
const cpage = await composer.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
const LOGO = `file://${ROOT}/src/icons/icon128.png`;
const raw = (f) => `file://${RAW}/${f}`;

/**
 * Upload order. The store has no caption field, so each image carries its own
 * headline; the strings are also recorded in STORE_LISTING.md section 4.
 */
const SCREENSHOTS = [
    {
        file: 'screenshot-1-tabs-in-gmail.png', img: 'listing-hero.png', kicker: 'Tabs',
        head: ['Your Gmail labels and searches, ', 'as tabs.'],
        sub: 'Every view you use all day, one click away, with live unread counts.',
    },
    {
        file: 'screenshot-2-sender-icons.png', img: 'listing-senders.png', kicker: 'Sender icons', zoom: 1.35,
        head: ['See who every email is ', 'from.'],
        sub: "An optional chip names the sender's organisation. Off until you turn it on.",
    },
    {
        file: 'screenshot-3-label-menu.png', img: 'listing-labelmenu.png', kicker: 'From Gmail itself',
        head: ['Add any label from ', "Gmail's own menu."],
        sub: 'Its three-dot menu now ends with Show as Tabs. Sublabels work too.',
    },
    {
        file: 'screenshot-4-cleanup-rules.png', img: 'listing-rules.png', kicker: 'Cleanup rules',
        head: ['Cleanup that runs in ', 'your own account.'],
        sub: 'Starter templates write a Google Apps Script you can read, schedule and stop.',
    },
    {
        file: 'screenshot-5-privacy.png', img: 'listing-privacy.png', kicker: 'Privacy',
        head: ['No analytics. No account. ', 'No tracking.'],
        sub: 'Message content is never read, stored or sent. The whole policy is inside the extension.',
    },
];

for (const shot of SCREENSHOTS) {
    await cpage.goto(`file://${HERE}/frame.html`);
    await cpage.evaluate((s) => {
        document.getElementById('logo').src = s.logo;
        document.getElementById('kicker').textContent = s.kicker;
        const h = document.getElementById('headline');
        h.textContent = s.head[0];
        const em = document.createElement('em');
        em.textContent = s.head[1];
        h.append(em);
        document.getElementById('sub').textContent = s.sub;
        const img = document.getElementById('shot');
        img.src = s.img;
        if (s.zoom) img.style.width = `${Math.round(1136 * s.zoom)}px`;
    }, { ...shot, img: raw(shot.img), logo: LOGO });
    await cpage.evaluate(() => document.fonts.ready);
    await cpage.waitForFunction(() => document.getElementById('shot').complete);
    await wait(300);
    const gap = await cpage.evaluate(() => {
        const f = document.querySelector('.shot').getBoundingClientRect();
        const i = document.getElementById('shot').getBoundingClientRect();
        return { bottom: Math.round(f.bottom - i.bottom), right: Math.round(f.right - i.right) };
    });
    if (gap.bottom > 0 || gap.right > 0) throw new Error(`${shot.file}: the capture leaves a blank band (${JSON.stringify(gap)})`);
    await cpage.screenshot({ path: path.join(OUT, shot.file) });
    console.log('composed', shot.file);
}

await cpage.setViewportSize({ width: 1400, height: 900 });
await cpage.goto(`file://${HERE}/tiles.html`);
await cpage.evaluate(([logo, bar]) => {
    document.querySelectorAll('.logo').forEach((i) => (i.src = logo));
    document.querySelectorAll('.shot').forEach((i) => (i.src = bar));
}, [LOGO, raw('listing-hero.png')]);
await cpage.evaluate(() => document.fonts.ready);
await wait(400);
await (await cpage.$('#marquee')).screenshot({ path: path.join(OUT, 'promo-marquee-1400x560.png') });
await (await cpage.$('#small')).screenshot({ path: path.join(OUT, 'promo-small-440x280.png') });
console.log('composed the promo tiles');
await composer.close();

// Every asset at the exact size the store expects.
const EXPECTED = {
    'promo-marquee-1400x560.png': [1400, 560],
    'promo-small-440x280.png': [440, 280],
    ...Object.fromEntries(SCREENSHOTS.map((s) => [s.file, [1280, 800]])),
};
let bad = 0;
for (const [file, [w, h]] of Object.entries(EXPECTED)) {
    const buf = fs.readFileSync(path.join(OUT, file));
    const [width, height] = [buf.readUInt32BE(16), buf.readUInt32BE(20)];
    if (width !== w || height !== h) {
        console.error(`WRONG SIZE ${file}: ${width}x${height}, expected ${w}x${h}`);
        bad++;
    }
}
console.log(bad ? `${bad} asset problem(s)` : 'All assets present and correctly sized.');
process.exit(bad ? 1 : 0);
