/**
 * build.mjs — regenerate the Chrome Web Store assets.
 *
 * Captures the real extension UI and composes it into the exact sizes the
 * store requires. Everything here is a real screenshot: no mocked Gmail, no
 * invented labels in the product surface.
 *
 * Privacy: the Gmail captures blur the message list, the label sidebar and the
 * header before the shot is taken, so no real subject, sender or address ever
 * reaches an asset. The tab bar itself stays sharp, and it is seeded with demo
 * labels so even the tab names are not the user's own. The account's real
 * settings are backed up and restored afterwards.
 *
 * Usage:
 *   1. Start Chrome with remote debugging and sign in to Gmail:
 *        google-chrome --remote-debugging-port=9222
 *   2. Load dist/ as an unpacked extension and copy its id.
 *   3. NODE_PATH=$(npm root -g) node scripts/store-assets/build.mjs <extension-id> [port] [gmail-account]
 *
 * Needs a global Playwright (npm i -g playwright); it is not a project
 * dependency because this is a release-time tool, not part of `npm test`.
 */

import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let chromium;
try {
    ({ chromium } = require('playwright'));
} catch {
    console.error('Playwright not found. npm i -g playwright, then run with NODE_PATH=$(npm root -g).');
    process.exit(2);
}

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const OUT = resolve(ROOT, 'store-assets');
const RAW = resolve(OUT, 'raw');

const EXTENSION_ID = process.argv[2];
const PORT = process.argv[3] || '9222';
const GMAIL_ACCOUNT = process.argv[4] || null; // e.g. you@gmail.com, for the Gmail captures

if (!EXTENSION_ID) {
    console.error('Usage: node scripts/store-assets/build.mjs <extension-id> [port] [gmail-account]');
    process.exit(1);
}

mkdirSync(RAW, { recursive: true });

const DEMO_KEY = 'account_demo@palworks.ai';
const DEMO_TABS = [
    { id: 't1', title: 'Inbox', type: 'hash', value: '#inbox' },
    { id: 't2', title: 'Clients', type: 'label', value: 'Clients', color: 'blue' },
    { id: 't3', title: 'Invoices', type: 'label', value: 'Invoices', color: 'green' },
    { id: 't4', title: 'Newsletters', type: 'label', value: 'Newsletters', color: 'orange' },
    { id: 't5', title: 'Unread from team', type: 'hash', value: '#search/is%3Aunread' },
];
const DEMO_SETTINGS = {
    tabs: DEMO_TABS,
    rules: [
        { tabId: 't4', action: 'archive', daysOld: 14, enabled: true },
        { tabId: 't3', action: 'archive', daysOld: 90, enabled: false },
    ],
    theme: 'light',
    showUnreadCount: true,
};

// Blur everything that could carry personal content. The tab bar sits in the
// toolbar row, which is deliberately left sharp.
const BLUR_PRIVATE = `
  tr.zA, .aeN, header, .gb_A, .aim, .byl { filter: blur(7px) !important; }
`;

const browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`, { timeout: 180000 });
const ctx = browser.contexts()[0];
const ext = (path = '') => `chrome-extension://${EXTENSION_ID}/${path}`;

async function withPage(fn, { width = 1440, height = 900 } = {}) {
    const page = await ctx.newPage();
    await page.setViewportSize({ width, height });
    try {
        return await fn(page);
    } finally {
        await page.close();
    }
}

async function setTheme(theme) {
    await withPage(async (p) => {
        await p.goto(ext('options.html'), { waitUntil: 'domcontentloaded' });
        await p.evaluate((t) => new Promise((r) => chrome.storage.local.set({ globalTheme: t }, r)), theme);
    });
}

// ---------------------------------------------------------------------------
// 1. Options page captures, against a demo account
// ---------------------------------------------------------------------------

await withPage(async (p) => {
    await p.goto(ext('options.html'), { waitUntil: 'domcontentloaded' });
    await p.evaluate(([k, v]) => new Promise((r) => chrome.storage.sync.set({ [k]: v }, r)), [DEMO_KEY, DEMO_SETTINGS]);
});

async function shootOptions({ hash, file, theme, action }) {
    await setTheme(theme);
    await withPage(async (p) => {
        await p.goto(ext(`options.html${hash}`), { waitUntil: 'domcontentloaded' });
        await p.waitForTimeout(2000);
        await p.evaluate((demo) => {
            const sel = document.getElementById('account-select');
            if (sel && [...sel.options].some((o) => o.value === demo)) {
                sel.value = demo;
                sel.dispatchEvent(new Event('change'));
            }
        }, DEMO_KEY.replace('account_', ''));
        await p.waitForTimeout(1200);
        if (action) await action(p);
        await p.screenshot({ path: `${RAW}/${file}` });
        console.log('captured', file);
    });
}

await shootOptions({ hash: '#settings', file: 'options-settings-light.png', theme: 'light' });
await shootOptions({ hash: '#rules', file: 'options-rules-light.png', theme: 'light' });
await shootOptions({ hash: '#privacy', file: 'options-privacy-light.png', theme: 'light' });
await shootOptions({ hash: '#contact', file: 'options-feedback-light.png', theme: 'light' });
await shootOptions({ hash: '#settings', file: 'options-settings-dark.png', theme: 'dark' });
await shootOptions({
    hash: '#settings',
    file: 'options-colorpicker-light.png',
    theme: 'light',
    action: async (p) => {
        const triggers = await p.$$('.tab-color-trigger');
        if (triggers[1]) {
            await triggers[1].click();
            await p.waitForTimeout(600);
        }
    },
});

// ---------------------------------------------------------------------------
// 2. Gmail captures, with private content blurred and the account restored
// ---------------------------------------------------------------------------

if (GMAIL_ACCOUNT) {
    const realKey = `account_${GMAIL_ACCOUNT}`;
    const backup = await withPage(async (p) => {
        await p.goto(ext('options.html'), { waitUntil: 'domcontentloaded' });
        const existing = await p.evaluate((k) => new Promise((r) => chrome.storage.sync.get(k, (d) => r(d[k] || null))), realKey);
        await p.evaluate(
            ([k, tabs]) => new Promise((r) => chrome.storage.sync.set({ [k]: { tabs, rules: [], theme: 'light', showUnreadCount: true } }, r)),
            [realKey, DEMO_TABS]
        );
        return existing;
    });

    try {
        for (const theme of ['light', 'dark']) {
            await setTheme(theme);
            await withPage(async (p) => {
                await p.goto('https://mail.google.com/', { waitUntil: 'domcontentloaded', timeout: 90000 });
                await p.waitForTimeout(13000);
                await p.addStyleTag({ content: BLUR_PRIVATE });
                await p.waitForTimeout(800);
                await p.screenshot({ path: `${RAW}/gmail-${theme}.png` });
                console.log('captured', `gmail-${theme}.png`);
            });
        }
    } finally {
        // Always put the account back, even if a capture threw.
        await withPage(async (p) => {
            await p.goto(ext('options.html'), { waitUntil: 'domcontentloaded' });
            await p.evaluate(
                ([k, v]) => new Promise((r) => (v ? chrome.storage.sync.set({ [k]: v }, r) : chrome.storage.sync.remove([k], r))),
                [realKey, backup]
            );
        });
        console.log('restored', realKey, backup ? '(previous settings)' : '(was absent, removed)');
    }
} else {
    console.log('No Gmail account passed: skipping the in-Gmail captures, reusing whatever is in store-assets/raw.');
}

// ---------------------------------------------------------------------------
// 3. Compose the store assets
// ---------------------------------------------------------------------------

const raw = (f) => `file://${RAW}/${f}`;
const LOGO = `file://${ROOT}/src/icons/icon128.png`;

const SCREENSHOTS = [
    {
        file: 'screenshot-1-tabs-in-gmail.png',
        img: raw('gmail-light.png'),
        offset: -40,
        head: 'Your labels and searches, as tabs',
        sub: 'One click per view, with live unread counts. Inbox content blurred for privacy.',
    },
    {
        file: 'screenshot-2-colors.png',
        img: raw('options-colorpicker-light.png'),
        offset: -215,
        head: 'Colour-code the views that matter',
        sub: 'An accessible palette that stays readable in light and dark.',
    },
    {
        file: 'screenshot-3-automation.png',
        img: raw('options-rules-light.png'),
        offset: -120,
        head: 'One-click cleanup rules',
        sub: 'Starter templates generate a script that runs in your own Google account.',
    },
    {
        // Deliberately the options page, not Gmail: forcing the dark bar over a
        // light Gmail would show the exact mismatch v1.4.0 fixed.
        file: 'screenshot-4-dark-mode.png',
        img: raw('options-settings-dark.png'),
        offset: -120,
        dark: true,
        head: 'Light and dark, done properly',
        sub: 'System mode follows the Gmail you are looking at, not just your operating system.',
    },
    {
        file: 'screenshot-5-privacy.png',
        img: raw('options-privacy-light.png'),
        offset: -120,
        head: 'No analytics. No telemetry.',
        sub: 'Read the whole policy in the extension: what is stored, and the two things that ever leave.',
    },
];

await withPage(
    async (page) => {
        for (const shot of SCREENSHOTS) {
            if (!existsSync(shot.img.replace('file://', ''))) {
                console.warn('skipping', shot.file, '- missing', shot.img);
                continue;
            }
            await page.goto(`file://${HERE}/frame.html`);
            await page.evaluate((s) => {
                document.getElementById('logo').src = s.logo;
                const img = document.getElementById('shot');
                img.src = s.img;
                img.style.marginTop = s.offset + 'px';
                document.getElementById('headline').textContent = s.head;
                document.getElementById('sub').textContent = s.sub;
                if (s.dark) document.body.classList.add('dark');
            }, { ...shot, logo: LOGO });
            await page.waitForTimeout(900);

            // A short image would leave a blank band; fail loudly instead of
            // shipping it.
            const gap = await page.evaluate(() => {
                const frame = document.querySelector('.shot').getBoundingClientRect();
                const img = document.getElementById('shot').getBoundingClientRect();
                return Math.round(frame.bottom - img.bottom);
            });
            if (gap > 0) throw new Error(`${shot.file}: image leaves a ${gap}px blank band, reduce its offset`);

            await page.screenshot({ path: `${OUT}/${shot.file}` });
            console.log('composed', shot.file);
        }
    },
    { width: 1280, height: 800 }
);

await withPage(async (page) => {
    await page.goto(`file://${HERE}/tiles.html`);
    await page.evaluate(([logo, shot]) => {
        document.querySelectorAll('.logo').forEach((i) => (i.src = logo));
        document.querySelectorAll('.shot').forEach((i) => (i.src = shot));
    }, [LOGO, raw('gmail-light.png')]);
    await page.waitForTimeout(900);
    await (await page.$('#marquee')).screenshot({ path: `${OUT}/promo-marquee-1400x560.png` });
    await (await page.$('#small')).screenshot({ path: `${OUT}/promo-small-440x280.png` });
    console.log('composed promo tiles');
});

// Verify every asset is the exact size the store expects.
const EXPECTED = {
    'promo-marquee-1400x560.png': [1400, 560],
    'promo-small-440x280.png': [440, 280],
    'screenshot-1-tabs-in-gmail.png': [1280, 800],
    'screenshot-2-colors.png': [1280, 800],
    'screenshot-3-automation.png': [1280, 800],
    'screenshot-4-dark-mode.png': [1280, 800],
    'screenshot-5-privacy.png': [1280, 800],
};
let bad = 0;
for (const [file, [w, h]] of Object.entries(EXPECTED)) {
    const path = `${OUT}/${file}`;
    if (!existsSync(path)) {
        console.error('MISSING', file);
        bad++;
        continue;
    }
    const buf = readFileSync(path);
    const width = buf.readUInt32BE(16);
    const height = buf.readUInt32BE(20);
    if (width !== w || height !== h) {
        console.error(`WRONG SIZE ${file}: ${width}x${height}, expected ${w}x${h}`);
        bad++;
    }
}
console.log(bad === 0 ? '\nAll assets present and correctly sized.' : `\n${bad} asset problem(s).`);

await browser.close();
process.exit(bad === 0 ? 0 : 1);
