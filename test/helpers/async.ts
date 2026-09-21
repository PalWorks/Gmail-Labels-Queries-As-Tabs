/**
 * async.ts (test helper)
 *
 * Waiting primitives that do not depend on wall-clock time.
 *
 * Tests used to sleep for a fixed 50 to 200ms to let initialisation settle.
 * That is a race: under coverage instrumentation, or on a loaded machine, the
 * chain is not finished when the timer fires, and the suite fails for reasons
 * that have nothing to do with the code under test.
 */

/**
 * Yield the event loop enough times for pending promise chains to resolve.
 *
 * Promise continuations need turns, not milliseconds, so this is both faster
 * and more reliable than sleeping. Use it when the code under test awaits
 * mocked APIs that resolve immediately.
 */
export async function flush(turns = 20): Promise<void> {
    for (let i = 0; i < turns; i++) {
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
}

/**
 * Poll until `predicate` is true, or fail with a readable message.
 *
 * Use it when the code under test genuinely waits on a timer (an injection
 * retry, a settling ladder) so the test finishes as soon as the condition
 * holds rather than always paying the worst case.
 */
export async function waitFor(
    predicate: () => boolean,
    { timeout = 3000, interval = 10, message = 'condition' }: { timeout?: number; interval?: number; message?: string } = {}
): Promise<void> {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
        if (predicate()) return;
        await new Promise((resolve) => setTimeout(resolve, interval));
    }
    throw new Error(`waitFor timed out after ${timeout}ms waiting for ${message}`);
}
