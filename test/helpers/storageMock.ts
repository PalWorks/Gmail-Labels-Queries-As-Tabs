/**
 * storageMock.ts
 *
 * An in-memory chrome.storage double with a controllable delay.
 *
 * The default mock in storage.test.ts calls its callback synchronously, which
 * makes every read-modify-write atomic by accident and hides exactly the races
 * we need to test. Giving `get` and `set` real asynchrony opens the interleave
 * window that a live chrome.storage has.
 */

export interface MockArea {
    get: jest.Mock;
    set: jest.Mock;
    remove: jest.Mock;
}

export interface MockAreaOptions {
    /**
     * Event-loop turns to wait before a read or write completes. 0 still defers
     * to a microtask, which is enough to interleave two promise chains.
     */
    latencyTurns?: number;
}

function defer(turns: number): Promise<void> {
    let p = Promise.resolve();
    for (let i = 0; i < turns; i++) p = p.then(() => undefined);
    return p;
}

/** Build a chrome.storage area backed by `store`. */
export function makeAsyncArea(store: Record<string, unknown>, options: MockAreaOptions = {}): MockArea {
    const turns = options.latencyTurns ?? 1;

    return {
        get: jest.fn((keys: string | string[] | null, callback: (items: Record<string, unknown>) => void) => {
            void defer(turns).then(() => {
                if (keys === null) {
                    callback({ ...store });
                    return;
                }
                const keyArr = typeof keys === 'string' ? [keys] : keys;
                const result: Record<string, unknown> = {};
                keyArr.forEach((k) => {
                    if (store[k] !== undefined) result[k] = store[k];
                });
                callback(result);
            });
        }),
        set: jest.fn((items: Record<string, unknown>, callback?: () => void) => {
            void defer(turns).then(() => {
                Object.assign(store, items);
                if (callback) callback();
            });
        }),
        remove: jest.fn((key: string, callback?: () => void) => {
            void defer(turns).then(() => {
                delete store[key];
                if (callback) callback();
            });
        }),
    };
}

export interface InstalledMock {
    sync: Record<string, unknown>;
    local: Record<string, unknown>;
}

/**
 * Install a chrome global with async sync/local areas and no runtime
 * messaging, so `mutateSettings` takes its local fallback path.
 */
export function installAsyncChrome(options: MockAreaOptions = {}): InstalledMock {
    const sync: Record<string, unknown> = {};
    const local: Record<string, unknown> = {};

    (global as unknown as { chrome: unknown }).chrome = {
        storage: {
            sync: makeAsyncArea(sync, options),
            local: makeAsyncArea(local, options),
        },
        runtime: { lastError: null },
    };

    if (!globalThis.crypto?.randomUUID) {
        Object.defineProperty(globalThis, 'crypto', {
            value: { randomUUID: () => `id-${Math.random().toString(36).slice(2)}` },
            writable: true,
        });
    }

    return { sync, local };
}
