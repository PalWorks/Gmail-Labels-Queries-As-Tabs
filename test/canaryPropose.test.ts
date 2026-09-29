/**
 * @jest-environment node
 */
export {};
/**
 * canaryPropose.test.ts
 *
 * The part of the selector refresh that runs unattended and writes into a
 * selector the extension runs on every Gmail page. What it may write is held
 * to a whitelist, and how it writes is held to "exactly once, or not at all".
 * The scripts are ES modules, so they are imported in a child process.
 */

import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const SCRIPT = path.join(__dirname, '..', 'scripts', 'canary', 'propose-selectors.mjs');
const REGISTRY = fs.readFileSync(path.join(__dirname, '..', 'src', 'utils', 'selectors.ts'), 'utf8');

function call(fn: string, ...args: unknown[]): any {
    const code = `import(${JSON.stringify(SCRIPT)}).then((m) => {
        try { process.stdout.write(JSON.stringify({ ok: m.${fn}(...${JSON.stringify(args)}) })); }
        catch (e) { process.stdout.write(JSON.stringify({ error: e.message })); }
    });`;
    return JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8' }));
}

describe('what a proposal may change', () => {
    test('the two sender fallbacks, as plain class selectors, are accepted', () => {
        expect(call('validateProposal', { selectors: { SENDER_ROW_FALLBACK: 'tr.zB', SENDER_SUBJECT_FALLBACK: '.yZ' } }).ok).toEqual([]);
    });

    test.each([
        [{ SENDER_ROW_FALLBACK: 'tr.zB, script' }],
        [{ SENDER_ROW_FALLBACK: '.zB' }],
        [{ SENDER_SUBJECT_FALLBACK: '.a b' }],
        [{ SENDER_SUBJECT_FALLBACK: '[onclick]' }],
        [{ TOOLBAR_SELECTORS: '.G-atb' }],
        [{}],
    ])('%p is refused', (selectors) => {
        expect(call('validateProposal', { selectors }).ok.length).toBeGreaterThan(0);
    });
});

describe('how a proposal is applied', () => {
    test('each constant is rewritten in place and nothing else moves', () => {
        const next: string = call('applyProposal', REGISTRY, { SENDER_ROW_FALLBACK: 'tr.zB' }).ok;
        expect(next).toContain("export const SENDER_ROW_FALLBACK = 'tr.zB';");
        expect(next.replace("'tr.zB'", "'X'")).toBe(REGISTRY.replace(/SENDER_ROW_FALLBACK = '[^']*'/, "SENDER_ROW_FALLBACK = 'X'"));
    });

    test('a registry where the constant is missing, or appears twice, is left alone', () => {
        expect(call('applyProposal', 'nothing here', { SENDER_ROW_FALLBACK: 'tr.zB' }).error).toMatch(/appears 0 times/);
        const twice = REGISTRY + "\nexport const SENDER_ROW_FALLBACK = 'tr.old';\n";
        expect(call('applyProposal', twice, { SENDER_ROW_FALLBACK: 'tr.zB' }).error).toMatch(/appears 2 times/);
    });

    test('the same proposal always names the same branch, and a different one another', () => {
        const a = call('branchFor', { SENDER_ROW_FALLBACK: 'tr.zB', SENDER_SUBJECT_FALLBACK: '.yZ' }).ok;
        const b = call('branchFor', { SENDER_SUBJECT_FALLBACK: '.yZ', SENDER_ROW_FALLBACK: 'tr.zB' }).ok;
        const c = call('branchFor', { SENDER_ROW_FALLBACK: 'tr.zC' }).ok;
        expect(a).toBe(b);
        expect(a).not.toBe(c);
        expect(a).toMatch(/^canary\/sender-selectors-[0-9a-f]{10}$/);
    });
});

describe('the canary reads what the extension ships', () => {
    const canary = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'canary', 'gmail-drift-canary.mjs'), 'utf8');

    test('the fallbacks are read from the registry, not copied', () => {
        expect(canary).toContain("export const ${name}");
        expect(canary).not.toMatch(/'tr\.zA'|'\.xT'/);
        expect(REGISTRY).toMatch(/export const SENDER_ROW_FALLBACK = '[^']+'/);
        expect(REGISTRY).toMatch(/export const SENDER_SUBJECT_FALLBACK = '[^']+'/);
    });

    test('the favicon endpoints are read from the module, not copied', () => {
        const senderIcons = fs.readFileSync(path.join(__dirname, '..', 'src', 'modules', 'senderIcons.ts'), 'utf8');
        expect(senderIcons).toContain('const FAVICON_PROVIDERS');
        expect(canary).toContain("indexOf('const FAVICON_PROVIDERS')");
        expect(canary).not.toContain('t0.gstatic.com');
    });
});
