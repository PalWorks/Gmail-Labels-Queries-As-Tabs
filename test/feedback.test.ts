export {};
/**
 * feedback.test.ts
 *
 * Unit tests for the in-product feedback module: validation, the opt-in
 * diagnostics payload, and the submit path's error handling.
 */

import {
    FEEDBACK_CATEGORIES,
    MAX_MESSAGE_CHARS,
    buildDiagnostics,
    buildFeedbackPayload,
    isPlausibleEmail,
    submitFeedback,
    validateFeedback,
} from '../src/modules/feedback';

const ENDPOINT = 'https://relay.test/feedback';

beforeEach(() => {
    (global as any).chrome = {
        runtime: { getManifest: () => ({ version: '1.3.0' }) },
    };
    Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/153.0.0.0 Safari/537.36',
        configurable: true,
    });
});

afterEach(() => {
    jest.restoreAllMocks();
});

// ------ validation ------

describe('validateFeedback', () => {
    test('rejects a message that says nothing', () => {
        expect(validateFeedback({ message: '  hi ' })).toMatch(/write a little more/i);
    });

    test('rejects a message beyond the cap', () => {
        expect(validateFeedback({ message: 'x'.repeat(MAX_MESSAGE_CHARS + 1) })).toMatch(/under 4000/);
    });

    test('rejects a malformed reply address', () => {
        expect(validateFeedback({ message: 'The bar vanished', replyTo: 'not-an-email' })).toMatch(/does not look right/);
    });

    test('accepts a real message with no address', () => {
        expect(validateFeedback({ message: 'The tab bar vanished after an update.' })).toBeNull();
    });

    test('accepts a real message with an address', () => {
        expect(validateFeedback({ message: 'Please add keyboard shortcuts.', replyTo: 'a@b.co' })).toBeNull();
    });
});

describe('isPlausibleEmail', () => {
    test.each([
        ['user@example.com', true],
        ['user.name+tag@sub.example.co.uk', true],
        ['user@localhost', false],
        ['no-at-sign.com', false],
        ['two@@example.com', false],
    ])('%s -> %s', (value, expected) => {
        expect(isPlausibleEmail(value as string)).toBe(expected);
    });
});

// ------ payload ------

describe('buildFeedbackPayload', () => {
    test('trims input and always carries an empty honeypot', () => {
        const payload = buildFeedbackPayload({
            category: 'bug',
            message: '  spacing is off  ',
            replyTo: '  a@b.co ',
        });

        expect(payload.message).toBe('spacing is off');
        expect(payload.replyTo).toBe('a@b.co');
        expect(payload.website).toBe('');
    });

    test('omits an empty reply address rather than sending a blank', () => {
        const payload = buildFeedbackPayload({ category: 'other', message: 'a message', replyTo: '   ' });
        expect(payload).not.toHaveProperty('replyTo');
    });

    test('every category in the union is accepted', () => {
        for (const category of FEEDBACK_CATEGORIES) {
            expect(buildFeedbackPayload({ category, message: 'a message' }).category).toBe(category);
        }
    });
});

describe('buildDiagnostics', () => {
    test('reports version, browser and counts only', () => {
        const d = buildDiagnostics({ tabCount: 6, ruleCount: 2, accountCount: 1 });

        expect(d).toEqual({
            version: '1.3.0',
            browser: 'Chrome/153.0.0.0 on Linux',
            tabCount: 6,
            ruleCount: 2,
            accountCount: 1,
        });
        // Nothing identifying may ever appear in this object.
        expect(JSON.stringify(d)).not.toMatch(/@/);
    });

    test('survives a missing manifest (non-extension context)', () => {
        (global as any).chrome = undefined;
        expect(buildDiagnostics({ tabCount: 0, ruleCount: 0, accountCount: 0 }).version).toBe('unknown');
    });
});

// ------ submit ------

describe('submitFeedback', () => {
    test('posts JSON to the relay and reports success', async () => {
        const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200 });
        (global as any).fetch = fetchMock;

        const result = await submitFeedback({ category: 'bug', message: 'The bar vanished.' }, ENDPOINT);

        expect(result).toEqual({ ok: true });
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe(ENDPOINT);
        expect(init.method).toBe('POST');
        expect(JSON.parse(init.body).message).toBe('The bar vanished.');
    });

    test('never sends an invalid message', async () => {
        const fetchMock = jest.fn();
        (global as any).fetch = fetchMock;

        const result = await submitFeedback({ category: 'bug', message: 'no' }, ENDPOINT);

        expect(result.ok).toBe(false);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    test('explains a rate limit in the user\'s terms', async () => {
        (global as any).fetch = jest.fn().mockResolvedValue({ ok: false, status: 429 });

        const result = await submitFeedback({ category: 'other', message: 'a real message' }, ENDPOINT);

        expect(result).toEqual({ ok: false, error: expect.stringMatching(/too many messages/i) });
    });

    test('surfaces the relay\'s error message when it sends one', async () => {
        (global as any).fetch = jest.fn().mockResolvedValue({
            ok: false,
            status: 400,
            json: async () => ({ error: 'Message is too short' }),
        });

        const result = await submitFeedback({ category: 'other', message: 'a real message' }, ENDPOINT);

        expect(result).toEqual({ ok: false, error: 'Message is too short' });
    });

    test('reports a network failure instead of throwing', async () => {
        (global as any).fetch = jest.fn().mockRejectedValue(new TypeError('Failed to fetch'));

        const result = await submitFeedback({ category: 'other', message: 'a real message' }, ENDPOINT);

        expect(result).toEqual({ ok: false, error: expect.stringMatching(/no connection/i) });
    });

    test('reports a timeout distinctly from a network failure', async () => {
        const abortError = new Error('aborted');
        abortError.name = 'AbortError';
        (global as any).fetch = jest.fn().mockRejectedValue(abortError);

        const result = await submitFeedback({ category: 'other', message: 'a real message' }, ENDPOINT);

        expect(result).toEqual({ ok: false, error: expect.stringMatching(/took too long/i) });
    });
});
