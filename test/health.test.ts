export {};
/**
 * health.test.ts
 *
 * Whether the Gmail integrations are working, recorded locally so a user in
 * an A/B bucket we cannot see has something to report.
 *
 * Two properties matter more than the rest and are tested hardest: that a
 * repeated status costs no storage write, because the label menu decides its
 * fate every time a menu opens; and that nothing here can break its caller,
 * because health information is the first thing that should be dropped when
 * something is already wrong.
 */

import {
    recordIntegrationHealth,
    readIntegrationHealth,
    resetHealthCache,
    describeComponentHealth,
    formatDiagnostics,
    INTEGRATION_HEALTH_KEY,
    IntegrationHealth,
} from '../src/modules/health';

let store: Record<string, unknown>;
let setSpy: jest.Mock;

function installChrome(options: { alive?: boolean; lastError?: boolean; throwOnGet?: boolean } = {}): void {
    const { alive = true, lastError = false, throwOnGet = false } = options;
    setSpy = jest.fn((items: Record<string, unknown>, cb?: () => void) => {
        Object.assign(store, items);
        cb?.();
        return Promise.resolve();
    });
    (global as any).chrome = {
        runtime: {
            id: alive ? 'test-extension-id' : undefined,
            get lastError() {
                return lastError ? { message: 'Extension context invalidated.' } : undefined;
            },
        },
        storage: {
            local: {
                get: jest.fn((keys: string[], cb: (v: Record<string, unknown>) => void) => {
                    if (throwOnGet) throw new Error('storage unavailable');
                    const out: Record<string, unknown> = {};
                    for (const k of keys) if (k in store) out[k] = store[k];
                    cb(out);
                }),
                set: setSpy,
            },
        },
    };
}

beforeEach(() => {
    store = {};
    resetHealthCache();
    installChrome();
});

describe('recording', () => {
    test('an active component is stored with a timestamp', async () => {
        recordIntegrationHealth('labelMenu', 'active');
        const health = await readIntegrationHealth();
        expect(health.labelMenu?.status).toBe('active');
        expect(health.labelMenu?.reason).toBeUndefined();
        expect(typeof health.labelMenu?.at).toBe('number');
    });

    test('an unavailable component carries why', async () => {
        recordIntegrationHealth('labelMenu', 'unavailable', 'no-model');
        const health = await readIntegrationHealth();
        expect(health.labelMenu).toMatchObject({ status: 'unavailable', reason: 'no-model' });
    });

    test('repeating the same verdict writes nothing', () => {
        recordIntegrationHealth('labelMenu', 'active');
        expect(setSpy).toHaveBeenCalledTimes(1);
        recordIntegrationHealth('labelMenu', 'active');
        recordIntegrationHealth('labelMenu', 'active');
        expect(setSpy).toHaveBeenCalledTimes(1);
    });

    test('a changed verdict writes again', () => {
        recordIntegrationHealth('labelMenu', 'active');
        recordIntegrationHealth('labelMenu', 'unavailable', 'no-menu');
        expect(setSpy).toHaveBeenCalledTimes(2);
    });

    test('a changed reason under the same status still writes', () => {
        recordIntegrationHealth('labelMenu', 'unavailable', 'no-menu');
        recordIntegrationHealth('labelMenu', 'unavailable', 'no-model');
        expect(setSpy).toHaveBeenCalledTimes(2);
    });

    test('an orphaned content script records nothing and throws nothing', () => {
        installChrome({ alive: false });
        expect(() => recordIntegrationHealth('labelMenu', 'active')).not.toThrow();
        expect(setSpy).not.toHaveBeenCalled();
    });

    test('a lastError during the read abandons the write rather than writing over the record', () => {
        installChrome({ lastError: true });
        recordIntegrationHealth('labelMenu', 'active');
        expect(setSpy).not.toHaveBeenCalled();
    });

    test('storage that throws does not take the caller down with it', () => {
        installChrome({ throwOnGet: true });
        expect(() => recordIntegrationHealth('labelMenu', 'active')).not.toThrow();
    });
});

describe('reading', () => {
    test('nothing recorded reads as an empty object, not undefined', async () => {
        await expect(readIntegrationHealth()).resolves.toEqual({});
    });

    test('a lastError reads as nothing recorded', async () => {
        store[INTEGRATION_HEALTH_KEY] = { labelMenu: { status: 'active', at: 1 } };
        installChrome({ lastError: true });
        await expect(readIntegrationHealth()).resolves.toEqual({});
    });

    test('storage that throws reads as nothing recorded', async () => {
        installChrome({ throwOnGet: true });
        await expect(readIntegrationHealth()).resolves.toEqual({});
    });
});

describe('what the user sees', () => {
    test('never used yet is not a failure', () => {
        expect(describeComponentHealth(undefined)).toBe('Not used yet');
        expect(describeComponentHealth({ status: 'not-attempted', at: 0 })).toBe('Not used yet');
    });

    test('working says so in one word', () => {
        expect(describeComponentHealth({ status: 'active', at: 0 })).toBe('Working');
    });

    test('every reason has its own sentence', () => {
        const reasons = ['no-account', 'no-label-name', 'no-menu', 'no-model', 'clone-mismatch'] as const;
        const sentences = reasons.map((reason) =>
            describeComponentHealth({ status: 'unavailable', reason, at: 0 })
        );
        expect(new Set(sentences).size).toBe(reasons.length);
        for (const s of sentences) expect(s.startsWith('Unavailable:')).toBe(true);
    });

    test('an unknown reason still reads as unavailable rather than blank', () => {
        expect(describeComponentHealth({ status: 'unavailable', reason: 'who-knows' as never, at: 0 })).toBe(
            'Unavailable'
        );
    });
});

describe('the copied diagnostic', () => {
    const health: IntegrationHealth = {
        labelMenu: { status: 'unavailable', reason: 'no-menu', at: Date.parse('2026-09-23T10:00:00Z') },
    };

    test('names the version, the component, the status and when', () => {
        const text = formatDiagnostics(health, '1.7.0');
        expect(text).toContain('1.7.0');
        expect(text).toContain('labelMenu: unavailable (no-menu)');
        expect(text).toContain('2026-09-23T10:00:00Z');
    });

    test('says so plainly when there is nothing to report', () => {
        expect(formatDiagnostics({}, '1.7.0')).toContain('nothing recorded yet');
    });

    test('carries nothing identifying', () => {
        // A support message should not be a data disclosure the sender did
        // not notice. No address, no label names, no tab titles.
        const text = formatDiagnostics(health, '1.7.0');
        expect(text).not.toMatch(/@/);
        expect(text.split('\n').length).toBeLessThanOrEqual(3);
    });
});
