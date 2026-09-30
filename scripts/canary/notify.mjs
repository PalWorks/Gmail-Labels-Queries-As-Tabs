/**
 * notify.mjs
 *
 * Sends one alert from the drift canary to a Google Chat space, through an
 * incoming webhook.
 *
 * The canary decides *whether* to tell anyone (run-canary.sh keeps the
 * streaks); this decides nothing and only delivers. Keeping the two apart
 * means changing how we are alerted can never change what is measured.
 *
 * ## Where the webhook lives
 *
 * Never in this repository. A Google Chat webhook URL carries its own key and
 * token, so anyone holding it can post into the space. It is read from, in
 * order:
 *
 *   1. the GCHAT_WEBHOOK_URL environment variable
 *   2. GCHAT_WEBHOOK_URL=... in ~/.config/gmail-labels-as-tabs/alerts.env
 *
 * and it is never printed: logs name the host and nothing else.
 *
 * ## Delivery
 *
 * Three attempts, ten seconds each, with a pause between them, because this
 * runs from a timer on a laptop whose network may be half awake. A 4xx other
 * than 429 is not retried: the webhook was revoked or the payload is wrong,
 * and asking again will not change the answer. Alerts about the same break
 * share a thread in the space, so a week of reminders reads as one
 * conversation rather than seven.
 *
 *   node scripts/canary/notify.mjs --event FAIL --title "..." --body "..." [--thread key]
 *   node scripts/canary/notify.mjs --event FAIL --title "..." --body-file out.txt
 *   node scripts/canary/notify.mjs --test          send a test message
 *   node scripts/canary/notify.mjs ... --dry-run   print the payload, send nothing
 *
 * Exit codes: 0 delivered (or printed, with --dry-run), 2 delivery failed,
 * 3 no webhook configured. Not configured is not an error: it is the state of
 * every machine but the one that asked for alerts.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const CONFIG_FILE = path.join(os.homedir(), '.config', 'gmail-labels-as-tabs', 'alerts.env');

const EVENTS = new Set(['FAIL', 'DEGRADED', 'ERROR', 'SKIPPED', 'RECOVERED', 'PROPOSAL', 'TEST']);
const MAX_BODY = 3500;
const ATTEMPTS = 3;
const TIMEOUT_MS = 10_000;
// Overridable so a test of the retry path does not have to wait eight seconds.
const BACKOFF_MS = (process.env.GLT_ALERTS_BACKOFF_MS || '2000,6000').split(',').map(Number);

/** KEY=VALUE lines, `#` comments, optional quotes. Nothing is evaluated. */
export function parseEnvFile(text) {
    const out = {};
    for (const raw of text.split('\n')) {
        const line = raw.trim();
        if (!line || line.startsWith('#')) continue;
        const eq = line.indexOf('=');
        if (eq <= 0) continue;
        const key = line.slice(0, eq).trim();
        let value = line.slice(eq + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }
        out[key] = value;
    }
    return out;
}

/**
 * The webhook, or null. Only a Google Chat webhook is accepted, so a typo or a
 * pasted page URL fails here rather than posting the canary's output to
 * whatever it happens to name. Tests point it at a local server with
 * GLT_ALERTS_ALLOW_LOCAL=1, which admits http://127.0.0.1 and nothing else.
 */
export function resolveWebhook(env = process.env, configFile = CONFIG_FILE) {
    let url = env.GCHAT_WEBHOOK_URL || null;
    if (!url) {
        try {
            url = parseEnvFile(fs.readFileSync(configFile, 'utf8')).GCHAT_WEBHOOK_URL || null;
        } catch {
            url = null;
        }
    }
    if (!url) return null;
    let parsed;
    try {
        parsed = new URL(url);
    } catch {
        return null;
    }
    const chat = parsed.protocol === 'https:' && parsed.host === 'chat.googleapis.com' && /^\/v1\/spaces\/[^/]+\/messages$/.test(parsed.pathname);
    const local = env.GLT_ALERTS_ALLOW_LOCAL === '1' && parsed.protocol === 'http:' && parsed.hostname === '127.0.0.1';
    return chat || local ? parsed : null;
}

/** The message a person reads in the space. Plain words, no decoration. */
export function buildMessage({ event, title, body, thread, host = os.hostname(), now = new Date() }) {
    const trimmed = body && body.length > MAX_BODY ? body.slice(0, MAX_BODY) + '\n[truncated]' : body;
    const lines = [`*[${event}] Gmail Labels as Tabs: ${title}*`];
    if (trimmed) lines.push('```', trimmed.replace(/```/g, "'''"), '```');
    lines.push(`_from ${host}, ${now.toISOString().replace(/\.\d+Z$/, 'Z')}_`);
    const payload = { text: lines.join('\n') };
    if (thread) payload.thread = { threadKey: thread };
    return payload;
}

/** The URL to post to: threaded replies need the reply option on the query. */
export function postUrl(webhook, thread) {
    const u = new URL(webhook.toString());
    if (thread) u.searchParams.set('messageReplyOption', 'REPLY_MESSAGE_FALLBACK_TO_NEW_THREAD');
    return u.toString();
}

async function deliver(url, payload, log) {
    for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json; charset=UTF-8' },
                body: JSON.stringify(payload),
                signal: controller.signal,
            });
            if (res.ok) return true;
            log(`attempt ${attempt}: HTTP ${res.status}`);
            if (res.status < 500 && res.status !== 429) return false;
        } catch (err) {
            log(`attempt ${attempt}: ${err.name === 'AbortError' ? 'timed out' : err.message}`);
        } finally {
            clearTimeout(timer);
        }
        if (attempt < ATTEMPTS) await new Promise((r) => setTimeout(r, BACKOFF_MS[attempt - 1] ?? 6_000));
    }
    return false;
}

function arg(name) {
    const i = process.argv.indexOf(name);
    return i !== -1 ? process.argv[i + 1] : undefined;
}

async function main() {
    const flag = (n) => process.argv.includes(n);
    const log = (m) => console.error(`notify: ${m}`);

    const test = flag('--test');
    const event = test ? 'TEST' : arg('--event');
    const title = test ? 'test alert from the drift canary' : arg('--title');
    let body = test ? 'If you can read this, alerts from the drift canary reach this space.' : arg('--body') ?? '';
    const bodyFile = arg('--body-file');
    if (bodyFile) body = fs.readFileSync(bodyFile, 'utf8');
    const thread = arg('--thread') ?? (test ? 'canary-test' : undefined);

    if (!EVENTS.has(event) || !title) {
        log(`usage: --event ${[...EVENTS].join('|')} --title <text> [--body <text> | --body-file <f>] [--thread <key>]`);
        return 2;
    }

    const payload = buildMessage({ event, title, body, thread });
    if (flag('--dry-run')) {
        console.log(JSON.stringify(payload, null, 2));
        return 0;
    }

    const webhook = resolveWebhook();
    if (!webhook) {
        log(`no Google Chat webhook configured (set GCHAT_WEBHOOK_URL in ${CONFIG_FILE}); not sent`);
        return 3;
    }
    const ok = await deliver(postUrl(webhook, thread), payload, log);
    log(ok ? `delivered to ${webhook.host}` : `could not deliver to ${webhook.host}`);
    return ok ? 0 : 2;
}

// Run only when executed, so the functions above can be imported by a test.
if (import.meta.url === `file://${process.argv[1]}`) {
    main().then(
        (code) => process.exit(code),
        (err) => {
            console.error('notify: unexpected failure', err);
            process.exit(2);
        }
    );
}
