export {};
/**
 * domain.test.ts
 *
 * From an address to the organisation's domain. The cases are the ones a real
 * inbox produced on 2026-09-29, which is where the naive "last two labels"
 * rule the replaced extension used goes wrong.
 */

import { hostOf, registrableDomain, isMailboxProvider } from '../src/utils/domain';

describe('hostOf', () => {
    test.each([
        ['alerts@email.mashreq.com', 'email.mashreq.com'],
        ['Someone@Example.COM', 'example.com'],
        ['a.b+tag@sub.example.co.uk', 'sub.example.co.uk'],
        ['odd@"quoted"@example.org', 'example.org'],
    ])('%s is from %s', (address, host) => {
        expect(hostOf(address)).toBe(host);
    });

    test.each([
        [null],
        [undefined],
        [''],
        ['no-at-sign'],
        ['@example.com'],
        ['trailing@'],
        ['bare@localhost'],
        ['x@exa mple.com'],
        ['x@-bad.com'],
        ['x@<script>.com'],
        ['x@example..com'],
    ])('%p is not an address with a host', (address) => {
        expect(hostOf(address as string | null | undefined)).toBeNull();
    });

    test('a trailing dot is the same host', () => {
        expect(hostOf('x@example.com.')).toBe('example.com');
    });
});

describe('registrableDomain', () => {
    test.each([
        ['email.mashreq.com', 'mashreq.com'],
        ['insideapple.apple.com', 'apple.com'],
        ['icici.bank.in', 'icici.bank.in'],
        ['federal.bank.in', 'federal.bank.in'],
        ['tax.gov.ae', 'tax.gov.ae'],
        ['cbra.co.in', 'cbra.co.in'],
        ['mail.company.com.au', 'company.com.au'],
        ['news.bbc.co.uk', 'bbc.co.uk'],
        ['a.b.c.example.io', 'example.io'],
        ['github.com', 'github.com'],
        ['localhost.localdomain', 'localhost.localdomain'],
    ])('%s belongs to %s', (host, domain) => {
        expect(registrableDomain(host)).toBe(domain);
    });

    test('a country without a registry list is read like .com', () => {
        expect(registrableDomain('mail.example.fr')).toBe('example.fr');
    });
});

describe('isMailboxProvider', () => {
    test('the big providers are recognised', () => {
        for (const d of ['gmail.com', 'outlook.com', 'yahoo.com', 'icloud.com', 'proton.me']) {
            expect(isMailboxProvider(d)).toBe(true);
        }
    });

    test('an organisation is not a mailbox provider', () => {
        for (const d of ['mashreq.com', 'google.com', 'apple.com', 'bank.in']) {
            expect(isMailboxProvider(d)).toBe(false);
        }
    });
});
