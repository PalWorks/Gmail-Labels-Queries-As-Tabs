/**
 * record-video.mjs: the product video, recorded from the real extension in a
 * real Gmail.
 *
 * Like build.mjs, nothing here is mocked. The extension is loaded unpacked
 * into a throwaway copy of a signed-in Chrome profile, seeded with demo tabs,
 * and driven the way a person would: typing a search, pressing +, choosing a
 * colour, dragging a tab. The throwaway profile runs with sync off and is
 * deleted afterwards, so the real account's settings are never touched.
 *
 * Privacy: before the first frame, every place Gmail shows personal content
 * is blurred (message rows, the label sidebar, the account avatar, the side
 * panel, and the search box's suggestions, which list real subjects), the
 * options pages' account picker is blurred, and the tab bar is seeded with
 * demo tabs. Check the result anyway:
 * a frame that leaks a name cannot be unpublished from YouTube.
 *
 * Each scene is recorded with the DevTools screencast and cut into a clip;
 * ffmpeg joins them into one 1920x1080, 30 fps H.264 file.
 *
 *   NODE_PATH=$(npm root -g) node scripts/store-assets/record-video.mjs [--profile <dir>] [--out <dir>]
 *
 * Needs a global Playwright and ffmpeg. Output: store-assets/video/.
 */

import { createRequire } from 'node:module';
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const arg = (n, d) => {
    const i = process.argv.indexOf(n);
    return i !== -1 ? process.argv[i + 1] : d;
};
const SRC = arg('--profile', path.join(os.homedir(), '.config/antigravity-chrome-profile'));
const OUT = path.resolve(arg('--out', path.join(ROOT, 'store-assets', 'video')));
const DIST = path.join(ROOT, 'dist');
const W = 1920;
const H = 1080;

fs.mkdirSync(OUT, { recursive: true });
const WORK = fs.mkdtempSync(path.join(os.tmpdir(), 'glt-video-'));
const PROFILE = path.join(WORK, 'profile');

// ---------------------------------------------------------------------------
// Demo setup
// ---------------------------------------------------------------------------

/** Demo tabs. The views are Gmail's own, so they have real content behind them. */
const DEMO_TABS = [
    { id: 'v1', title: 'Inbox', type: 'hash', value: '#inbox' },
    { id: 'v2', title: 'Clients', type: 'label', value: 'Clients', color: 'blue' },
    { id: 'v3', title: 'Invoices', type: 'label', value: 'Invoices', color: 'green' },
    { id: 'v4', title: 'Starred', type: 'hash', value: '#starred', color: 'orange' },
    { id: 'v5', title: 'Unread', type: 'hash', value: '#search/is%3Aunread' },
];

const BLUR = `
  tr.zA, .aeN, .aim, .byl, .bq9, .brC-brG, [role="complementary"],
  a[aria-label^="Google Account"], img.gb_Q, .gb_A, .gb_B,
  [role="listbox"], [role="option"] { filter: blur(9px) !important; }

`;

/** The extension's own pages name the signed-in account in the account picker. */
const BLUR_OPTIONS = `#account-select { filter: blur(8px) !important; }`;

/** The caption and the pointer, drawn into the page so the screencast records them. */
const OVERLAY = `
  #glt-cap { position: fixed; left: 50%; bottom: 56px; transform: translate(-50%, 16px); z-index: 2147483647;
    max-width: 1320px; padding: 20px 34px; border-radius: 16px; background: rgba(14, 23, 38, 0.94); color: #fff;
    font: 600 34px/1.25 'Hanken Grotesk', 'Google Sans', Arial, sans-serif; letter-spacing: -0.01em; text-align: center;
    box-shadow: 0 18px 50px rgba(0,0,0,.35); opacity: 0; transition: opacity .35s ease, transform .35s ease; pointer-events: none; }
  #glt-cap.on { opacity: 1; transform: translate(-50%, 0); }
  #glt-cap code { font: 500 30px 'Martian Mono', ui-monospace, monospace; color: #9cc3ff; }
  #glt-ptr { position: fixed; z-index: 2147483647; width: 26px; height: 26px; margin: -4px 0 0 -4px; pointer-events: none;
    background: no-repeat url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M4 2l16 10-7 1.5 4 7.5-3 1.5-4-7.5L4 20z' fill='%23111' stroke='%23fff' stroke-width='1.5'/%3E%3C/svg%3E");
    transition: transform .08s; }
  #glt-ptr.down { transform: scale(.85); }
`;

async function installOverlay(page) {
    await page.addStyleTag({ content: OVERLAY });
    await page.evaluate(() => {
        if (document.getElementById('glt-ptr')) return;
        const cap = document.createElement('div');
        cap.id = 'glt-cap';
        const ptr = document.createElement('div');
        ptr.id = 'glt-ptr';
        ptr.style.left = '-50px';
        document.documentElement.append(cap, ptr);
        addEventListener('mousemove', (e) => {
            ptr.style.left = e.clientX + 'px';
            ptr.style.top = e.clientY + 'px';
        }, true);
        addEventListener('mousedown', () => ptr.classList.add('down'), true);
        addEventListener('mouseup', () => ptr.classList.remove('down'), true);
    });
}

async function caption(page, html) {
    await page.evaluate((h) => {
        const el = document.getElementById('glt-cap');
        if (!el) return;
        if (!h) {
            el.classList.remove('on');
            return;
        }
        // Gmail enforces Trusted Types, so no innerHTML: <code> runs become elements.
        el.replaceChildren();
        h.split(/<code>(.*?)<\/code>/).forEach((part, i) => {
            if (i % 2) {
                const c = document.createElement('code');
                c.textContent = part;
                el.append(c);
            } else if (part) el.append(document.createTextNode(part));
        });
        el.classList.add('on');
    }, html);
}

// ---------------------------------------------------------------------------
// Recording
// ---------------------------------------------------------------------------

let clipIndex = 0;
const clips = [];

/** Record whatever `fn` does to `page` as one clip. */
async function scene(page, name, fn) {
    const dir = path.join(WORK, `frames-${String(++clipIndex).padStart(2, '0')}`);
    fs.mkdirSync(dir);
    const cdp = await page.context().newCDPSession(page);
    const frames = [];
    cdp.on('Page.screencastFrame', async (f) => {
        const file = path.join(dir, `${String(frames.length).padStart(5, '0')}.jpg`);
        fs.writeFileSync(file, Buffer.from(f.data, 'base64'));
        frames.push({ file, t: f.metadata.timestamp });
        try {
            await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId });
        } catch {
            /* the session is closing */
        }
    });
    await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: W, maxHeight: H, everyNthFrame: 1 });
    const started = Date.now() / 1000;
    await fn();
    const ended = Date.now() / 1000;
    await cdp.send('Page.stopScreencast');
    await cdp.detach();
    if (frames.length === 0) throw new Error(`scene ${name}: no frames`);

    // Each frame lasts until the next one; the last until the scene ended.
    const list = frames.map((f, i) => {
        const next = i + 1 < frames.length ? frames[i + 1].t : Math.max(ended, f.t + 0.04);
        return `file '${f.file}'\nduration ${Math.max(0.001, next - f.t).toFixed(3)}`;
    });
    const lead = Math.max(0, frames[0].t - started);
    const concat = path.join(dir, 'list.txt');
    fs.writeFileSync(concat, list.join('\n') + `\nfile '${frames[frames.length - 1].file}'\n`);
    const clip = path.join(WORK, `clip-${String(clipIndex).padStart(2, '0')}.mp4`);
    execFileSync('ffmpeg', [
        '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', concat,
        '-vf', `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=white,fps=30,format=yuv420p`,
        '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', clip,
    ]);
    clips.push(clip);
    console.log(`scene ${name}: ${frames.length} frames, ${(ended - started).toFixed(1)} s (lead ${lead.toFixed(2)} s)`);
}

const wait = (page, ms) => page.waitForTimeout(ms);

/** Move the pointer in steps, as a hand would, then act. */
async function moveTo(page, locator, { dx = 0, dy = 0 } = {}) {
    const box = await locator.boundingBox();
    if (!box) throw new Error('target not visible');
    await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy, { steps: 22 });
    return box;
}

async function clickOn(page, locator, opts) {
    await moveTo(page, locator, opts);
    await wait(page, 180);
    await page.mouse.down();
    await wait(page, 90);
    await page.mouse.up();
}

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

cloneProfile(SRC, PROFILE);
const port = await freePort();
const proc = spawn('/usr/bin/google-chrome', [
    '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${PROFILE}`, '--disable-sync',
    '--no-first-run', '--no-default-browser-check', `--window-size=${W},${H}`, '--hide-scrollbars',
    '--enable-unsafe-extension-debugging', '--force-device-scale-factor=1', 'about:blank',
], { stdio: 'ignore' });

async function cleanup() {
    try { proc.kill('SIGTERM'); } catch { /* gone */ }
    await new Promise((r) => setTimeout(r, 1500));
    try { proc.kill('SIGKILL'); } catch { /* gone */ }
    // The copy holds the account's cookies: it never outlives the run.
    fs.rmSync(WORK, { recursive: true, force: true });
}

let browser = null;
try {
    for (let i = 0; i < 80 && !browser; i++) {
        try {
            browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
        } catch {
            await new Promise((r) => setTimeout(r, 250));
        }
    }
    if (!browser) throw new Error('Chrome did not start');
    const session = await browser.newBrowserCDPSession();
    const { id: extId } = await session.send('Extensions.loadUnpacked', { path: DIST });
    const ctx = browser.contexts()[0];
    let sw = null;
    for (let i = 0; i < 40 && !sw; i++) {
        sw = ctx.serviceWorkers().find((w) => w.url().startsWith(`chrome-extension://${extId}/`));
        if (!sw) await new Promise((r) => setTimeout(r, 250));
    }
    if (!sw) throw new Error('the extension did not start');
    // No tour on first load: the video opens it on purpose, later.
    await sw.evaluate(() => chrome.storage.local.set({ pendingOnboarding: false, globalTheme: 'light' }));

    const page = await ctx.newPage();
    await page.setViewportSize({ width: W, height: H });
    const gmail = async () => {
        await page.goto('https://mail.google.com/mail/u/0/#inbox', { waitUntil: 'commit', timeout: 90000 });
        await page.waitForSelector('tr[role=row]', { state: 'visible', timeout: 90000 });
        await page.addStyleTag({ content: BLUR });
        await page.waitForSelector('.gmail-tabs-bar .gmail-tab', { timeout: 30000 });
    };
    await gmail();

    // Seed the demo tabs into whichever account the content script registered.
    await sw.evaluate(async (tabs) => {
        const all = await chrome.storage.sync.get(null);
        for (const k of Object.keys(all).filter((k) => k.startsWith('account_'))) {
            await chrome.storage.sync.set({ [k]: { ...all[k], tabs, rules: [] } });
        }
    }, DEMO_TABS);
    await gmail();
    await page.addStyleTag({ content: BLUR });
    await installOverlay(page);
    await wait(page, 3500);

    if (process.argv.includes('--probe')) {
        // A still of the opening frame, to check the blur before recording anything.
        await page.screenshot({ path: path.join(OUT, 'probe.png') });
        console.log('wrote', path.join(OUT, 'probe.png'));
        throw new Error('probe only');
    }

    const bar = page.locator('.gmail-tabs-bar');
    const tab = (title) => bar.locator('.gmail-tab', { hasText: title }).first();

    // 1. The bar
    await scene(page, 'bar', async () => {
        await page.mouse.move(W * 0.62, H * 0.55);
        await wait(page, 600);
        await caption(page, 'Your Gmail labels and searches, as tabs above the inbox');
        for (const t of ['Clients', 'Invoices', 'Starred', 'Unread']) {
            await moveTo(page, tab(t).locator('.tab-name'));
            await wait(page, 550);
        }
        await wait(page, 700);
        await caption(page, 'One click opens the view');
        await clickOn(page, tab('Starred').locator('.tab-name'));
        await wait(page, 2400);
        await clickOn(page, tab('Inbox').locator('.tab-name'));
        await wait(page, 1800);
        await caption(page, '');
        await wait(page, 400);
    });

    // 2. A search becomes a tab
    const query = 'has:attachment newer_than:30d';
    await scene(page, 'search', async () => {
        await caption(page, 'Run any Gmail search...');
        const box = page.locator('input[name="q"]').first();
        await clickOn(page, box);
        await wait(page, 300);
        await page.keyboard.type(query, { delay: 70 });
        await wait(page, 500);
        await page.keyboard.press('Enter');
        await page.waitForFunction(() => location.hash.startsWith('#search/'), null, { timeout: 15000 });
        await wait(page, 2200);
        await caption(page, '...press <code>+</code> on the bar, and it stays');
        await clickOn(page, bar.locator('.save-view-btn'));
        await page.waitForSelector('#pin-title', { timeout: 10000 });
        await wait(page, 900);
        const title = page.locator('#pin-title');
        await clickOn(page, title);
        await page.keyboard.press('Control+A');
        await page.keyboard.type('Recent files', { delay: 80 });
        await wait(page, 500);
        await clickOn(page, page.locator('#pin-save-btn'));
        await page.waitForSelector('.gmail-tabs-bar .gmail-tab:has-text("Recent files")', { timeout: 10000 });
        await wait(page, 2200);
        await caption(page, '');
        await wait(page, 400);
    });

    // 3. A colour
    await scene(page, 'colour', async () => {
        await caption(page, 'Give the views that matter a colour');
        await clickOn(page, tab('Recent files').locator('.gmail-tab-menu-btn'));
        await wait(page, 700);
        await clickOn(page, page.locator('.gmail-tab-dropdown-item', { hasText: 'Edit Tab' }));
        await page.waitForSelector('#edit-save-btn', { timeout: 10000 });
        await wait(page, 700);
        await clickOn(page, page.locator('.color-swatch[aria-label="Teal"]').first());
        await wait(page, 700);
        await clickOn(page, page.locator('#edit-save-btn'));
        await wait(page, 2000);
        await caption(page, '');
        await wait(page, 400);
    });

    // 4. Reorder
    await scene(page, 'reorder', async () => {
        await caption(page, 'Drag tabs into the order you work');
        await clickOn(page, tab('Recent files').locator('.gmail-tab-menu-btn'));
        await wait(page, 600);
        await clickOn(page, page.locator('.gmail-tab-dropdown-item', { hasText: /Move|Reorder/ }));
        await wait(page, 900);
        const from = tab('Recent files');
        const to = tab('Clients');
        await moveTo(page, from);
        await wait(page, 300);
        await from.dragTo(to, { steps: 25 });
        await wait(page, 1200);
        const done = page.locator('.done-btn');
        if (await done.count()) await clickOn(page, done);
        await wait(page, 1800);
        await caption(page, '');
        await wait(page, 400);
    });

    // 5. The tour
    await scene(page, 'tour', async () => {
        const opt = await ctx.newPage();
        await opt.goto(`chrome-extension://${extId}/options.html`, { waitUntil: 'domcontentloaded' });
        await opt.evaluate(() => new Promise((r) => chrome.tabs.query({ url: 'https://mail.google.com/*' }, (t) => chrome.tabs.sendMessage(t[t.length - 1].id, { action: 'SHOW_ONBOARDING' }, () => r()))));
        await opt.close();
        await page.bringToFront();
        await page.waitForSelector('#gmail-labels-onboarding', { timeout: 10000 });
        await caption(page, 'A one-minute tour shows you everything');
        await wait(page, 3800);
        for (let i = 0; i < 3; i++) {
            await clickOn(page, page.locator('.glt-ob-next'));
            await wait(page, 3400);
        }
        await caption(page, '');
        await wait(page, 400);
    });

    // 6. Cleanup rules and privacy, on the extension's own pages
    const opt = await ctx.newPage();
    await opt.setViewportSize({ width: W, height: H });
    await opt.goto(`chrome-extension://${extId}/options.html#rules`, { waitUntil: 'domcontentloaded' });
    await opt.addStyleTag({ content: BLUR_OPTIONS });
    await wait(opt, 2500);
    await installOverlay(opt);
    await scene(opt, 'rules', async () => {
        await caption(opt, 'Cleanup rules that run in your own Google account');
        await opt.mouse.move(W * 0.5, H * 0.45, { steps: 20 });
        await wait(opt, 4200);
        await caption(opt, '');
        await wait(opt, 300);
    });
    await opt.goto(`chrome-extension://${extId}/options.html#privacy`, { waitUntil: 'domcontentloaded' });
    await opt.addStyleTag({ content: BLUR_OPTIONS });
    await wait(opt, 2000);
    await installOverlay(opt);
    await scene(opt, 'privacy', async () => {
        await caption(opt, 'No analytics. Your mail never leaves your browser.');
        await wait(opt, 4200);
        await caption(opt, '');
        await wait(opt, 300);
    });

    // 7. Title and end cards, drawn from cards.html
    const card = await ctx.newPage();
    await card.setViewportSize({ width: W, height: H });
    for (const which of ['title', 'end']) {
        await card.goto(`file://${HERE}/cards.html?${which}`, { waitUntil: 'networkidle' });
        await wait(card, 400);
        await scene(card, which, async () => {
            await card.evaluate(() => document.body.classList.add('go'));
            await wait(card, which === 'title' ? 3600 : 4600);
        });
    }

    // Title first, end last.
    const order = [clips.at(-2), ...clips.slice(0, -2), clips.at(-1)];
    const list = path.join(WORK, 'clips.txt');
    fs.writeFileSync(list, order.map((c) => `file '${c}'`).join('\n') + '\n');
    const final = path.join(OUT, 'gmail-labels-as-tabs-demo-1080p.mp4');
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-movflags', '+faststart', final]);
    console.log('wrote', final);
} catch (err) {
    console.error('record-video failed:', err.message);
    process.exitCode = 1;
} finally {
    await cleanup();
}
