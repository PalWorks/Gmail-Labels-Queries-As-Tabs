/**
 * propose-selectors.mjs
 *
 * Turns a selector proposal from the drift canary into a pull request.
 *
 * The canary writes selector-proposal.json only in one situation: a shipped
 * fallback in src/utils/selectors.ts has stopped matching, while the ARIA path
 * it backs up still works. That is the one case where the right new value is
 * known rather than guessed, because it is whatever Gmail calls, today, the
 * very elements the ARIA path found. This script puts that value into the
 * registry on a branch, runs the tests that exercise it, and opens a pull
 * request. It never merges. A person reads the diff and decides.
 *
 * It never touches the working tree you are using: the change is made in a
 * throwaway `git worktree`, which is removed afterwards whatever happens.
 *
 *   node scripts/canary/propose-selectors.mjs [--proposal <file>] [--dry-run]
 *
 *   --dry-run   make the change and run the tests in the worktree, print the
 *               diff, and stop before committing, pushing or opening anything
 *   --base <ref>  what to branch from (default origin/main, else main)
 *
 * Prints the pull request URL on success. Exit codes: 0 opened (or, with
 * --dry-run, verified), 1 nothing to do (no proposal, or already proposed),
 * 2 refused (a value that is not a plain class selector) or failed.
 */

import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const REGISTRY = path.join('src', 'utils', 'selectors.ts');
const REMOTE_REPO = 'PalWorks/Gmail-Labels-Queries-As-Tabs';

/**
 * The only keys a proposal may carry, each with the only shape its value may
 * take. Anything else is refused: this runs unattended, and what it writes
 * lands in a selector the extension runs on every Gmail page.
 */
export const ALLOWED = {
    SENDER_ROW_FALLBACK: /^tr\.[A-Za-z_][A-Za-z0-9_-]{0,40}$/,
    SENDER_SUBJECT_FALLBACK: /^\.[A-Za-z_][A-Za-z0-9_-]{0,40}$/,
};

/** Check a proposal, returning the problems with it (none means usable). */
export function validateProposal(proposal) {
    const problems = [];
    const selectors = proposal?.selectors;
    if (!selectors || typeof selectors !== 'object' || Object.keys(selectors).length === 0) {
        return ['no selectors in the proposal'];
    }
    for (const [key, value] of Object.entries(selectors)) {
        if (!(key in ALLOWED)) problems.push(`${key} is not a selector this script may change`);
        else if (typeof value !== 'string' || !ALLOWED[key].test(value)) problems.push(`${key}: ${JSON.stringify(value)} is not a plain class selector`);
    }
    return problems;
}

/**
 * Rewrite the registry source with the proposed values. Each constant must
 * appear exactly once, or nothing is changed: a registry that has been
 * restructured since this was written needs a person, not a regex.
 */
export function applyProposal(source, selectors) {
    let next = source;
    for (const [key, value] of Object.entries(selectors)) {
        const re = new RegExp(`(export const ${key}\\s*=\\s*)'[^']*'`, 'g');
        const hits = next.match(re) ?? [];
        if (hits.length !== 1) throw new Error(`${key} appears ${hits.length} times in ${REGISTRY}, expected once`);
        next = next.replace(re, `$1'${value}'`);
    }
    return next;
}

/** One branch per distinct proposal, so a persisting drift opens one PR, not one a day. */
export function branchFor(selectors) {
    const canonical = JSON.stringify(Object.keys(selectors).sort().map((k) => [k, selectors[k]]));
    return `canary/sender-selectors-${crypto.createHash('sha256').update(canonical).digest('hex').slice(0, 10)}`;
}

function openPullRequest(branch, proposal, detail) {
    const body = [
        'The drift canary found a sender icons fallback in `src/utils/selectors.ts` that no longer matches Gmail,',
        'while the ARIA path it backs up still works. Nothing is broken on screen; this keeps the fallback',
        'able to hold if an ARIA attribute ever goes missing.',
        '',
        `Observed ${proposal.observedAt} on Gmail build \`${proposal.gmailBuild ?? 'unknown'}\`.`,
        '',
        detail,
        '',
        'Made by `scripts/canary/propose-selectors.mjs`. `test/senderIcons.test.ts` and',
        '`test/repoConsistency.test.ts` pass with the change. It is not merged automatically.',
    ].join('\n');
    return execFileSync(
        'gh',
        ['pr', 'create', '--repo', REMOTE_REPO, '--base', 'main', '--head', branch, '--title', 'Refresh sender icon fallbacks (drift canary)', '--body', body],
        { cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
    ).trim();
}

function git(args, cwd = REPO) {
    return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function arg(name, fallback) {
    const i = process.argv.indexOf(name);
    return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

async function main() {
    const dryRun = process.argv.includes('--dry-run');
    const file = arg('--proposal', path.join(HERE, 'selector-proposal.json'));
    if (!fs.existsSync(file)) {
        console.error('propose: no proposal; nothing to do');
        return 1;
    }
    const proposal = JSON.parse(fs.readFileSync(file, 'utf8'));
    const problems = validateProposal(proposal);
    if (problems.length) {
        console.error(`propose: refused:\n  ${problems.join('\n  ')}`);
        return 2;
    }

    const branch = branchFor(proposal.selectors);
    if (!dryRun) {
        // Already proposed, in any state. An open one is waiting for review;
        // a closed one was a person saying no, and asking again every day
        // would be the canary arguing with them.
        let existing;
        try {
            existing = execFileSync(
                'gh',
                ['pr', 'list', '--repo', REMOTE_REPO, '--head', branch, '--state', 'all', '--json', 'url,state', '--limit', '1'],
                { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
            );
        } catch {
            console.error('propose: could not ask GitHub for existing pull requests; not proposing');
            return 2;
        }
        const [pr] = JSON.parse(existing || '[]');
        if (pr) {
            console.error(`propose: already proposed (${pr.state.toLowerCase()}): ${pr.url}`);
            return 1;
        }
        // Pushed on an earlier run whose pull request could not be opened:
        // open it now rather than leaving the branch stranded forever.
        let pushed = false;
        try {
            pushed = Boolean(git(['ls-remote', '--heads', 'origin', branch]));
        } catch {
            console.error('propose: could not reach origin; not proposing');
            return 2;
        }
        if (pushed) {
            try {
                console.log(openPullRequest(branch, proposal, '(the branch was pushed on an earlier run)'));
                return 0;
            } catch (err) {
                console.error(`propose: could not open the pull request for ${branch}: ${err.message}`);
                return 2;
            }
        }
    }

    // Base the change on the remote main when it can be fetched, so the PR is
    // against what is actually there; otherwise on the local main.
    let base = arg('--base', null);
    if (!base) {
        base = 'main';
        try {
            git(['fetch', '--quiet', 'origin', 'main']);
            base = 'origin/main';
        } catch {
            /* offline: the local main is the best available base */
        }
    }

    const tree = fs.mkdtempSync(path.join(os.tmpdir(), 'glt-propose-'));
    let code = 2;
    try {
        git(['worktree', 'add', '--quiet', '-b', branch, tree, base]);
        const target = path.join(tree, REGISTRY);
        const before = fs.readFileSync(target, 'utf8');
        const after = applyProposal(before, proposal.selectors);
        if (after === before) {
            console.error('propose: the registry already holds these values; nothing to do');
            code = 1;
            return code;
        }
        fs.writeFileSync(target, after);

        // The tests that exercise the fallbacks, run against the change.
        fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(tree, 'node_modules'), 'dir');
        execFileSync('npx', ['jest', '--silent', 'test/senderIcons.test.ts', 'test/repoConsistency.test.ts'], {
            cwd: tree,
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        const diff = git(['diff', '--', REGISTRY], tree);

        if (dryRun) {
            console.log(diff);
            console.error('propose: dry run; tests pass with the change, nothing committed or pushed');
            code = 0;
            return code;
        }

        const values = Object.entries(proposal.selectors).map(([k, v]) => `${k} = '${v}'`).join(', ');
        git(['add', REGISTRY], tree);
        git(['commit', '--quiet', '-m', `fix(selectors): refresh sender icon fallbacks from the drift canary\n\n${values}`], tree);
        git(['push', '--quiet', '-u', 'origin', branch], tree);
        // Pushed: if opening the pull request fails now, the next run finds
        // the branch on origin and opens it then (see above).
        console.log(openPullRequest(branch, proposal, '```diff\n' + diff + '\n```'));
        code = 0;
        return code;
    } catch (err) {
        const detail = err.stderr?.toString?.() || err.stdout?.toString?.() || err.message;
        console.error(`propose: failed: ${detail.split('\n').slice(0, 20).join('\n')}`);
        return code;
    } finally {
        try {
            git(['worktree', 'remove', '--force', tree]);
        } catch {
            fs.rmSync(tree, { recursive: true, force: true });
        }
        // The local branch is never left behind in the repository you work
        // in: once pushed, origin holds it; if never pushed, nothing does.
        try {
            git(['branch', '-D', branch]);
        } catch {
            /* never created */
        }
    }
}

if (import.meta.url === `file://${process.argv[1]}`) {
    main().then((code) => process.exit(code));
}
