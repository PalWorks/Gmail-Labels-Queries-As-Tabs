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
 *    menu opens, which is far too often to write storage. A repeat of the
 *    status already stored is dropped without a write.
 */

import { ignoreChromeError, isExtensionContextAlive } from './extensionContext';

/** Parts of the extension that depend on Gmail's own markup. */
export type IntegrationComponent = 'labelMenu';

/**
 * `not-attempted` is not a failure: it is the honest answer before the user
 * has opened a label menu even once, and it is what a fresh profile shows.
 */
export type HealthStatus = 'active' | 'unavailable' | 'not-attempted';

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
    | 'write-failed';

export interface ComponentHealth {
    status: HealthStatus;
    reason?: HealthReason;
    /** Epoch milliseconds. */
    at: number;
}

export type IntegrationHealth = Partial<Record<IntegrationComponent, ComponentHealth>>;

export const INTEGRATION_HEALTH_KEY = 'integrationHealth';

/**
 * The last value this context wrote, so an unchanged status costs nothing.
 *
 * Per content script rather than per profile, which is the right scope: two
 * Gmail tabs disagreeing is itself worth recording, and the later write wins
 * in the same way every other storage write here does.
 */
let lastWritten: { component: IntegrationComponent; status: HealthStatus; reason?: HealthReason } | null = null;

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
    if (lastWritten && lastWritten.component === component && lastWritten.status === status && lastWritten.reason === reason) {
        return;
    }
    lastWritten = { component, status, reason };

    if (!isExtensionContextAlive()) return;

    const entry: ComponentHealth = { status, at: Date.now() };
    if (reason) entry.reason = reason;

    try {
        chrome.storage.local.get([INTEGRATION_HEALTH_KEY], (stored) => {
            // An orphaned context surfaces here as a lastError rather than a
            // throw, and reading `stored` after one is undefined behaviour.
            if (chrome.runtime.lastError) return;
            const current: IntegrationHealth = (stored?.[INTEGRATION_HEALTH_KEY] as IntegrationHealth) ?? {};
            const next: IntegrationHealth = { ...current, [component]: entry };
            ignoreChromeError(chrome.storage.local.set({ [INTEGRATION_HEALTH_KEY]: next }));
        });
    } catch {
        // Orphaned context, or storage unavailable. Health information is the
        // first thing that should be dropped when something is wrong, not the
        // thing that makes it worse.
    }
}

/** Read the recorded health. An unreadable store reads as "nothing recorded". */
export async function readIntegrationHealth(): Promise<IntegrationHealth> {
    return new Promise((resolve) => {
        try {
            chrome.storage.local.get([INTEGRATION_HEALTH_KEY], (stored) => {
                if (chrome.runtime.lastError) {
                    resolve({});
                    return;
                }
                resolve((stored?.[INTEGRATION_HEALTH_KEY] as IntegrationHealth) ?? {});
            });
        } catch {
            resolve({});
        }
    });
}

/** Reset the write-suppression cache. Tests use this; nothing else should. */
export function resetHealthCache(): void {
    lastWritten = null;
}

/** One line per component, in plain words, for the options page row. */
export function describeComponentHealth(health: ComponentHealth | undefined): string {
    if (!health || health.status === 'not-attempted') return 'Not used yet';
    if (health.status === 'active') return 'Working';
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
