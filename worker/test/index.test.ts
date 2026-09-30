// Worker logic tests, plain Node (node --test strips the types). Resend is
// never called: global fetch is replaced for each test.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import worker, { buildEmail, ipKey } from '../src/index.ts';

function memoryKv() {
    const store = new Map<string, string>();
    return {
        store,
        async get(k: string) {
            return store.has(k) ? (store.get(k) as string) : null;
        },
        async put(k: string, v: string) {
            store.set(k, v);
        },
    };
}

let kv: ReturnType<typeof memoryKv>;
let sent: { url: string; body: any }[];
const realFetch = globalThis.fetch;

function env(overrides: Record<string, unknown> = {}) {
    return {
        RESEND_API_KEY: 're_test',
        IP_HASH_SECRET: 'test-secret',
        FEEDBACK_RATE_LIMIT: kv,
        FEEDBACK_FROM: 'from@example.com',
        FEEDBACK_TO: 'to@example.com',
        ...overrides,
    } as any;
}

function post(body: unknown, ip = '203.0.113.7') {
    return new Request('https://relay.example/feedback', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip, 'cf-ipcountry': 'AU' },
        body: JSON.stringify(body),
    });
}

const good = { category: 'bug', message: 'The tabs vanish after a reload.', diagnostics: { version: '1.8.0' } };

beforeEach(() => {
    kv = memoryKv();
    sent = [];
    globalThis.fetch = (async (url: string, init: RequestInit) => {
        sent.push({ url, body: JSON.parse(String(init.body)) });
        return new Response('{}', { status: 200 });
    }) as any;
});

test.after(() => {
    globalThis.fetch = realFetch;
});

test('a valid message is sent, with no country in it', async () => {
    const res = await worker.fetch(post(good), env());
    assert.equal(res.status, 200);
    assert.equal(sent.length, 1);
    assert.doesNotMatch(sent[0].body.html, /country|AU/);
});

test('the counter is named by a keyed hash, never the IP', async () => {
    await worker.fetch(post(good), env());
    const keys = [...kv.store.keys()];
    assert.ok(keys.every((k) => !k.includes('203.0.113.7')));
    assert.ok(keys.includes(`rl:${await ipKey('test-secret', '203.0.113.7')}`));
});

test('ipKey depends on the secret', async () => {
    assert.notEqual(await ipKey('a', '203.0.113.7'), await ipKey('b', '203.0.113.7'));
    assert.match(await ipKey('a', '203.0.113.7'), /^[0-9a-f]{32}$/);
});

test('fails closed without IP_HASH_SECRET', async () => {
    const res = await worker.fetch(post(good), env({ IP_HASH_SECRET: '' }));
    assert.equal(res.status, 500);
    assert.ok((await res.json()).error);
    assert.equal(sent.length, 0);
    assert.equal(kv.store.size, 0);
});

test('five per network per hour, then 429', async () => {
    for (let i = 0; i < 5; i++) assert.equal((await worker.fetch(post(good), env())).status, 200);
    assert.equal((await worker.fetch(post(good), env())).status, 429);
    assert.equal((await worker.fetch(post(good, '198.51.100.1'), env())).status, 200);
});

test('the daily global cap answers 503', async () => {
    kv.store.set(`all:${new Date().toISOString().slice(0, 10)}`, '300');
    const res = await worker.fetch(post(good), env());
    assert.equal(res.status, 503);
    assert.ok((await res.json()).error);
    assert.equal(sent.length, 0);
});

test('the burst binding refuses before KV is touched', async () => {
    const res = await worker.fetch(post(good), env({ BURST: { limit: async () => ({ success: false }) } }));
    assert.equal(res.status, 429);
    assert.equal(kv.store.size, 0);
});

test('a failing burst binding falls back to the KV counters', async () => {
    const res = await worker.fetch(post(good), env({ BURST: { limit: async () => { throw new Error('down'); } } }));
    assert.equal(res.status, 200);
});

test('a Resend timeout answers 504 with an error body', async () => {
    globalThis.fetch = (async () => {
        throw new DOMException('timed out', 'TimeoutError');
    }) as any;
    const res = await worker.fetch(post(good), env());
    assert.equal(res.status, 504);
    assert.ok((await res.json()).error);
});

test('a Resend failure answers 502 without echoing the provider', async () => {
    globalThis.fetch = (async () => new Response('{"account":"secret"}', { status: 500 })) as any;
    const res = await worker.fetch(post(good), env());
    assert.equal(res.status, 502);
    assert.doesNotMatch(await res.text(), /secret/);
});

test('the honeypot is answered 200 and dropped', async () => {
    const res = await worker.fetch(post({ ...good, website: 'http://spam' }), env());
    assert.equal(res.status, 200);
    assert.equal(sent.length, 0);
});

test('buildEmail escapes HTML', () => {
    const { html } = buildEmail({ category: 'bug', message: '<script>x</script>' } as any);
    assert.doesNotMatch(html, /<script>/);
});
