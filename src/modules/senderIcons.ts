/**
 * senderIcons.ts
 *
 * Puts a small chip at the start of each inbox row saying who the mail is
 * from: `mashreq.com`, with the organisation's icon or a lettered badge.
 * Off until the user turns it on, and the icons themselves are a second,
 * separate opt-in because they are the one part that makes a request.
 *
 * ## Why not InboxSDK
 *
 * The extension this replaces is sixty lines on top of InboxSDK. InboxSDK
 * finds rows and places its label with the same obfuscated class names this
 * module keeps only as a fallback; it is a convenience, not a better hook
 * into Gmail. It costs a megabyte, a script in Gmail's own page context, and
 * by default it reports errors and usage to its vendor's servers, which this
 * extension's privacy promise rules out. See ADR-027.
 *
 * ## Every layer has a fallback, and every chain ends in "draw nothing"
 *
 *   rows      tr[role="row"] with an id, inside [role="main"]
 *             → the row class learned the last time that worked
 *             → SENDER_ROW_FALLBACK
 *   sender    the `email` attribute → `data-hovercard-id`
 *             → nothing: a row with no readable address gets no chip
 *   placement the first child of the row's [role="link"]
 *             → the subject class learned the last time that worked
 *             → SENDER_SUBJECT_FALLBACK → the sender's own cell
 *   icon      a lettered badge, drawn at once and without any request;
 *             then, only if the user opted in, a favicon for the host,
 *             then for the organisation's domain, from two providers,
 *             swapped in over the badge once it has actually loaded
 *
 * A fallback that held is recorded in health.ts as `degraded`: nothing looks
 * wrong on screen, and that is the warning worth having while there is still
 * time to act on it. The drift canary checks the same chain every day.
 *
 * ## Slow networks
 *
 * The badge never waits for anything. A favicon is fetched off to the side,
 * at most a few at a time, with a timeout, and replaces the badge only after
 * it has loaded and turned out to be a real icon rather than the provider's
 * placeholder. A connection that never answers leaves the badges exactly as
 * they were, and a timed-out host is tried again later rather than never.
 */

import { hostOf, isMailboxProvider, registrableDomain } from '../utils/domain';
import { SENDER_ROW_FALLBACK, SENDER_SUBJECT_FALLBACK } from '../utils/selectors';
import { HealthReason, HealthStatus, recordIntegrationHealth } from './health';
import { ignoreChromeError, isExtensionContextAlive } from './extensionContext';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** How a mailbox provider's address (gmail.com, outlook.com) is shown. */
export type MailboxStyle = 'initial' | 'provider';

export interface SenderIconPrefs {
    enabled: boolean;
    /** Fetch website icons. Off by default: it is the only part that makes a request. */
    favicons: boolean;
    /** Show the domain as text beside the icon. */
    domainText: boolean;
    /** Mailbox providers: the sender's own initial, or the provider's icon. */
    mailboxStyle: MailboxStyle;
}

export interface SenderIconDeps {
    /** The signed-in address, so the user's own replies do not name the thread. */
    getAccountId: () => string | null;
    /** Current preferences, read on every scan rather than captured once. */
    getPrefs: () => SenderIconPrefs | null;
}

/** On every chip, holding the domain it shows. The canary looks for it. */
export const CHIP_ATTR = 'data-glt-sender';
const CHIP_CLASS = 'glt-sender-chip';
const KEY_ATTR = 'data-glt-key';
const KIND_ATTR = 'data-glt-kind';

/** Badge colours, as classes whose colours live in toolbar.css. */
export const BADGE_PALETTE_SIZE = 8;

/** Where the learned fallbacks are kept, per browser. */
export const LEARNED_SELECTORS_KEY = 'senderIconsLearned';

/** Scans are coalesced, and never closer together than this. */
const MIN_SCAN_GAP_MS = 50;

/**
 * A row whose chip Gmail keeps removing is left alone after this many
 * reinsertions inside the window. It has never been observed, and it is the
 * one way this module could spin: insert, Gmail removes, insert again.
 */
const MAX_REINSERTS = 30;
const REINSERT_WINDOW_MS = 10_000;

/** Favicon fetching. */
const FAVICON_TIMEOUT_MS = 8_000;
const FAVICON_CONCURRENCY = 4;
const FAVICON_QUEUE_MAX = 200;
const FAVICON_CACHE_MAX = 1_000;
/** A real icon was requested at 32px; the providers' placeholder is 16px. */
const FAVICON_MIN_REAL_PX = 24;
/** A host with no icon is not asked again today. */
const FAVICON_NONE_RETRY_MS = 24 * 60 * 60 * 1000;
/** A host that could not be reached is asked again soon; the network may be back. */
const FAVICON_ERROR_RETRY_MS = 10 * 60 * 1000;
/**
 * Consecutive unreachable hosts before fetching pauses. A browser or an
 * extension that blocks the icon host, or a network that has gone, would
 * otherwise cost a failed request for every new sender on screen. Paused,
 * every chip keeps its badge and the next attempt waits FAVICON_ERROR_RETRY_MS.
 */
const FAVICON_UNREACHABLE_AFTER = 5;

/**
 * Two providers for the same data, in order. The first is Google's static
 * host, a separate domain from google.com, so the request does not carry the
 * Google account cookies; the second is the older address, which redirects to
 * a host like the first and is kept for the day the direct path changes
 * shape. Both are disclosed in SECURITY.md and on the privacy page, and
 * nothing is fetched unless the user turned icons on.
 */
const FAVICON_PROVIDERS: ReadonlyArray<(domain: string) => string> = [
    (d) =>
        'https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&size=32&url=' +
        encodeURIComponent('https://' + d),
    (d) => 'https://www.google.com/s2/favicons?sz=32&domain=' + encodeURIComponent(d),
];

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

let deps: SenderIconDeps | null = null;
let observer: MutationObserver | null = null;
let scanTimer: ReturnType<typeof setTimeout> | null = null;
let lastScanAt = 0;
/** Bumped on uninstall, so a favicon that lands afterwards is dropped. */
let generation = 0;

interface Learned {
    row?: string;
    subject?: string;
}
let learned: Learned = {};
let learnedLoaded = false;

const reinserts = new WeakMap<Element, { count: number; since: number }>();
/**
 * The chip each row had last. When Gmail discards a row's cell and draws a
 * new one, the old chip is put back rather than rebuilt: its icon is already
 * decoded, so there is no frame in which the new image is still blank.
 */
let lastChips = new WeakMap<Element, HTMLElement>();

// ---------------------------------------------------------------------------
// Reading Gmail, ARIA first
// ---------------------------------------------------------------------------

type RowSource = 'aria' | 'learned' | 'fallback';
type AnchorSource = 'aria' | 'learned' | 'fallback' | 'sender-cell';
type SenderSource = 'email' | 'hovercard';

/** A class token we are willing to put in a selector without escaping. */
const SAFE_TOKEN = /^[A-Za-z_][A-Za-z0-9_-]{0,40}$/;

function readAddress(el: Element): { address: string; source: SenderSource } | null {
    const email = el.getAttribute('email');
    if (email && hostOf(email)) return { address: email, source: 'email' };
    const card = el.getAttribute('data-hovercard-id');
    if (card && hostOf(card)) return { address: card, source: 'hovercard' };
    return null;
}

function hasAddress(row: Element): boolean {
    for (const el of Array.from(row.querySelectorAll('[email], [data-hovercard-id]'))) {
        if (readAddress(el)) return true;
    }
    return false;
}

/**
 * The thread rows on screen, and which layer found them.
 *
 * A thread row is the one with an id; in the split reading pane Gmail spreads
 * a thread across two or three rows and only the first carries it.
 */
export function findRows(): { rows: HTMLElement[]; source: RowSource } {
    const root: ParentNode = document.querySelector('[role="main"]') ?? document;

    const aria = Array.from(root.querySelectorAll<HTMLElement>('tr[role="row"][id]')).filter(hasAddress);
    if (aria.length > 0) return { rows: aria, source: 'aria' };

    if (learned.row && SAFE_TOKEN.test(learned.row)) {
        const found = Array.from(root.querySelectorAll<HTMLElement>(`tr.${learned.row}[id]`)).filter(hasAddress);
        if (found.length > 0) return { rows: found, source: 'learned' };
    }

    const fallback = Array.from(root.querySelectorAll<HTMLElement>(SENDER_ROW_FALLBACK)).filter(
        (r) => r.id && hasAddress(r)
    );
    return { rows: fallback, source: 'fallback' };
}

/** The row and any continuation rows that belong to the same thread. */
export function threadGroup(row: HTMLElement): HTMLElement[] {
    const group = [row];
    let next = row.nextElementSibling;
    while (next instanceof HTMLElement && next.tagName === 'TR' && !next.id) {
        group.push(next);
        next = next.nextElementSibling;
    }
    return group;
}

function queryGroup<T extends Element>(group: HTMLElement[], selector: string): T | null {
    for (const el of group) {
        const hit = el.querySelector<T>(selector);
        if (hit) return hit;
    }
    return null;
}

export interface Sender {
    address: string;
    name: string;
    host: string;
    source: SenderSource;
}

/**
 * Who the row is from: the first participant who is not the user, so a
 * thread the user replied to is still named after the other side. A thread
 * with only the user in it (notes to self, a sent-only thread) is named after
 * the user, which is what Gmail's own list shows too.
 */
export function pickSender(group: HTMLElement[], self: string | null): Sender | null {
    const me = self?.toLowerCase() ?? null;
    let first: Sender | null = null;
    for (const row of group) {
        for (const el of Array.from(row.querySelectorAll('[email], [data-hovercard-id]'))) {
            const read = readAddress(el);
            if (!read) continue;
            const host = hostOf(read.address);
            if (!host) continue;
            const sender: Sender = {
                address: read.address,
                name: (el.getAttribute('name') ?? el.textContent ?? '').trim(),
                host,
                source: read.source,
            };
            if (read.address.toLowerCase() !== me) return sender;
            if (!first) first = sender;
        }
    }
    return first;
}

/** Where a chip goes in this row, and which layer found the place. */
export function findAnchor(group: HTMLElement[]): { el: HTMLElement; source: AnchorSource } | null {
    const link = queryGroup<HTMLElement>(group, '[role="link"]');
    if (link?.firstElementChild instanceof HTMLElement) return { el: link.firstElementChild, source: 'aria' };

    if (learned.subject && SAFE_TOKEN.test(learned.subject)) {
        const hit = queryGroup<HTMLElement>(group, `.${learned.subject}`);
        if (hit) return { el: hit, source: 'learned' };
    }

    const fallback = queryGroup<HTMLElement>(group, SENDER_SUBJECT_FALLBACK);
    if (fallback) return { el: fallback, source: 'fallback' };

    const senderEl = queryGroup<HTMLElement>(group, '[email], [data-hovercard-id]');
    const cell = senderEl?.closest<HTMLElement>('td, [role="gridcell"]');
    if (cell) return { el: cell, source: 'sender-cell' };
    return null;
}

// ---------------------------------------------------------------------------
// What a chip shows
// ---------------------------------------------------------------------------

function hashIndex(text: string, size: number): number {
    let h = 5381;
    for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
    return Math.abs(h) % size;
}

function firstLetter(text: string): string {
    for (const ch of Array.from(text)) {
        if (/[\p{L}\p{N}]/u.test(ch)) return ch.toLocaleUpperCase();
    }
    return '?';
}

export interface ChipSpec {
    domain: string;
    letter: string;
    colour: number;
    text: string | null;
    /** The favicon lookup host, or null when no icon may be fetched for this chip. */
    iconHost: string | null;
}

/** Decide what the chip for a sender says, without touching the DOM. */
export function chipSpecFor(sender: Sender, prefs: SenderIconPrefs): ChipSpec {
    const domain = registrableDomain(sender.host);
    const mailbox = isMailboxProvider(domain);
    const personal = mailbox && prefs.mailboxStyle === 'initial';
    const local = sender.address.slice(0, sender.address.lastIndexOf('@'));
    return {
        domain,
        letter: personal ? firstLetter(sender.name || local) : firstLetter(domain),
        colour: hashIndex(personal ? sender.address.toLowerCase() : domain, BADGE_PALETTE_SIZE),
        text: prefs.domainText ? domain : null,
        iconHost: prefs.favicons && !personal ? sender.host : null,
    };
}

function chipKey(spec: ChipSpec, iconUrl: string | null): string {
    return [spec.domain, spec.letter, spec.colour, spec.text ?? '', iconUrl ?? ''].join('|');
}

function buildChip(spec: ChipSpec, iconUrl: string | null): HTMLElement {
    const chip = document.createElement('span');
    chip.className = CHIP_CLASS;
    chip.setAttribute(CHIP_ATTR, spec.domain);
    chip.setAttribute(KEY_ATTR, chipKey(spec, iconUrl));
    chip.setAttribute(KIND_ATTR, iconUrl ? 'icon' : 'badge');
    // The row already reads out the sender's name; the chip would only repeat it.
    chip.setAttribute('aria-hidden', 'true');
    chip.title = spec.domain;

    if (iconUrl) {
        const img = document.createElement('img');
        img.className = 'glt-sender-icon';
        img.alt = '';
        img.width = 16;
        img.height = 16;
        img.draggable = false;
        img.decoding = 'async';
        img.referrerPolicy = 'no-referrer';
        // Loaded once already by the resolver, so this is the HTTP cache; if
        // it fails anyway, forget the icon and let the next scan draw a badge.
        img.addEventListener('error', () => {
            if (spec.iconHost) forgetFavicon(spec.iconHost);
            scheduleScan();
        });
        img.src = iconUrl;
        chip.appendChild(img);
    } else {
        const badge = document.createElement('span');
        badge.className = `glt-sender-badge glt-badge-${spec.colour}`;
        badge.textContent = spec.letter;
        chip.appendChild(badge);
    }

    if (!spec.text) chip.classList.add('glt-sender-chip--bare');
    if (spec.text) {
        const text = document.createElement('span');
        text.className = 'glt-sender-domain';
        text.textContent = spec.text;
        chip.appendChild(text);
    }
    return chip;
}

// ---------------------------------------------------------------------------
// Favicons, off to the side
// ---------------------------------------------------------------------------

type FaviconEntry = { state: 'pending' } | { state: 'ok'; url: string } | { state: 'none'; retryAt: number };

const favicons = new Map<string, FaviconEntry>();
const faviconQueue: string[] = [];
let faviconsInFlight = 0;
let unreachableStreak = 0;
/** While in the future, no new icon is requested. See FAVICON_UNREACHABLE_AFTER. */
let faviconPausedUntil = 0;

export type ProbeResult = 'ok' | 'placeholder' | 'error';

/** Swappable in tests, where jsdom never loads an image. */
let probeImage = (url: string): Promise<ProbeResult> =>
    new Promise((resolve) => {
        const img = new Image();
        let settled = false;
        const finish = (r: ProbeResult) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            resolve(r);
        };
        const timer = setTimeout(() => finish('error'), FAVICON_TIMEOUT_MS);
        img.referrerPolicy = 'no-referrer';
        img.decoding = 'async';
        img.onload = () => finish(img.naturalWidth >= FAVICON_MIN_REAL_PX ? 'ok' : 'placeholder');
        img.onerror = () => finish('error');
        img.src = url;
    });

/** For tests only. */
export function setImageProbe(probe: (url: string) => Promise<ProbeResult>): void {
    probeImage = probe;
}

/**
 * The icon for a host: the host itself first (a subdomain can have its own),
 * then the organisation's domain. Each provider is tried only when the one
 * before it could not be reached; a placeholder is an answer, not an error.
 */
async function resolveFavicon(host: string): Promise<{ url: string | null; reachable: boolean }> {
    const domains = [...new Set([host, registrableDomain(host)])];
    let reachable = false;
    for (const domain of domains) {
        for (const provider of FAVICON_PROVIDERS) {
            const url = provider(domain);
            const result = await probeImage(url);
            if (result === 'ok') return { url, reachable: true };
            if (result === 'placeholder') {
                reachable = true;
                break;
            }
        }
    }
    return { url: null, reachable };
}

function faviconsPaused(): boolean {
    return Date.now() < faviconPausedUntil;
}

function pumpFavicons(): void {
    const gen = generation;
    if (faviconsPaused()) {
        // Whatever was waiting keeps its badge and is asked again after the pause.
        for (const host of faviconQueue.splice(0)) favicons.set(host, { state: 'none', retryAt: faviconPausedUntil });
        return;
    }
    while (faviconsInFlight < FAVICON_CONCURRENCY && faviconQueue.length > 0) {
        const host = faviconQueue.shift()!;
        faviconsInFlight++;
        resolveFavicon(host)
            .then(({ url, reachable }) => {
                if (gen !== generation) return;
                if (url) {
                    favicons.set(host, { state: 'ok', url });
                    unreachableStreak = 0;
                } else {
                    favicons.set(host, {
                        state: 'none',
                        retryAt: Date.now() + (reachable ? FAVICON_NONE_RETRY_MS : FAVICON_ERROR_RETRY_MS),
                    });
                    if (reachable) {
                        unreachableStreak = 0;
                    } else if (++unreachableStreak >= FAVICON_UNREACHABLE_AFTER) {
                        faviconPausedUntil = Date.now() + FAVICON_ERROR_RETRY_MS;
                        unreachableStreak = 0;
                    }
                }
                trimFaviconCache();
                scheduleScan();
            })
            .catch(() => {
                if (gen === generation)
                    favicons.set(host, { state: 'none', retryAt: Date.now() + FAVICON_ERROR_RETRY_MS });
            })
            .finally(() => {
                if (gen !== generation) return;
                faviconsInFlight--;
                pumpFavicons();
            });
    }
}

function trimFaviconCache(): void {
    while (favicons.size > FAVICON_CACHE_MAX) {
        const oldest = favicons.keys().next().value;
        if (oldest === undefined) break;
        favicons.delete(oldest);
    }
}

function forgetFavicon(host: string): void {
    favicons.set(host, { state: 'none', retryAt: Date.now() + FAVICON_ERROR_RETRY_MS });
}

/** The icon URL if one is known; otherwise start looking and return null. */
function faviconFor(host: string): string | null {
    const entry = favicons.get(host);
    if (entry?.state === 'ok') return entry.url;
    if (entry?.state === 'pending') return null;
    if (entry?.state === 'none' && Date.now() < entry.retryAt) return null;
    if (faviconsPaused() || faviconQueue.length >= FAVICON_QUEUE_MAX) return null;
    favicons.set(host, { state: 'pending' });
    faviconQueue.push(host);
    pumpFavicons();
    return null;
}

// ---------------------------------------------------------------------------
// Learning the fallbacks from the page
// ---------------------------------------------------------------------------

/** The class every one of these elements carries, if they share exactly one kind. */
function sharedClass(elements: Element[]): string | undefined {
    if (elements.length < 3) return undefined;
    let shared = new Set(Array.from(elements[0].classList));
    for (const el of elements.slice(1)) {
        shared = new Set(Array.from(el.classList).filter((c) => shared.has(c)));
        if (shared.size === 0) return undefined;
    }
    return Array.from(shared).find((c) => SAFE_TOKEN.test(c));
}

function loadLearned(): void {
    if (learnedLoaded || !isExtensionContextAlive()) return;
    learnedLoaded = true;
    try {
        chrome.storage.local.get([LEARNED_SELECTORS_KEY], (stored) => {
            if (chrome.runtime.lastError) return;
            const value = stored?.[LEARNED_SELECTORS_KEY] as Learned | undefined;
            if (value && typeof value === 'object') {
                learned = {
                    row: typeof value.row === 'string' ? value.row : undefined,
                    subject: typeof value.subject === 'string' ? value.subject : undefined,
                };
            }
        });
    } catch {
        // Nothing learned yet is the ordinary state; the hardcoded fallbacks stand.
    }
}

/**
 * While the ARIA anchors work, remember what Gmail's classes for the same
 * elements are today. If an ARIA attribute later disappears, the class seen
 * most recently is a better guess than the one this release shipped with.
 * Written only when it changes.
 */
function learnFrom(rows: HTMLElement[], anchors: HTMLElement[]): void {
    const row = sharedClass(rows);
    const subject = sharedClass(anchors);
    const next: Learned = { row: row ?? learned.row, subject: subject ?? learned.subject };
    if (next.row === learned.row && next.subject === learned.subject) return;
    learned = next;
    if (!isExtensionContextAlive()) return;
    try {
        ignoreChromeError(chrome.storage.local.set({ [LEARNED_SELECTORS_KEY]: { ...next, at: Date.now() } }));
    } catch {
        /* the in-memory copy still serves this page */
    }
}

// ---------------------------------------------------------------------------
// The scan
// ---------------------------------------------------------------------------

export interface ScanReport {
    rows: number;
    rowSource: RowSource | null;
    drawn: number;
    changed: number;
    status: HealthStatus | null;
    reason?: HealthReason;
}

function removeAllChips(): void {
    document.querySelectorAll(`.${CHIP_CLASS}`).forEach((el) => el.remove());
}

function allowReinsert(row: HTMLElement): boolean {
    const now = Date.now();
    const seen = reinserts.get(row);
    if (!seen || now - seen.since > REINSERT_WINDOW_MS) {
        reinserts.set(row, { count: 1, since: now });
        return true;
    }
    seen.count++;
    return seen.count <= MAX_REINSERTS;
}

function verdict(r: {
    rowSource: RowSource;
    withSender: number;
    anchored: number;
    anchorFallback: boolean;
    senderFallback: boolean;
    faviconsOn: boolean;
}): { status: HealthStatus; reason?: HealthReason } {
    if (r.withSender === 0) return { status: 'unavailable', reason: 'no-sender' };
    if (r.anchored === 0) return { status: 'unavailable', reason: 'no-anchor' };
    if (r.rowSource !== 'aria') return { status: 'degraded', reason: 'fallback-rows' };
    if (r.anchorFallback) return { status: 'degraded', reason: 'fallback-anchor' };
    if (r.senderFallback) return { status: 'degraded', reason: 'fallback-sender' };
    if (r.faviconsOn && faviconsPaused()) return { status: 'degraded', reason: 'favicon-unreachable' };
    return { status: 'active' };
}

/**
 * Bring every row's chip up to date. Idempotent: a second call with nothing
 * changed touches no DOM, which is what keeps our own insertions from
 * feeding the observer in a loop.
 */
export function scanNow(): ScanReport {
    lastScanAt = Date.now();
    const prefs = deps?.getPrefs() ?? null;
    if (!deps || !prefs?.enabled) {
        removeAllChips();
        return { rows: 0, rowSource: null, drawn: 0, changed: 0, status: null };
    }

    const { rows, source } = findRows();
    if (rows.length === 0) {
        // An open thread, an empty label or a page still loading. Nothing to
        // judge, so nothing is recorded.
        return { rows: 0, rowSource: null, drawn: 0, changed: 0, status: null };
    }

    const self = deps.getAccountId();
    let withSender = 0;
    let anchored = 0;
    let changed = 0;
    let anchorFallback = false;
    let senderFallback = false;
    const ariaAnchors: HTMLElement[] = [];

    for (const row of rows) {
        const group = threadGroup(row);
        // One chip per thread. Any beyond the first can only be left over
        // from something else drawing here, and would never be updated.
        const [existing, ...extra] = group.flatMap((el) =>
            Array.from(el.querySelectorAll<HTMLElement>(`.${CHIP_CLASS}`))
        );
        extra.forEach((el) => el.remove());
        const sender = pickSender(group, self);
        if (!sender) {
            existing?.remove();
            continue;
        }
        withSender++;
        if (sender.source === 'hovercard') senderFallback = true;

        const anchor = findAnchor(group);
        if (!anchor) {
            existing?.remove();
            continue;
        }
        anchored++;
        if (anchor.source === 'aria') ariaAnchors.push(anchor.el);
        else anchorFallback = true;

        const spec = chipSpecFor(sender, prefs);
        const iconUrl = spec.iconHost ? faviconFor(spec.iconHost) : null;
        const key = chipKey(spec, iconUrl);

        if (existing && existing.getAttribute(KEY_ATTR) === key && existing.parentElement === anchor.el) continue;
        if (!allowReinsert(row)) continue;

        const reusable = [existing, lastChips.get(row)].find((c) => c?.getAttribute(KEY_ATTR) === key);
        existing?.remove();
        const chip = reusable && !reusable.isConnected ? reusable : buildChip(spec, iconUrl);
        anchor.el.insertAdjacentElement('afterbegin', chip);
        lastChips.set(row, chip);
        changed++;
    }

    if (source === 'aria') learnFrom(rows, ariaAnchors);

    const result = verdict({
        rowSource: source,
        withSender,
        anchored,
        anchorFallback,
        senderFallback,
        faviconsOn: prefs.favicons,
    });
    recordIntegrationHealth('senderIcons', result.status, result.reason);
    return { rows: rows.length, rowSource: source, drawn: anchored, changed, ...result };
}

function safeScan(): void {
    try {
        scanNow();
    } catch (err) {
        // A scan that throws must not take the tab bar or the page with it.
        // The next mutation schedules another attempt.
        console.error('Gmail Tabs: sender icons scan failed', err);
    }
}

function scheduleScan(): void {
    if (!deps || scanTimer) return;
    const wait = Math.max(0, MIN_SCAN_GAP_MS - (Date.now() - lastScanAt));
    scanTimer = setTimeout(() => {
        scanTimer = null;
        safeScan();
    }, wait);
}

/**
 * From the observer: scan now if the throttle allows, otherwise later.
 *
 * Now, because a MutationObserver callback runs before the browser paints and
 * a timer does not. Measured in a live inbox, Gmail replaces the subject cells
 * of its top rows on its own every so often; put back from a timer, their
 * chips were missing for one painted frame, which reads as a flicker.
 */
function scanSoon(): void {
    if (!deps) return;
    if (!scanTimer && Date.now() - lastScanAt >= MIN_SCAN_GAP_MS) safeScan();
    else scheduleScan();
}

function isOurChip(node: Node): boolean {
    return node instanceof Element && node.classList.contains(CHIP_CLASS);
}

/**
 * Whether a batch of mutations could have changed a row. Gmail mutates the
 * page constantly (the navigation counts, the chat roster, timestamps), and
 * none of that is in the list; nor is our own chip going in.
 *
 * A chip coming *out* always counts, even when it is the only node removed:
 * that is Gmail discarding a node it did not create, and ignoring it would
 * leave the row without a chip until something else happened to change.
 */
function touchesList(records: MutationRecord[]): boolean {
    const main = document.querySelector('[role="main"]');
    return records.some((r) => {
        if (main && !(r.target instanceof Node && main.contains(r.target))) return false;
        if (r.removedNodes.length > 0) return true;
        return r.addedNodes.length === 0 || !Array.from(r.addedNodes).every(isOurChip);
    });
}

function startObserving(): void {
    if (observer || typeof MutationObserver === 'undefined') return;
    observer = new MutationObserver((records) => {
        if (touchesList(records)) scanSoon();
    });
    observer.observe(document.body, { childList: true, subtree: true });
}

function stopObserving(): void {
    observer?.disconnect();
    observer = null;
    if (scanTimer) {
        clearTimeout(scanTimer);
        scanTimer = null;
    }
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

/** Start, or restart with new dependencies. Does nothing visible while the feature is off. */
export function installSenderIcons(dependencies: SenderIconDeps): void {
    deps = dependencies;
    loadLearned();
    refreshSenderIcons();
}

/**
 * Follow a preference change: turned on, it starts drawing; turned off, every
 * chip goes and the observer stops, so a user who never enables the feature
 * pays for nothing beyond this call.
 */
export function refreshSenderIcons(): void {
    if (!deps) return;
    const prefs = deps.getPrefs();
    // Off means off at once: nothing still queued is fetched after the user
    // has turned website icons, or the whole feature, off.
    if (!prefs?.enabled || !prefs.favicons) cancelFaviconWork();
    if (prefs?.enabled) {
        startObserving();
        scheduleScan();
    } else {
        stopObserving();
        removeAllChips();
    }
}

/**
 * Drop every queued icon request and ignore any still in flight. An image
 * already requested cannot be recalled, but its answer is discarded and no
 * further request starts.
 */
function cancelFaviconWork(): void {
    generation++;
    faviconQueue.length = 0;
    faviconsInFlight = 0;
    for (const [host, entry] of favicons) if (entry.state === 'pending') favicons.delete(host);
}

/** Stop and remove every chip. Called when another copy of the script takes the page over. */
export function uninstallSenderIcons(): void {
    stopObserving();
    removeAllChips();
    lastChips = new WeakMap();
    deps = null;
    cancelFaviconWork();
}

/** Reset every piece of module state. Tests use this; nothing else should. */
export function resetSenderIconsForTests(): void {
    uninstallSenderIcons();
    favicons.clear();
    unreachableStreak = 0;
    faviconPausedUntil = 0;
    learned = {};
    learnedLoaded = false;
    lastScanAt = 0;
}
