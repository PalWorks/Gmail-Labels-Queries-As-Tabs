/**
 * @jest-environment node
 */
export {};
/**
 * canaryNotify.test.ts
 *
 * The Google Chat alert the drift canary sends. Run as a real process against
 * a local server, because what matters is the whole path: which webhook is
 * accepted, what is posted, what is retried, and that the webhook itself is
 * never printed. A webhook URL is a credential.
 */

import { spawn } from 'child_process';
import * as http from 'http';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

const SCRIPT = path.join(__dirname, '..', 'scripts', 'canary', 'notify.mjs');

interface Received {
    url: string;
    body: any;
}

function server(statuses: number[]): Promise<{ port: number; received: Received[]; close: () => void }> {
    const received: Received[] = [];
    return new Promise((resolve) => {
        const s = http.createServer((req, res) => {
            let data = '';
            req.on('data', (c) => (data += c));
            req.on('end', () => {
                received.push({ url: req.url ?? '', body: JSON.parse(data || '{}') });
                res.statusCode = statuses[Math.min(received.length - 1, statuses.length - 1)];
                res.end('{}');
            });
        });
        s.listen(0, '127.0.0.1', () => {
            const port = (s.address() as { port: number }).port;
            resolve({ port, received, close: () => s.close() });
        });
    });
}

function run(args: string[], env: Record<string, string>): Promise<{ code: number; out: string }> {
    return new Promise((resolve) => {
        // HOME points somewhere empty so a real alerts.env on this machine can
        // never be read, let alone posted to, by a test.
        const home = fs.mkdtempSync(path.join(os.tmpdir(), 'glt-notify-'));
        const child = spawn(process.execPath, [SCRIPT, ...args], {
            env: { PATH: process.env.PATH ?? '', HOME: home, GLT_ALERTS_BACKOFF_MS: '10,10', ...env },
        });
        let out = '';
        child.stdout.on('data', (d) => (out += d));
        child.stderr.on('data', (d) => (out += d));
        child.on('close', (code) => {
            fs.rmSync(home, { recursive: true, force: true });
            resolve({ code: code ?? -1, out });
        });
    });
}

const hook = (port: number) => `http://127.0.0.1:${port}/v1/spaces/AAA/messages?key=SECRETKEY&token=SECRETTOKEN`;

describe('the Google Chat alert', () => {
    test('is posted once, threaded, with the event and title up front', async () => {
        const s = await server([200]);
        const r = await run(['--event', 'FAIL', '--title', 'the label menu contract broke', '--body', 'C2: no menu', '--thread', 'label-menu'], {
            GCHAT_WEBHOOK_URL: hook(s.port),
            GLT_ALERTS_ALLOW_LOCAL: '1',
        });
        s.close();
        expect(r.code).toBe(0);
        expect(s.received).toHaveLength(1);
        expect(s.received[0].body.text).toMatch(/^\*\[FAIL\] Gmail Labels as Tabs: the label menu contract broke\*/);
        expect(s.received[0].body.text).toContain('C2: no menu');
        expect(s.received[0].body.thread).toEqual({ threadKey: 'label-menu' });
        expect(s.received[0].url).toContain('messageReplyOption=REPLY_MESSAGE_FALLBACK_TO_NEW_THREAD');
    });

    test('a server error is retried, and a success ends the retries', async () => {
        const s = await server([500, 503, 200]);
        const r = await run(['--event', 'ERROR', '--title', 't'], { GCHAT_WEBHOOK_URL: hook(s.port), GLT_ALERTS_ALLOW_LOCAL: '1' });
        s.close();
        expect(r.code).toBe(0);
        expect(s.received).toHaveLength(3);
    });

    test('a rejected webhook is not retried, and the failure is the exit code', async () => {
        const s = await server([404]);
        const r = await run(['--event', 'ERROR', '--title', 't'], { GCHAT_WEBHOOK_URL: hook(s.port), GLT_ALERTS_ALLOW_LOCAL: '1' });
        s.close();
        expect(r.code).toBe(2);
        expect(s.received).toHaveLength(1);
    });

    test('the webhook never appears in the output, success or failure', async () => {
        const s = await server([404]);
        const r = await run(['--event', 'ERROR', '--title', 't'], { GCHAT_WEBHOOK_URL: hook(s.port), GLT_ALERTS_ALLOW_LOCAL: '1' });
        s.close();
        expect(r.out).not.toMatch(/SECRETKEY|SECRETTOKEN/);
    });

    test('with nothing configured it says so and exits 3, which is not a failure', async () => {
        const r = await run(['--event', 'FAIL', '--title', 't'], {});
        expect(r.code).toBe(3);
        expect(r.out).toContain('no Google Chat webhook configured');
    });

    test('only a Google Chat webhook is accepted', async () => {
        const s = await server([200]);
        // Local is admitted only with the explicit test switch.
        const r1 = await run(['--event', 'FAIL', '--title', 't'], { GCHAT_WEBHOOK_URL: hook(s.port) });
        const r2 = await run(['--event', 'FAIL', '--title', 't'], {
            GCHAT_WEBHOOK_URL: 'https://example.com/v1/spaces/AAA/messages?key=k',
        });
        s.close();
        expect(r1.code).toBe(3);
        expect(r2.code).toBe(3);
        expect(s.received).toHaveLength(0);
    });

    test('a dry run prints the payload and sends nothing', async () => {
        const r = await run(['--event', 'DEGRADED', '--title', 'a fallback held', '--dry-run'], {});
        expect(r.code).toBe(0);
        expect(JSON.parse(r.out).text).toContain('[DEGRADED]');
    });

    test('an unknown event is refused rather than sent', async () => {
        const r = await run(['--event', 'HELLO', '--title', 't', '--dry-run'], {});
        expect(r.code).toBe(2);
    });
});
