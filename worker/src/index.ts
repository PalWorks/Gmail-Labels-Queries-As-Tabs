/**
 * feedback worker
 *
 * Relays the extension's in-product feedback form to email via Resend.
 *
 * The extension cannot call Resend directly: a published CRX is a zip anyone
 * can unpack, so an API key inside it is a public key. This Worker holds the
 * key instead and is the only origin the extension ever talks to besides
 * mail.google.com.
 *
 * It accepts one POST, validates it hard, rate limits per IP, and sends.
 * It stores nothing.
 */

export interface Env {
    RESEND_API_KEY: string;
    /** KV namespace used only for per-IP rate-limit counters. */
    FEEDBACK_RATE_LIMIT: KVNamespace;
    /** Verified Resend sender, e.g. GmailLabelsAsTabs.Support@palworks.ai */
    FEEDBACK_FROM: string;
    /** Destination mailbox, e.g. support@palworks.ai */
    FEEDBACK_TO: string;
}

// Limits are deliberately tight: this endpoint is public and unauthenticated.
const MAX_MESSAGE_CHARS = 4000;
const MAX_EMAIL_CHARS = 254;
const MAX_BODY_BYTES = 16 * 1024;
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_SECONDS = 3600;

const CATEGORIES = ['bug', 'feature', 'question', 'other'] as const;
type Category = (typeof CATEGORIES)[number];

interface FeedbackPayload {
    category: Category;
    message: string;
    replyTo?: string;
    /** Optional, user-toggled diagnostics. Never contains email addresses. */
    diagnostics?: Record<string, string | number | boolean>;
    /** Honeypot: must be absent or empty. Bots fill every field they see. */
    website?: string;
}

const CORS_HEADERS: Record<string, string> = {
    // The endpoint is public and takes no credentials, and an extension's
    // origin changes between the unpacked build and the store build, so
    // pinning an origin would only break development.
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
};

function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
}

/** Collapse anything unexpected into a short, safe, single-line string. */
function clean(value: unknown, maxChars: number): string {
    if (typeof value !== 'string') return '';
    return value.replace(/\s+/g, ' ').trim().slice(0, maxChars);
}

function isPlausibleEmail(value: string): boolean {
    return /^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(value);
}

/** Escape for inclusion in the HTML email body. */
function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Per-IP counter in KV. Best effort by design: if KV is unavailable the
 * request is allowed rather than dropping genuine feedback on the floor.
 */
async function isRateLimited(env: Env, ip: string): Promise<boolean> {
    if (!env.FEEDBACK_RATE_LIMIT) return false;
    const key = `rl:${ip}`;
    try {
        const current = parseInt((await env.FEEDBACK_RATE_LIMIT.get(key)) || '0', 10);
        if (current >= RATE_LIMIT_MAX) return true;
        await env.FEEDBACK_RATE_LIMIT.put(key, String(current + 1), {
            expirationTtl: RATE_LIMIT_WINDOW_SECONDS,
        });
        return false;
    } catch {
        return false;
    }
}

export function buildEmail(payload: FeedbackPayload, meta: { ip: string; country: string }) {
    const diagnostics = payload.diagnostics || {};
    const diagnosticRows = Object.entries(diagnostics)
        .map(([k, v]) => `<tr><td><strong>${escapeHtml(k)}</strong></td><td>${escapeHtml(String(v))}</td></tr>`)
        .join('');

    const subject = `[Gmail Tabs feedback] ${payload.category}: ${payload.message.slice(0, 60)}`;
    const html = `
        <h2>Gmail Labels as Tabs — feedback</h2>
        <p><strong>Category:</strong> ${escapeHtml(payload.category)}</p>
        <p><strong>Reply to:</strong> ${payload.replyTo ? escapeHtml(payload.replyTo) : 'not supplied'}</p>
        <hr />
        <p style="white-space: pre-wrap">${escapeHtml(payload.message)}</p>
        <hr />
        <table>${diagnosticRows}<tr><td><strong>country</strong></td><td>${escapeHtml(meta.country)}</td></tr></table>
    `;

    return { subject, html };
}

async function handleFeedback(request: Request, env: Env): Promise<Response> {
    const contentType = request.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
        return json({ error: 'Expected application/json' }, 415);
    }

    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) return json({ error: 'Payload too large' }, 413);

    let parsed: FeedbackPayload;
    try {
        parsed = JSON.parse(raw) as FeedbackPayload;
    } catch {
        return json({ error: 'Malformed JSON' }, 400);
    }

    // Honeypot: a real form never fills this, so answer 200 and drop it
    // silently rather than teaching the bot what failed.
    if (clean(parsed.website, 100)) return json({ ok: true });

    const message = clean(parsed.message, MAX_MESSAGE_CHARS);
    if (message.length < 5) return json({ error: 'Message is too short' }, 400);

    const category = (CATEGORIES as readonly string[]).includes(parsed.category) ? parsed.category : 'other';

    const replyTo = clean(parsed.replyTo, MAX_EMAIL_CHARS);
    if (replyTo && !isPlausibleEmail(replyTo)) {
        return json({ error: 'That email address does not look right' }, 400);
    }

    const ip = request.headers.get('cf-connecting-ip') || 'unknown';
    if (await isRateLimited(env, ip)) {
        return json({ error: 'Too many messages from this network. Try again later.' }, 429);
    }

    const diagnostics: Record<string, string> = {};
    if (parsed.diagnostics && typeof parsed.diagnostics === 'object') {
        for (const [k, v] of Object.entries(parsed.diagnostics).slice(0, 12)) {
            diagnostics[clean(k, 40)] = clean(String(v), 200);
        }
    }

    const country = request.headers.get('cf-ipcountry') || 'unknown';
    const { subject, html } = buildEmail({ category: category as Category, message, replyTo, diagnostics }, { ip, country });

    const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${env.RESEND_API_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            from: env.FEEDBACK_FROM,
            to: [env.FEEDBACK_TO],
            subject,
            html,
            // Lets you hit reply straight from the inbox when the user left an
            // address; Resend omits the header when the array is empty.
            reply_to: replyTo ? [replyTo] : undefined,
        }),
    });

    if (!res.ok) {
        // Never echo the provider's response: it can carry account details.
        return json({ error: 'Could not send right now. Please try again later.' }, 502);
    }

    return json({ ok: true });
}

export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        const url = new URL(request.url);

        if (request.method === 'OPTIONS') {
            return new Response(null, { status: 204, headers: CORS_HEADERS });
        }
        if (url.pathname === '/health') {
            return json({ ok: true });
        }
        if (url.pathname !== '/feedback') {
            return json({ error: 'Not found' }, 404);
        }
        if (request.method !== 'POST') {
            return json({ error: 'Method not allowed' }, 405);
        }

        try {
            return await handleFeedback(request, env);
        } catch {
            return json({ error: 'Unexpected error' }, 500);
        }
    },
};
