/**
 * @jest-environment node
 */
export {};
/**
 * canaryAccounts.test.ts
 *
 * Which Google account the drift canary measures (scripts/canary/accounts.mjs).
 * From 2026-10-29 the canary reported a Gmail break for three weeks because it
 * measured whichever account was first in a Chrome profile, and a label-less
 * account had been added there. These pin the rules that stop that recurring.
 *
 * accounts.mjs is an ES module, which ts-jest's CommonJS runtime cannot
 * import, so each case runs in a real node process, as canaryNotify does.
 */

import { execFileSync } from 'child_process';
import * as path from 'path';

const MODULE = path.join(__dirname, '..', 'scripts', 'canary', 'accounts.mjs');

function call(fn: string, ...args: unknown[]): any {
    const src =
        `import * as m from ${JSON.stringify('file://' + MODULE)};` +
        `try { console.log(JSON.stringify({ ok: m[${JSON.stringify(fn)}](...${JSON.stringify(args)}) })); }` +
        `catch (e) { console.log(JSON.stringify({ error: e.message })); }`;
    return JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', src], { encoding: 'utf8' }));
}

describe('parseAccounts', () => {
    it('reads one or more addresses in order, lower-cased and without duplicates', () => {
        expect(call('parseAccounts', 'A@x.com, b@y.org;a@x.com:c@z.io').ok).toEqual(['a@x.com', 'b@y.org', 'c@z.io']);
    });

    it('treats an empty or missing value as no account configured', () => {
        expect(call('parseAccounts', '').ok).toEqual([]);
        expect(call('parseAccounts', null).ok).toEqual([]);
    });

    it('rejects something that is not an address, without echoing it', () => {
        const r = call('parseAccounts', 'a@x.com,not-an-address');
        expect(r.error).toMatch(/entry 2/);
        expect(r.error).not.toContain('not-an-address');
    });
});

describe('gmailUrl', () => {
    it('opens a configured account by authuser, whatever its /u/N index', () => {
        expect(call('gmailUrl', 'a+b@x.com').ok).toBe('https://mail.google.com/mail/?authuser=a%2Bb%40x.com#inbox');
    });

    it('falls back to /u/0 when no account is configured', () => {
        expect(call('gmailUrl', null).ok).toBe('https://mail.google.com/mail/u/0/#inbox');
    });
});

describe('candidates', () => {
    it('tries the preferred account in every profile before the next account', () => {
        expect(call('candidates', ['a@x.com', 'b@x.com'], ['/p1', '/p2']).ok).toEqual([
            { account: 'a@x.com', accountIndex: 1, profile: '/p1' },
            { account: 'a@x.com', accountIndex: 1, profile: '/p2' },
            { account: 'b@x.com', accountIndex: 2, profile: '/p1' },
            { account: 'b@x.com', accountIndex: 2, profile: '/p2' },
        ]);
    });

    it('is one entry per profile when no account is configured', () => {
        expect(call('candidates', [], ['/p1', '/p2']).ok).toEqual([
            { account: null, accountIndex: 0, profile: '/p1' },
            { account: null, accountIndex: 0, profile: '/p2' },
        ]);
    });
});

describe('accountLabel', () => {
    it('names an account by position, never by address', () => {
        expect(call('accountLabel', 2, 3).ok).toBe('account 2 of 3');
        expect(call('accountLabel', 0, 0).ok).toMatch(/\/u\/0/);
    });
});

describe('observedAccount and isExpectedAccount', () => {
    it('reads the address from GLOBALS[10], else from the page title', () => {
        expect(call('observedAccount', 'Inbox - x@y.com - Gmail', 'Me@Example.com').ok).toBe('me@example.com');
        expect(call('observedAccount', 'Inbox (3) - Me@Example.com - Gmail', null).ok).toBe('me@example.com');
        expect(call('observedAccount', 'Gmail', null).ok).toBeNull();
    });

    it('rejects a different mailbox, and accepts when nothing was asked or nothing is known', () => {
        expect(call('isExpectedAccount', 'a@x.com', 'b@x.com').ok).toBe(false);
        expect(call('isExpectedAccount', 'a@x.com', 'A@X.com').ok).toBe(true);
        expect(call('isExpectedAccount', null, 'b@x.com').ok).toBe(true);
        expect(call('isExpectedAccount', 'a@x.com', null).ok).toBe(true);
    });
});
