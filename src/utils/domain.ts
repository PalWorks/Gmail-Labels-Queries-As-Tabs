/**
 * domain.ts
 *
 * Turning a sender's address into the name of the organisation behind it.
 *
 * `alerts@email.mashreq.com` is from Mashreq, and the chip should say
 * `mashreq.com`. `billing@icici.bank.in` is from ICICI, and the chip should
 * say `icici.bank.in`, not `bank.in`. The difference is whether the part
 * before the last label is a registry of its own (`bank.in`, `com.au`,
 * `co.uk`) or just a name someone registered.
 *
 * The complete answer is the Public Suffix List, which is about 250 KB and
 * changes weekly. This is the short version: the second-level registries that
 * appear in real mail often enough to matter, measured against a real inbox
 * on 2026-09-29. A suffix missing from the list costs a slightly longer chip
 * (`mail.example.co.xx` instead of `example.co.xx`), never a wrong one, so the
 * failure mode is cosmetic and the list can grow when someone notices.
 */

/**
 * Second-level labels that are registries, keyed by country code.
 *
 * Only ccTLDs whose registries sell names at the third level. A country
 * missing here is treated like `.com`: the last two labels are the domain.
 */
const SECOND_LEVEL_REGISTRIES: Record<string, readonly string[]> = {
    ae: ['ac', 'co', 'gov', 'net', 'org', 'sch'],
    ar: ['com', 'gob', 'net', 'org'],
    au: ['asn', 'com', 'edu', 'gov', 'id', 'net', 'org'],
    bd: ['com', 'edu', 'gov', 'net', 'org'],
    br: ['com', 'edu', 'gov', 'net', 'org'],
    cn: ['ac', 'com', 'edu', 'gov', 'net', 'org'],
    co: ['com', 'edu', 'gov', 'net', 'org'],
    eg: ['com', 'edu', 'gov', 'net', 'org'],
    gh: ['com', 'edu', 'gov', 'org'],
    hk: ['com', 'edu', 'gov', 'net', 'org'],
    id: ['ac', 'co', 'go', 'or', 'web'],
    il: ['ac', 'co', 'gov', 'org'],
    in: ['ac', 'bank', 'co', 'edu', 'fin', 'firm', 'gen', 'gov', 'ind', 'net', 'nic', 'org', 'res'],
    jp: ['ac', 'co', 'go', 'ne', 'or'],
    ke: ['ac', 'co', 'go', 'or'],
    kr: ['ac', 'co', 'go', 'or'],
    lk: ['com', 'edu', 'gov', 'org'],
    mx: ['com', 'edu', 'gob', 'net', 'org'],
    my: ['com', 'edu', 'gov', 'net', 'org'],
    ng: ['com', 'edu', 'gov', 'org'],
    np: ['com', 'edu', 'gov', 'org'],
    nz: ['ac', 'co', 'govt', 'net', 'org', 'school'],
    om: ['co', 'com', 'gov', 'net', 'org'],
    pe: ['com', 'edu', 'gob', 'org'],
    ph: ['com', 'edu', 'gov', 'net', 'org'],
    pk: ['com', 'edu', 'gov', 'net', 'org'],
    qa: ['com', 'edu', 'gov', 'net', 'org'],
    sa: ['com', 'edu', 'gov', 'net', 'org'],
    sg: ['com', 'edu', 'gov', 'net', 'org'],
    th: ['ac', 'co', 'go', 'in', 'or'],
    tr: ['com', 'edu', 'gov', 'net', 'org'],
    tw: ['com', 'edu', 'gov', 'net', 'org'],
    ua: ['com', 'edu', 'gov', 'net', 'org'],
    uk: ['ac', 'co', 'gov', 'ltd', 'me', 'net', 'nhs', 'org', 'plc', 'sch'],
    vn: ['com', 'edu', 'gov', 'net', 'org'],
    za: ['ac', 'co', 'gov', 'net', 'org'],
};

/**
 * Mailbox providers, where the domain says who hosts the address and nothing
 * about who is writing. Thirty of forty-three rows in the inbox this was
 * measured against were `gmail.com`, so treating these like any other domain
 * would put the same icon on most of the list.
 */
const MAILBOX_PROVIDERS = new Set([
    'aol.com',
    'fastmail.com',
    'gmail.com',
    'gmx.com',
    'gmx.de',
    'googlemail.com',
    'hey.com',
    'hotmail.co.uk',
    'hotmail.com',
    'icloud.com',
    'live.com',
    'mac.com',
    'mail.com',
    'mail.ru',
    'me.com',
    'msn.com',
    'outlook.com',
    'pm.me',
    'proton.me',
    'protonmail.com',
    'qq.com',
    'rediffmail.com',
    'tutanota.com',
    'web.de',
    'yahoo.co.in',
    'yahoo.co.uk',
    'yahoo.com',
    'yandex.com',
    'yandex.ru',
    'zoho.com',
    'zohomail.com',
]);

const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/**
 * The host part of an address, lowercased, or null when the input is not
 * something a mail header would carry. Gmail's `email` attribute has always
 * been a bare address, but it is Gmail's markup and not ours, so it is
 * validated rather than trusted.
 */
export function hostOf(address: string | null | undefined): string | null {
    if (!address) return null;
    const at = address.lastIndexOf('@');
    if (at <= 0 || at === address.length - 1) return null;
    const host = address
        .slice(at + 1)
        .trim()
        .toLowerCase()
        .replace(/\.$/, '');
    const labels = host.split('.');
    if (labels.length < 2) return null;
    if (!labels.every((l) => LABEL.test(l))) return null;
    return host;
}

/**
 * The part of a host that names the organisation.
 *
 *   email.mashreq.com   → mashreq.com
 *   icici.bank.in       → icici.bank.in
 *   mail.company.com.au → company.com.au
 *   tax.gov.ae          → tax.gov.ae
 */
export function registrableDomain(host: string): string {
    const labels = host.split('.');
    if (labels.length <= 2) return host;
    const tld = labels[labels.length - 1];
    const second = labels[labels.length - 2];
    const keep = SECOND_LEVEL_REGISTRIES[tld]?.includes(second) ? 3 : 2;
    return labels.slice(-keep).join('.');
}

/** True when the domain is a mailbox provider rather than an organisation. */
export function isMailboxProvider(domain: string): boolean {
    return MAILBOX_PROVIDERS.has(domain);
}
