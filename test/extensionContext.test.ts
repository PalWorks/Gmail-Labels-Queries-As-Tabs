export {};
/**
 * extensionContext.test.ts
 *
 * The orphaned-content-script case. A Gmail tab keeps running the old script
 * after the extension updates, so every chrome.* call throws and the settings
 * modal silently does nothing. These cover the detection; the modal's
 * behaviour is covered in settingsModal.test.ts.
 */

import {
    isExtensionContextAlive,
    isContextInvalidatedError,
    catchChromeError,
    ignoreChromeError,
} from '../src/modules/extensionContext';
import { flush } from './helpers/async';

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

// ---------------------------------------------------------------------------
// catchChromeError / ignoreChromeError
//
// MV3 returns a promise from any chrome.* call whose callback is omitted, so
// every fire-and-forget call is a rejection waiting to be dropped. Twenty-five
// of them were, across the extension, until v1.5.0.
// ---------------------------------------------------------------------------

describe('catchChromeError', () => {
    test('handles a rejection that would otherwise be unhandled', async () => {
        const handler = jest.fn();
        catchChromeError(Promise.reject(new Error('gone')), handler);
        await flush();

        expect(handler).toHaveBeenCalledTimes(1);
        expect((handler.mock.calls[0][0] as Error).message).toBe('gone');
    });

    test('leaves a resolving call alone', async () => {
        const handler = jest.fn();
        catchChromeError(Promise.resolve('fine'), handler);
        await flush();

        expect(handler).not.toHaveBeenCalled();
    });

    test('tolerates the callback form, which returns undefined', () => {
        // This is the whole reason the helper exists. `undefined.catch` is a
        // TypeError that would take down the caller the handler was added to
        // protect, and every test double in this repo returns undefined.
        expect(() => catchChromeError(undefined, jest.fn())).not.toThrow();
    });

    test('tolerates a non-promise return value', () => {
        expect(() => catchChromeError({ not: 'a promise' }, jest.fn())).not.toThrow();
        expect(() => catchChromeError(null, jest.fn())).not.toThrow();
    });
});

describe('ignoreChromeError', () => {
    test('swallows a rejection without reporting it', async () => {
        const error = jest.spyOn(console, 'error').mockImplementation(() => {});
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

        expect(() => ignoreChromeError(Promise.reject(new Error('best effort')))).not.toThrow();
        await flush();

        expect(error).not.toHaveBeenCalled();
        expect(warn).not.toHaveBeenCalled();
        error.mockRestore();
        warn.mockRestore();
    });

    test('tolerates the callback form', () => {
        expect(() => ignoreChromeError(undefined)).not.toThrow();
    });
});
