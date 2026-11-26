// SPDX-License-Identifier: AGPL-3.0-only
export {};
/**
 * gmailHash.test.ts
 *
 * The one decoder every Gmail hash goes through (src/utils/gmailHash.ts).
 */
import { decodeGmailHashSegment } from '../src/utils/gmailHash';
import { deriveTitleFromUrl } from '../src/modules/tabManager';
import { tabToGmailLabel } from '../src/modules/rules';

describe('decodeGmailHashSegment', () => {
    test.each([
        ['Team+Updates', 'Team Updates'],
        ['Parent%2FChild', 'Parent/Child'],
        ['C%2B%2B', 'C++'],
        ['is%3Aunread+from%3Aboss', 'is:unread from:boss'],
        ['100%', '100%'],
        ['caf%C3%A9', 'café'],
    ])('%s reads as %s', (raw, expected) => {
        expect(decodeGmailHashSegment(raw)).toBe(expected);
    });
});

describe('callers use it', () => {
    test('a pasted label URL with a literal plus gets the right title', () => {
        expect(deriveTitleFromUrl('#label/C%2B%2B')).toBe('C++');
    });

    test('a hand-typed hash with a stray percent does not break rule targets', () => {
        expect(() => tabToGmailLabel({ id: 'a', title: 'x', type: 'hash', value: '#label/100% done' })).not.toThrow();
        expect(tabToGmailLabel({ id: 'a', title: 'x', type: 'hash', value: '#label/100% done' })).toBe('100% done');
    });
});
