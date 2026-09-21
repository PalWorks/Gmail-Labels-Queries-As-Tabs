/**
 * contrast-audit.mjs
 *
 * Measures WCAG contrast against *rendered pixels* in a real Chrome, which
 * the unit test in test/contrast.test.ts cannot do: it reads tokens, not
 * composited output, so it cannot see element opacity, inherited colors or a
 * translucent surface stacked on another.
 *
 * Run it after any visual change, and whenever a new surface is added.
 *
 *   1. Start Chrome with remote debugging:
 *        google-chrome --remote-debugging-port=9222
 *   2. Load dist/ as an unpacked extension (chrome://extensions, Developer
 *      mode, "Load unpacked"), and copy its id.
 *   3. node scripts/contrast-audit.mjs <extension-id> [port]
 *
 * Needs Playwright available (`npm i -g playwright`); it is intentionally not
 * a project dependency, since it is a manual tool rather than part of `npm
 * test`. A global install is found via NODE_PATH:
 *
 *   NODE_PATH=$(npm root -g) node scripts/contrast-audit.mjs <id> [port]
 */

import { createRequire } from 'node:module';

// ESM `import` ignores NODE_PATH, so resolve through require to pick up a
// global Playwright without making it a dependency of the extension.
const require = createRequire(import.meta.url);
let chromium;
try {
    ({ chromium } = require('playwright'));
} catch {
    console.error('Playwright not found. Install it (npm i -g playwright) and run with NODE_PATH=$(npm root -g).');
    process.exit(2);
}

const EXTENSION_ID = process.argv[2];
const PORT = process.argv[3] || '9222';

if (!EXTENSION_ID) {
    console.error('Usage: node scripts/contrast-audit.mjs <extension-id> [debug-port]');
    process.exit(1);
}

/** Runs inside the page: returns every text node whose contrast is below AA. */
const AUDIT = `(() => {
  const parse = (c) => {
    const m = (c || '').match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)(?:,\\s*([\\d.]+))?/);
    return m ? { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : parseFloat(m[4]) } : null;
  };
  const over = (f, b) => ({
    r: Math.round(f.r * f.a + b.r * (1 - f.a)),
    g: Math.round(f.g * f.a + b.g * (1 - f.a)),
    b: Math.round(f.b * f.a + b.b * (1 - f.a)), a: 1 });
  const lum = (c) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };
  const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b); const hi = Math.max(l1, l2), lo = Math.min(l1, l2); return (hi + 0.05) / (lo + 0.05); };
  // Opacity multiplies down the tree, so a faded parent fades its text too.
  const opacityChain = (el) => { let o = 1, cur = el; while (cur) { const v = parseFloat(getComputedStyle(cur).opacity); if (!isNaN(v)) o *= v; cur = cur.parentElement; } return o; };
  const effBg = (el) => {
    let cur = el;
    while (cur) {
      const cs = getComputedStyle(cur);
      if (cs.backgroundImage && cs.backgroundImage !== 'none') return { gradient: cs.backgroundImage.slice(0, 70) };
      const c = parse(cs.backgroundColor);
      if (c && c.a >= 1) return c;
      cur = cur.parentElement;
    }
    return { r: 255, g: 255, b: 255, a: 1 };
  };
  const rows = [];
  document.querySelectorAll('body *').forEach((el) => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return;
    const box = el.getBoundingClientRect();
    if (box.width < 2 || box.height < 2) return;
    const text = Array.from(el.childNodes).filter((n) => n.nodeType === 3 && n.textContent.trim()).map((n) => n.textContent.trim()).join(' ');
    if (!text) return;
    const fg0 = parse(cs.color); if (!fg0) return;
    const bg = effBg(el);
    if (bg.gradient) { rows.push({ text: text.slice(0, 40), gradient: bg.gradient, ratio: null }); return; }
    const fg = over({ ...fg0, a: Math.min(1, fg0.a * opacityChain(el)) }, bg);
    const size = parseFloat(cs.fontSize), weight = parseInt(cs.fontWeight) || 400;
    const need = (size >= 24 || (size >= 18.66 && weight >= 700)) ? 3 : 4.5;
    const cr = ratio(fg, bg);
    if (cr < need) rows.push({
      text: text.slice(0, 40),
      sel: el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\\s+/)[0] : ''),
      fg: 'rgb(' + fg.r + ',' + fg.g + ',' + fg.b + ')', bg: 'rgb(' + bg.r + ',' + bg.g + ',' + bg.b + ')',
      ratio: Math.round(cr * 100) / 100, need });
  });
  return rows.sort((a, b) => (a.ratio || 99) - (b.ratio || 99));
})()`;

const browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`, { timeout: 180000 });
const context = browser.contexts()[0];
let failures = 0;

for (const theme of ['light', 'dark']) {
    const setter = await context.newPage();
    await setter.goto(`chrome-extension://${EXTENSION_ID}/options.html`, { waitUntil: 'domcontentloaded' });
    await setter.evaluate((t) => new Promise((r) => chrome.storage.local.set({ globalTheme: t }, r)), theme);
    await setter.close();

    for (const page of ['options', 'welcome']) {
        const p = await context.newPage();
        if (page === 'welcome' && theme === 'dark') await p.emulateMedia({ colorScheme: 'dark' });
        await p.goto(`chrome-extension://${EXTENSION_ID}/${page}.html`, { waitUntil: 'domcontentloaded' });
        await p.waitForTimeout(1500);
        // Every section at once: hidden panels hide their own contrast bugs.
        if (page === 'options') {
            await p.evaluate(() => document.querySelectorAll('.section').forEach((s) => s.classList.remove('hidden')));
            await p.waitForTimeout(300);
        }
        const rows = await p.evaluate(AUDIT);
        const bad = rows.filter((r) => r.ratio !== null);
        failures += bad.length;
        console.log(`${page}/${theme}: ${bad.length} below AA, ${rows.length - bad.length} gradient-backed (check by hand)`);
        bad.forEach((r) => console.log(`   ${r.ratio} (needs ${r.need}) ${r.sel} ${r.fg} on ${r.bg} "${r.text}"`));
        await p.close();
    }
}

console.log(failures === 0 ? '\nPASS: no text below AA' : `\nFAIL: ${failures} below AA`);
await browser.close();
process.exit(failures === 0 ? 0 : 1);
