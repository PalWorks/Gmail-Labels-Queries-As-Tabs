/**
 * feedback.ts
 *
 * In-product feedback: builds the payload the options page sends to the
 * feedback relay, and posts it.
 *
 * The relay (a Cloudflare Worker, see /worker) holds the mail provider's API
 * key. Nothing secret lives in this bundle — a published extension is a zip
 * anyone can unpack.
 *
 * Diagnostics are opt-in and deliberately narrow: extension version, browser
 * build, and counts. No label names, no tab titles, no email addresses, no
 * message contents. See ADR-012 in DECISIONS.md.
 */

/** Deployed relay. Overridden in tests; see /worker/README.md to redeploy. */
export const FEEDBACK_ENDPOINT = 'https://gmail-tabs-feedback.palworks.workers.dev/feedback';

/** Request timeout: a feedback form must never hang the options page. */
const REQUEST_TIMEOUT_MS = 12000;

export const FEEDBACK_CATEGORIES = ['bug', 'feature', 'question', 'other'] as const;
export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];

export const MAX_MESSAGE_CHARS = 4000;
const MIN_MESSAGE_CHARS = 5;

export interface FeedbackDiagnostics {
    version: string;
    browser: string;
    tabCount: number;
    ruleCount: number;
    accountCount: number;
}

export interface FeedbackInput {
    category: FeedbackCategory;
    message: string;
    replyTo?: string;
    diagnostics?: FeedbackDiagnostics;
}

export interface FeedbackPayload extends FeedbackInput {
    /** Honeypot, always empty from the real form. */
    website: string;
}

export type FeedbackResult = { ok: true } | { ok: false; error: string };

/** Loose check only: the server decides, this is just early feedback for the user. */
export function isPlausibleEmail(value: string): boolean {
    return /^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(value);
}

/**
 * Validate what the user typed. Returns the first problem as a message fit to
 * show in the form, or null when the input is good.
 */
export function validateFeedback(input: Pick<FeedbackInput, 'message' | 'replyTo'>): string | null {
    const message = input.message.trim();
    if (message.length < MIN_MESSAGE_CHARS) return 'Please write a little more so we can help.';
    if (message.length > MAX_MESSAGE_CHARS) return `Please keep it under ${MAX_MESSAGE_CHARS} characters.`;

    const replyTo = (input.replyTo || '').trim();
    if (replyTo && !isPlausibleEmail(replyTo)) return 'That email address does not look right.';

    return null;
}

/**
 * Collect the opt-in diagnostics. Counts only: enough to reproduce a bug,
 * nothing that identifies the user or their mail.
 */
export function buildDiagnostics(counts: {
    tabCount: number;
    ruleCount: number;
    accountCount: number;
}): FeedbackDiagnostics {
    let version = 'unknown';
    try {
        version = chrome.runtime.getManifest().version;
    } catch {
        // Manifest unavailable outside an extension context (tests).
    }

    return {
        version,
        browser: browserBuild(),
        tabCount: counts.tabCount,
        ruleCount: counts.ruleCount,
        accountCount: counts.accountCount,
    };
}

/** "Chrome/153.0.0.0 on Linux" — build and platform, not the full UA string. */
function browserBuild(): string {
    const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
    const browser = ua.match(/(Chrome|Edg|OPR)\/[\d.]+/)?.[0] || 'unknown';
    const platform = /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'unknown';
    return `${browser} on ${platform}`;
}

/** Assemble the wire payload, trimming what the user typed. */
export function buildFeedbackPayload(input: FeedbackInput): FeedbackPayload {
    const replyTo = (input.replyTo || '').trim();
    return {
        category: input.category,
        message: input.message.trim(),
        ...(replyTo ? { replyTo } : {}),
        ...(input.diagnostics ? { diagnostics: input.diagnostics } : {}),
        website: '',
    };
}

/**
 * Send the feedback. Never throws: the form shows whatever comes back, and a
 * network failure reads as a network failure rather than a silent no-op.
 */
export async function submitFeedback(input: FeedbackInput, endpoint = FEEDBACK_ENDPOINT): Promise<FeedbackResult> {
    const problem = validateFeedback(input);
    if (problem) return { ok: false, error: problem };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(buildFeedbackPayload(input)),
            signal: controller.signal,
        });

        if (res.ok) return { ok: true };

        if (res.status === 429) {
            return { ok: false, error: 'Too many messages from this network. Please try again later.' };
        }

        const body = await res.json().catch(() => ({}) as { error?: string });
        return { ok: false, error: body.error || 'Could not send right now. Please try again later.' };
    } catch (e) {
        const aborted = e instanceof Error && e.name === 'AbortError';
        return {
            ok: false,
            error: aborted ? 'That took too long. Please try again.' : 'No connection. Please check your network.',
        };
    } finally {
        clearTimeout(timer);
    }
}
