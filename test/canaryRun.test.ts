/**
 * @jest-environment node
 */
export {};
/**
 * canaryRun.test.ts
 *
 * The escalation in run-canary.sh: who is told, when, and in which thread.
 *
 * Run for real in a sandbox: a copy of the script next to a fake canary whose
 * exit code each test chooses, the real notify.mjs posting to a local server,
 * and stub `gh` and `notify-send` first on the PATH so a test can never open a
 * real issue or pop a real notification.
 */

import { spawn } from 'child_process';
import * as fs from 'fs';
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';

const CANARY_DIR = path.join(__dirname, '..', 'scripts', 'canary');

interface Sandbox {
    root: string;
    home: string;
    bin: string;
    posts: any[];
    close: () => void;
    run: (canaryExit: number, extraEnv?: Record<string, string>) => Promise<number>;
    state: () => any;
    calls: (tool: string) => string[];
}

async function sandbox(): Promise<Sandbox> {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'glt-run-'));
    const dir = path.join(root, 'scripts', 'canary');
    const home = path.join(root, 'home');
    const bin = path.join(root, 'bin');
    fs.mkdirSync(dir, { recursive: true });
    fs.mkdirSync(path.join(home, '.config', 'gmail-labels-as-tabs'), { recursive: true });
    fs.mkdirSync(bin);
    fs.copyFileSync(path.join(CANARY_DIR, 'run-canary.sh'), path.join(dir, 'run-canary.sh'));
    fs.copyFileSync(path.join(CANARY_DIR, 'notify.mjs'), path.join(dir, 'notify.mjs'));
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ scripts: { build: 'true' } }));
    fs.writeFileSync(
        path.join(dir, 'gmail-drift-canary.mjs'),
        `console.log('fake canary'); process.exit(Number(process.env.FAKE_EXIT));\n`
    );
    fs.writeFileSync(
        path.join(dir, 'propose-selectors.mjs'),
        `console.log('https://github.com/example/pull/7'); process.exit(0);\n`
    );
    for (const tool of ['gh', 'notify-send']) {
        const stub = path.join(bin, tool);
        fs.writeFileSync(stub, `#!/bin/sh\necho "$@" >> "${root}/${tool}.calls"\n`);
        fs.chmodSync(stub, 0o755);
    }
    const npm = path.join(bin, 'npm');
    fs.writeFileSync(npm, '#!/bin/sh\n[ "$1" = root ] && exit 1\nexit 0\n');
    fs.chmodSync(npm, 0o755);

    const posts: any[] = [];
    const server = http.createServer((req, res) => {
        let data = '';
        req.on('data', (c) => (data += c));
        req.on('end', () => {
            posts.push(JSON.parse(data));
            res.end('{}');
        });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
    const port = (server.address() as { port: number }).port;

    // Asynchronous on purpose: the mock server lives in this process, and a
    // synchronous child would block the very event loop it has to answer on.
    const run = (canaryExit: number, extraEnv: Record<string, string> = {}): Promise<number> =>
        new Promise((resolve) => {
            const child = spawn('bash', [path.join(dir, 'run-canary.sh')], {
                env: {
                    PATH: `${bin}:${path.dirname(process.execPath)}:/usr/bin:/bin`,
                    HOME: home,
                    FAKE_EXIT: String(canaryExit),
                    GCHAT_WEBHOOK_URL: `http://127.0.0.1:${port}/v1/spaces/T/messages?key=k&token=t`,
                    GLT_ALERTS_ALLOW_LOCAL: '1',
                    GLT_ALERTS_BACKOFF_MS: '10,10',
                    ...extraEnv,
                },
                stdio: 'ignore',
            });
            child.on('close', (code) => resolve(code ?? -1));
        });

    return {
        root,
        home,
        bin,
        posts,
        close: () => {
            server.close();
            fs.rmSync(root, { recursive: true, force: true });
        },
        run,
        state: () => JSON.parse(fs.readFileSync(path.join(dir, 'state.json'), 'utf8')),
        calls: (tool) => {
            const f = path.join(root, `${tool}.calls`);
            return fs.existsSync(f) ? fs.readFileSync(f, 'utf8').trim().split('\n') : [];
        },
    };
}

const events = (posts: any[]) => posts.map((p) => `${p.text.match(/^\*\[(\w+)\]/)?.[1]}:${p.thread?.threadKey}`);

let sb: Sandbox;
beforeEach(async () => {
    sb = await sandbox();
});
afterEach(() => sb.close());

describe('run-canary.sh escalation', () => {
    test('one failure tells nobody; the second tells Google Chat, the desktop and GitHub', async () => {
        expect(await sb.run(2)).toBe(2);
        expect(sb.posts).toHaveLength(0);
        expect(sb.calls('gh')).toHaveLength(0);

        expect(await sb.run(2)).toBe(2);
        expect(events(sb.posts)).toEqual(['FAIL:canary-fail']);
        expect(sb.calls('notify-send')).toHaveLength(1);
        expect(sb.calls('gh').some((c) => c.startsWith('issue create'))).toBe(true);
        expect(sb.state()).toMatchObject({ failStreak: 2, lastVerdict: 'FAIL' });
    });

    test('a third failure in a row is not announced again', async () => {
        await sb.run(2);
        await sb.run(2);
        await sb.run(2);
        expect(events(sb.posts)).toEqual(['FAIL:canary-fail']);
    });

    test('a pass after an announced break says so, in the same thread', async () => {
        await sb.run(2);
        await sb.run(2);
        expect(await sb.run(0)).toBe(0);
        expect(events(sb.posts)).toEqual(['FAIL:canary-fail', 'RECOVERED:canary-fail']);
        expect(sb.state()).toMatchObject({ failStreak: 0, errorStreak: 0, degradedStreak: 0 });
    });

    test('a pass after an unannounced blip says nothing', async () => {
        await sb.run(2);
        await sb.run(0);
        expect(sb.posts).toHaveLength(0);
    });

    test('a skip neither breaks nor mends a streak', async () => {
        await sb.run(2);
        await sb.run(3);
        expect(sb.state()).toMatchObject({ failStreak: 1, lastVerdict: 'SKIPPED' });
        await sb.run(2);
        expect(events(sb.posts)).toEqual(['FAIL:canary-fail']);
    });

    test('degraded twice is a warning in its own thread', async () => {
        expect(await sb.run(5)).toBe(5);
        expect(sb.posts).toHaveLength(0);
        await sb.run(5);
        expect(events(sb.posts)).toEqual(['DEGRADED:canary-degraded']);
        // A warning, not a break: no GitHub issue.
        expect(sb.calls('gh')).toHaveLength(0);
    });

    test('a selector proposal becomes a pull request only when auto-PR is switched on', async () => {
        fs.writeFileSync(path.join(sb.root, 'scripts', 'canary', 'selector-proposal.json'), '{"selectors":{}}');
        await sb.run(5);
        expect(events(sb.posts)).toEqual([]);

        fs.writeFileSync(path.join(sb.home, '.config', 'gmail-labels-as-tabs', 'alerts.env'), 'GLT_CANARY_AUTO_PR=1\n');
        await sb.run(5);
        expect(events(sb.posts)).toEqual(['DEGRADED:canary-degraded', 'PROPOSAL:canary-degraded']);
        expect(sb.posts[1].text).toContain('https://github.com/example/pull/7');
    });

    test('errors escalate as the canary’s own problem, not Gmail’s', async () => {
        await sb.run(4);
        await sb.run(4);
        expect(events(sb.posts)).toEqual(['ERROR:canary-error']);
    });

    test('with no webhook configured the run still completes and still escalates elsewhere', async () => {
        await sb.run(2, { GCHAT_WEBHOOK_URL: '' });
        expect(await sb.run(2, { GCHAT_WEBHOOK_URL: '' })).toBe(2);
        expect(sb.posts).toHaveLength(0);
        expect(sb.calls('notify-send')).toHaveLength(1);
    });
});
