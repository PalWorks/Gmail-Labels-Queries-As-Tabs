/**
 * health.ts
 *
 * Whether the parts of this extension that reach into Gmail's own UI are
 * currently working, recorded locally so the user can see it and say so.
 *
 * The reason this exists is a gap the drift canary cannot close. The canary
 * watches one Google account, on one Gmail build, in one A/B bucket, on one
 * machine that has to be switched on. Gmail runs experiments; a structure
 * that is present for us can be absent for some percentage of users, and no
 * amount of local testing will ever show that.
 *
 * What closes the gap is the users themselves, if they are given something to
 * report. So the content script records the outcome of each attempt and the
 * options page shows one row and a button that copies a diagnostic string.
 *
 * Three constraints, all deliberate:
 *
 *  - **Nothing is transmitted.** Not on a schedule, not on a trigger, not
 *    "anonymously". The listing says nothing leaves the browser, and that
 *    sentence is worth more than the convenience of an automatic report.
 *    The user copies a string and pastes it wherever they choose.
 *  - **No new permission and no new host.** This is `chrome.storage.local`,
 *    which the extension already uses for the theme.
 *  - **Writes only on change.** The label menu decides its fate every time a
 *    menu opens, and sender icons on every inbox redraw, which is far too
 *    often to write storage. A repeat of the status a component last stored
 *    is dropped without a write.
 *
 * ## One key per component
 *
 * Until v1.8 every component shared one `integrationHealth` object, written
 * by reading it, changing one entry and writing it back. With one component
 * that was harmless. With two in the same content script it is a lost update
 * waiting to happen: both read `{}`, each writes back only its own entry, and
 * whichever lands second erases the other. So each component now owns its own
 * key and a write is a single `set` with no read before it. The old shared
 * object is still read, underneath, so a verdict recorded by an older version
 * is not lost on upgrade; nothing writes it any more.
 */

import { isExtensionContextAlive } from './extensionContext';

/** Parts of the extension that depend on Gmail's own markup. */
export type IntegrationComponent = 'labelMenu' | 'senderIcons';

/** Every component, so a reader can ask for all of their keys at once. */
export const INTEGRATION_COMPONENTS: readonly IntegrationComponent[] = ['labelMenu', 'senderIcons'];

/**
 * `not-attempted` is not a failure: it is the honest answer before the user
 * has opened a label menu even once, and it is what a fresh profile shows.
 *
 * `degraded` means working, but only because a fallback held. Nothing is
 * wrong on screen, which is exactly why it is recorded: it is the warning
 * that arrives while there is still time to act on it.
 */
export type HealthStatus = 'active' | 'degraded' | 'unavailable' | 'not-attempted';

/**
 * Why an attempt gave up. Each value names the contract check that failed, so
 * a user's copied diagnostic points straight at a line in the plan rather
 * than saying "it did not work".
 */
export type HealthReason =
    | 'no-account'
    | 'no-label-name'
    | 'no-menu'
    | 'no-model'
    | 'clone-mismatch'
    | 'write-failed'
    // Sender icons
    | 'fallback-rows'
    | 'fallback-anchor'
    | 'fallback-sender'
    | 'favicon-unreachable'
    | 'no-sender'
    | 'no-anchor';

export interface ComponentHealth {
    status: HealthStatus;
    reason?: HealthReason;
    /** Epoch milliseconds. */
    at: number;
}

export type IntegrationHealth = Partial<Record<IntegrationComponent, ComponentHealth>>;

/** The shared object versions before 1.8 wrote. Read, never written. */
export const INTEGRATION_HEALTH_KEY = 'integrationHealth';

/** The key one component's verdict lives under. */
export function healthKeyFor(component: IntegrationComponent): string {
    return `${INTEGRATION_HEALTH_KEY}.${component}`;
}

/** True for any key a health verdict can arrive under, old or new. */
export function isHealthKey(key: string): boolean {
    return key === INTEGRATION_HEALTH_KEY || key.startsWith(`${INTEGRATION_HEALTH_KEY}.`);
}

/**
 * The last value this context wrote for each component, so an unchanged
 * status costs nothing.
 *
 * Per component, because one cache shared between two components thrashes:
 * the label menu writing `active` and sender icons writing `active` would
 * each look like a change to the other, and every call would write.
 *
 * Per content script rather than per profile, which is the right scope: two
 * Gmail tabs disagreeing is itself worth recording, and the later write wins
 * in the same way every other storage write here does.
 */
const lastWritten = new Map<IntegrationComponent, { status: HealthStatus; reason?: HealthReason }>();

/**
 * A verdict whose write has been sent but not yet confirmed. It suppresses a
 * repeat the same way `lastWritten` does, so a burst of redraws while the
 * write is in flight still costs one write, but it only becomes `lastWritten`
 * once storage says the write landed. Recording it any earlier meant a failed
 * write was remembered as a success, and the verdict was then never written
 * again for the life of the content script.
 */
const inFlight = new Map<IntegrationComponent, { status: HealthStatus; reason?: HealthReason }>();

function sameVerdict(
    entry: { status: HealthStatus; reason?: HealthReason } | undefined,
    status: HealthStatus,
    reason: HealthReason | undefined
): boolean {
    return !!entry && entry.status === status && entry.reason === reason;
}

/**
 * Record the outcome of an attempt to augment Gmail's UI.
 *
 * Fire and forget by design: this is diagnostic information, and a surface
 * that fails to record its own health must still work. Nothing awaits it and
 * nothing branches on it.
 */
export function recordIntegrationHealth(
    component: IntegrationComponent,
    status: HealthStatus,
    reason?: HealthReason
): void {
    const pending = inFlight.get(component);
    if (pending ? sameVerdict(pending, status, reason) : sameVerdict(lastWritten.get(component), status, reason)) {
        return;
    }

    if (!isExtensionContextAlive()) return;

    const entry: ComponentHealth = { status, at: Date.now() };
    if (reason) entry.reason = reason;
    const verdict = { status, reason };

    const settle = (ok: boolean): void => {
        // A newer verdict may have been sent since; it owns the slot now.
        if (inFlight.get(component) !== verdict) return;
        inFlight.delete(component);
        if (ok) lastWritten.set(component, verdict);
    };

    try {
        // One key, one set, no read first: see "One key per component".
        const result: unknown = chrome.storage.local.set({ [healthKeyFor(component)]: entry });
        inFlight.set(component, verdict);
        if (typeof (result as Promise<unknown> | undefined)?.then === 'function') {
            (result as Promise<unknown>).then(
                () => settle(true),
                () => settle(false)
            );
        } else {
            // A callback-only storage API (older Chrome, some test stubs)
            // returns nothing to wait on and reports failure by throwing,
            // which the catch below handles.
            settle(true);
        }
    } catch {
        // Orphaned context, or storage unavailable. Health information is the
        // first thing that should be dropped when something is wrong, not the
        // thing that makes it worse. Nothing is recorded, so the next call
        // tries again.
        inFlight.delete(component);
    }
}

/**
 * Read the recorded health. An unreadable store reads as "nothing recorded".
 *
 * A component's own key wins over the pre-1.8 shared object, which is only
 * there so an upgrade does not blank the row until the next verdict.
 */
export async function readIntegrationHealth(): Promise<IntegrationHealth> {
    return new Promise((resolve) => {
        try {
            const keys = [INTEGRATION_HEALTH_KEY, ...INTEGRATION_COMPONENTS.map(healthKeyFor)];
            chrome.storage.local.get(keys, (stored) => {
                if (chrome.runtime.lastError) {
                    resolve({});
                    return;
                }
                const legacy = (stored?.[INTEGRATION_HEALTH_KEY] as IntegrationHealth) ?? {};
                const health: IntegrationHealth = { ...legacy };
                for (const component of INTEGRATION_COMPONENTS) {
                    const entry = stored?.[healthKeyFor(component)] as ComponentHealth | undefined;
                    if (entry) health[component] = entry;
                }
                resolve(health);
            });
        } catch {
            resolve({});
        }
    });
}

/** Reset the write-suppression cache. Tests use this; nothing else should. */
export function resetHealthCache(): void {
    lastWritten.clear();
    inFlight.clear();
}

/** One line per component, in plain words, for the options page row. */
export function describeComponentHealth(health: ComponentHealth | undefined): string {
    if (!health || health.status === 'not-attempted') return 'Not used yet';
    if (health.status === 'active') return 'Working';
    if (health.status === 'degraded') {
        switch (health.reason) {
            case 'fallback-rows':
                return 'Working, on a fallback: Gmail changed how it marks up inbox rows';
            case 'fallback-anchor':
                return 'Working, on a fallback: Gmail changed where a row keeps its subject';
            case 'fallback-sender':
                return 'Working, on a fallback: Gmail changed how it marks up sender addresses';
            case 'favicon-unreachable':
                return 'Working, without website icons: this browser is not loading them';
            default:
                return 'Working, on a fallback';
        }
    }
    switch (health.reason) {
        case 'no-account':
            return 'Unavailable: the signed-in address has not been detected yet';
        case 'no-label-name':
            return 'Unavailable: Gmail is not exposing label names where this expects them';
        case 'no-menu':
            return 'Unavailable: Gmail did not open a menu this could add to';
        case 'no-model':
            return 'Unavailable: Gmail has no ordinary menu item to match';
        case 'clone-mismatch':
            return 'Unavailable: the added item did not render like Gmail’s own';
        case 'no-sender':
            return 'Unavailable: Gmail is not exposing sender addresses in the list';
        case 'no-anchor':
            return 'Unavailable: there is no place in the row to show the icon';
        case 'write-failed':
            return 'Could not save: settings storage may be full';
        default:
            return 'Unavailable';
    }
}

/**
 * The string the user copies.
 *
 * Deliberately short, readable before sending, and free of anything
 * identifying. No email address, no label names, no tab titles: a support
 * message should not be a data disclosure the sender did not notice.
 */
export function formatDiagnostics(health: IntegrationHealth, version: string): string {
    const lines = [`Gmail Labels as Tabs ${version}`];
    const entries = Object.entries(health) as Array<[IntegrationComponent, ComponentHealth]>;
    if (entries.length === 0) {
        lines.push('integration: nothing recorded yet');
    } else {
        for (const [component, entry] of entries) {
            const when = new Date(entry.at).toISOString().replace(/\.\d+Z$/, 'Z');
            lines.push(`${component}: ${entry.status}${entry.reason ? ` (${entry.reason})` : ''} at ${when}`);
        }
    }
    return lines.join('\n');
}
