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
    healthKeyFor,
    isHealthKey,
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

    test('a write reads nothing first, so it cannot write back a stale copy of anything', () => {
        recordIntegrationHealth('labelMenu', 'active');
        expect((chrome.storage.local.get as jest.Mock).mock.calls).toHaveLength(0);
        expect(setSpy).toHaveBeenCalledWith({ [healthKeyFor('labelMenu')]: expect.objectContaining({ status: 'active' }) });
    });

    test('two components recording at once both survive', async () => {
        // The lost update this layout exists to prevent: with one shared
        // object, the second component's write erased the first's.
        recordIntegrationHealth('labelMenu', 'active');
        recordIntegrationHealth('senderIcons', 'degraded', 'fallback-rows');
        const health = await readIntegrationHealth();
        expect(health.labelMenu?.status).toBe('active');
        expect(health.senderIcons).toMatchObject({ status: 'degraded', reason: 'fallback-rows' });
    });

    test('two components alternating do not defeat each other\'s write suppression', () => {
        recordIntegrationHealth('labelMenu', 'active');
        recordIntegrationHealth('senderIcons', 'active');
        recordIntegrationHealth('labelMenu', 'active');
        recordIntegrationHealth('senderIcons', 'active');
        expect(setSpy).toHaveBeenCalledTimes(2);
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

    test('a verdict written by a version before 1.8 is still shown', async () => {
        store[INTEGRATION_HEALTH_KEY] = { labelMenu: { status: 'unavailable', reason: 'no-menu', at: 1 } };
        const health = await readIntegrationHealth();
        expect(health.labelMenu).toMatchObject({ status: 'unavailable', reason: 'no-menu' });
    });

    test('a component\'s own key wins over the old shared object', async () => {
        store[INTEGRATION_HEALTH_KEY] = { labelMenu: { status: 'unavailable', reason: 'no-menu', at: 1 } };
        store[healthKeyFor('labelMenu')] = { status: 'active', at: 2 };
        const health = await readIntegrationHealth();
        expect(health.labelMenu).toEqual({ status: 'active', at: 2 });
    });

    test('every key a verdict can arrive under is recognised, and nothing else', () => {
        expect(isHealthKey(INTEGRATION_HEALTH_KEY)).toBe(true);
        expect(isHealthKey(healthKeyFor('senderIcons'))).toBe(true);
        expect(isHealthKey('globalTheme')).toBe(false);
        expect(isHealthKey('integrationHealthy')).toBe(false);
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

    test('a fallback that held says it is working, and what it is working around', () => {
        const reasons = ['fallback-rows', 'fallback-anchor', 'fallback-sender', 'favicon-unreachable'] as const;
        const sentences = reasons.map((reason) => describeComponentHealth({ status: 'degraded', reason, at: 0 }));
        expect(new Set(sentences).size).toBe(reasons.length);
        for (const s of sentences) expect(s.startsWith('Working, ')).toBe(true);
    });

    test('every reason has its own sentence', () => {
        const reasons = ['no-account', 'no-label-name', 'no-menu', 'no-model', 'clone-mismatch', 'no-sender', 'no-anchor'] as const;
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

describe('write suppression only trusts a write that landed', () => {
    test('a rejected write is not remembered, so the same verdict is written again', async () => {
        setSpy.mockImplementationOnce(() => Promise.reject(new Error('QUOTA_BYTES quota exceeded')));
        recordIntegrationHealth('labelMenu', 'active');
        expect(setSpy).toHaveBeenCalledTimes(1);
        // Let the rejection settle.
        await Promise.resolve();
        await Promise.resolve();

        recordIntegrationHealth('labelMenu', 'active');
        expect(setSpy).toHaveBeenCalledTimes(2);
        expect(store[healthKeyFor('labelMenu')]).toMatchObject({ status: 'active' });
    });

    test('a repeat while the first write is still in flight costs nothing', () => {
        let resolveSet: () => void = () => {};
        setSpy.mockImplementationOnce(() => new Promise<void>((r) => (resolveSet = r)));
        recordIntegrationHealth('senderIcons', 'active');
        recordIntegrationHealth('senderIcons', 'active');
        expect(setSpy).toHaveBeenCalledTimes(1);
        resolveSet();
    });

    test('a write that throws synchronously is not remembered either', () => {
        setSpy.mockImplementationOnce(() => {
            throw new Error('storage unavailable');
        });
        recordIntegrationHealth('labelMenu', 'active');
        recordIntegrationHealth('labelMenu', 'active');
        expect(setSpy).toHaveBeenCalledTimes(2);
    });

    test('a failed label menu write reads as a storage problem, not a blank', () => {
        expect(describeComponentHealth({ status: 'unavailable', reason: 'write-failed', at: 0 })).toBe(
            'Could not save: settings storage may be full'
        );
    });
});
