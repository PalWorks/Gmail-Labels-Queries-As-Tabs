// SPDX-License-Identifier: AGPL-3.0-only
/**
 * accounts.mjs
 *
 * Which Google account the drift canary measures, and in what order it tries
 * the places it might find one.
 *
 * Why this exists: from 2026-10-29 the canary reported "a Gmail contract
 * broke" every night for three weeks, and Gmail had changed nothing. A
 * different Google account had been added to the first Chrome profile it
 * copies, so /mail/u/0 opened a mailbox with no user labels, there was no
 * label menu to open, and C1 to HOVER failed in a cascade. The same night, the
 * same extension passed every check against the account it was meant to watch.
 * A canary that measures whichever account happens to be first is measuring
 * the wrong thing the day someone signs in to another one.
 *
 * So the account is configured, not discovered: CANARY_ACCOUNT (or --account)
 * names one or more addresses, in order of preference. It lives in
 * ~/.config/gmail-labels-as-tabs/alerts.env, outside the repository, because
 * an address is personal and this repository is public. For the same reason
 * the canary's output never prints an address: it says "account 1 of 2".
 *
 * Pure functions only, so they can be tested without a browser.
 */

/** One or more addresses, separated by commas, colons, semicolons or spaces. */
export function parseAccounts(value) {
    if (!value) return [];
    const seen = new Set();
    const out = [];
    for (const raw of String(value).split(/[\s,;:]+/)) {
        const a = raw.trim().toLowerCase();
        if (!a || seen.has(a)) continue;
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(a)) throw new Error(`not an email address: entry ${out.length + 1} of CANARY_ACCOUNT`);
        seen.add(a);
        out.push(a);
    }
    return out;
}

/**
 * Where to open Gmail. `authuser` makes Gmail open that account's mailbox
 * whatever its /u/N index is in the profile, which differs from profile to
 * profile and changes when an account is added. With no account, /u/0, as
 * before.
 */
export function gmailUrl(account) {
    return account
        ? `https://mail.google.com/mail/?authuser=${encodeURIComponent(account)}#inbox`
        : 'https://mail.google.com/mail/u/0/#inbox';
}

/**
 * Every (account, profile) pair to try, account first: the preferred account
 * is tried in every profile before the next account is tried in any. With no
 * account configured, one entry per profile with account null.
 */
export function candidates(accounts, profiles) {
    const list = accounts.length ? accounts : [null];
    const out = [];
    list.forEach((account, i) => {
        for (const profile of profiles) out.push({ account, accountIndex: account ? i + 1 : 0, profile });
    });
    return out;
}

/** How an account is named in output that may end up in a public issue. */
export function accountLabel(index, total) {
    return index ? `account ${index} of ${total}` : 'the first signed-in account (/u/0; no CANARY_ACCOUNT set)';
}

/**
 * Which account Gmail actually opened. Gmail puts the address in the page
 * title ("Inbox (3) - someone@example.com - Gmail") and in GLOBALS[10]. Either
 * is enough; neither is a contract, so an unknown answer is not a mismatch.
 */
export function observedAccount(title, globals10) {
    if (typeof globals10 === 'string' && globals10.includes('@')) return globals10.trim().toLowerCase();
    const m = /([^\s@<>()"]+@[^\s@<>()"]+\.[^\s@<>()"]+)/.exec(title || '');
    return m ? m[1].toLowerCase() : null;
}

/**
 * Whether the mailbox that opened is the one asked for. True when no account
 * was asked for, and when Gmail did not say which account it is.
 */
export function isExpectedAccount(expected, observed) {
    if (!expected || !observed) return true;
    return expected.toLowerCase() === observed.toLowerCase();
}
