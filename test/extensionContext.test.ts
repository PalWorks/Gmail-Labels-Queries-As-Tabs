export {};
/**
 * extensionContext.test.ts
 *
 * The orphaned-content-script case. A Gmail tab keeps running the old script
 * after the extension updates, so every chrome.* call throws and the settings
 * modal silently does nothing. These cover the detection; the modal's
 * behaviour is covered in settingsModal.test.ts.
 */

import { isExtensionContextAlive, isContextInvalidatedError } from '../src/modules/extensionContext';

describe('isExtensionContextAlive', () => {
    afterEach(() => {
        delete (global as any).chrome;
    });

    test('true while chrome.runtime.id is readable', () => {
        (global as any).chrome = { runtime: { id: 'abcdef' } };
        expect(isExtensionContextAlive()).toBe(true);
    });

    test('false once the id is gone, which is what an orphaned script sees', () => {
        (global as any).chrome = { runtime: {} };
        expect(isExtensionContextAlive()).toBe(false);
    });

    test('false when chrome.runtime itself has been torn down', () => {
        (global as any).chrome = {};
        expect(isExtensionContextAlive()).toBe(false);
    });

    test('false, rather than throwing, when reading chrome.runtime throws', () => {
        (global as any).chrome = {
            get runtime(): never {
                throw new Error('Extension context invalidated.');
            },
        };
        expect(() => isExtensionContextAlive()).not.toThrow();
        expect(isExtensionContextAlive()).toBe(false);
    });

    test('false when chrome is not defined at all', () => {
        expect(isExtensionContextAlive()).toBe(false);
    });
});

describe('isContextInvalidatedError', () => {
    test.each([
        'Extension context invalidated.',
        'Error: Extension context invalidated',
        'Could not establish connection. Receiving end does not exist.',
    ])('recognises %s', (message) => {
        expect(isContextInvalidatedError(new Error(message))).toBe(true);
    });

    test('accepts a non-Error, because a rejected sendMessage may carry a string', () => {
        expect(isContextInvalidatedError('Extension context invalidated.')).toBe(true);
    });

    test('does not swallow unrelated failures', () => {
        expect(isContextInvalidatedError(new Error('Settings changed while saving'))).toBe(false);
        expect(isContextInvalidatedError(undefined)).toBe(false);
        expect(isContextInvalidatedError(null)).toBe(false);
    });
});
