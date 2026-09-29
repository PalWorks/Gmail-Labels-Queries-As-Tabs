export {};
/**
 * senderIcons.test.ts
 *
 * The chip at the start of each inbox row, and the chain of fallbacks behind
 * every step of drawing it.
 *
 * The fixture mirrors the row structure measured in a live inbox on
 * 2026-09-29: `tr[role=row][id]`, a sender cell holding two `[email]` spans
 * (one hidden, one visible), and a subject cell whose `[role=link]` wraps the
 * subject container. Gmail's class names appear here only because they are
 * what the fallbacks are for; the primary path never reads them.
 */

import { flush, microtasks } from './helpers/async';
import {
    installSenderIcons,
    uninstallSenderIcons,
    refreshSenderIcons,
    resetSenderIconsForTests,
    scanNow,
    setImageProbe,
    chipSpecFor,
    pickSender,
    findAnchor,
    threadGroup,
    CHIP_ATTR,
    LEARNED_SELECTORS_KEY,
    SenderIconPrefs,
    ProbeResult,
} from '../src/modules/senderIcons';
import { resetHealthCache, healthKeyFor } from '../src/modules/health';
import { SENDER_ROW_FALLBACK, SENDER_SUBJECT_FALLBACK } from '../src/utils/selectors';

/**
 * The fallback class names, taken from the registry rather than written here,
 * so a refreshed value (the drift canary proposes them) passes its own tests.
 */
const ROW_CLASS = SENDER_ROW_FALLBACK.replace(/^tr\./, '');
const SUBJECT_CLASS = SENDER_SUBJECT_FALLBACK.replace(/^\./, '');

const ME = 'me@goldsecure.com.au';

let local: Record<string, unknown>;
let prefs: SenderIconPrefs;

function installChrome(): void {
    (global as any).chrome = {
        runtime: { id: 'test-extension-id', lastError: undefined },
        storage: {
            local: {
                get: jest.fn((keys: string[], cb: (v: Record<string, unknown>) => void) => {
                    const out: Record<string, unknown> = {};
                    for (const k of keys) if (k in local) out[k] = local[k];
                    cb(out);
                }),
                set: jest.fn((items: Record<string, unknown>) => {
                    Object.assign(local, items);
                    return Promise.resolve();
                }),
            },
        },
    };
}

interface Participant {
    email?: string;
    hovercard?: string;
    name: string;
}

interface RowOptions {
    id?: string;
    people: Participant[];
    subject?: string;
    aria?: boolean;
    link?: boolean;
    subjectClass?: boolean;
    rowClass?: string;
}

function span(p: Participant): string {
    const attrs = [
        p.email !== undefined ? `email="${p.email}"` : '',
        p.hovercard !== undefined ? `data-hovercard-id="${p.hovercard}"` : '',
        `name="${p.name}"`,
    ].join(' ');
    return `<span class="yP" ${attrs}>${p.name}</span>`;
}

function rowHtml(o: RowOptions): string {
    const aria = o.aria ?? true;
    const link = o.link ?? true;
    const subjectClass = o.subjectClass ?? true;
    const people = o.people.map(span).join('');
    const subject = `<div class="${subjectClass ? SUBJECT_CLASS : 'q9'}"><div class="y6"><span class="bog">${o.subject ?? 'Hello'}</span></div></div>`;
    return (
        `<tr id="${o.id ?? 'r1'}" ${aria ? 'role="row"' : ''} class="${o.rowClass ?? `${ROW_CLASS} yO`}">` +
        `<td class="yX xY" ${aria ? 'role="gridcell"' : ''}><div class="afn">${people}</div><div class="yW">${people}</div></td>` +
        `<td class="xY a4W" ${aria ? 'role="gridcell"' : ''}>` +
        (link ? `<div class="xS" role="link">${subject}</div>` : `<div class="xS">${subject}</div>`) +
        `</td></tr>`
    );
}

function mount(rows: string): void {
    document.body.innerHTML = `<div role="main"><table><tbody>${rows}</tbody></table></div><div id="outside"></div>`;
}

function chips(): HTMLElement[] {
    return Array.from(document.querySelectorAll<HTMLElement>(`[${CHIP_ATTR}]`));
}

function install(): void {
    installSenderIcons({ getAccountId: () => ME, getPrefs: () => prefs });
}

beforeEach(() => {
    local = {};
    prefs = { enabled: true, favicons: false, domainText: true, mailboxStyle: 'initial' };
    resetSenderIconsForTests();
    resetHealthCache();
    installChrome();
    setImageProbe(() => Promise.resolve('ok'));
    document.body.innerHTML = '';
});

afterEach(() => {
    resetSenderIconsForTests();
    jest.useRealTimers();
});

// ---------------------------------------------------------------------------
// The ordinary path
// ---------------------------------------------------------------------------

describe('drawing', () => {
    test('one chip per row, at the start of the subject, naming the organisation', () => {
        mount(
            rowHtml({ id: 'r1', people: [{ email: 'alerts@email.mashreq.com', name: 'Mashreq' }] }) +
                rowHtml({ id: 'r2', people: [{ email: 'billing@icici.bank.in', name: 'ICICI' }] })
        );
        install();
        const report = scanNow();

        expect(report).toMatchObject({ rows: 2, rowSource: 'aria', drawn: 2, changed: 2, status: 'active' });
        expect(chips().map((c) => c.getAttribute(CHIP_ATTR))).toEqual(['mashreq.com', 'icici.bank.in']);
        const first = chips()[0];
        expect(first.parentElement?.className).toBe(SUBJECT_CLASS);
        expect(first.parentElement?.firstElementChild).toBe(first);
        expect(first.querySelector('.glt-sender-badge')?.textContent).toBe('M');
        expect(first.querySelector('.glt-sender-domain')?.textContent).toBe('mashreq.com');
        expect(first.getAttribute('aria-hidden')).toBe('true');
    });

    test('a second scan with nothing changed touches no DOM', () => {
        mount(rowHtml({ people: [{ email: 'a@example.com', name: 'A' }] }));
        install();
        scanNow();
        const before = chips()[0];
        const report = scanNow();
        expect(report.changed).toBe(0);
        expect(chips()[0]).toBe(before);
    });

    test('nothing is drawn while the feature is off, and turning it off removes what was drawn', () => {
        mount(rowHtml({ people: [{ email: 'a@example.com', name: 'A' }] }));
        prefs.enabled = false;
        install();
        expect(scanNow().drawn).toBe(0);
        expect(chips()).toHaveLength(0);

        prefs.enabled = true;
        scanNow();
        expect(chips()).toHaveLength(1);

        prefs.enabled = false;
        refreshSenderIcons();
        expect(chips()).toHaveLength(0);
    });

    test('without the domain text the chip is just the badge', () => {
        mount(rowHtml({ people: [{ email: 'a@example.com', name: 'A' }] }));
        prefs.domainText = false;
        install();
        scanNow();
        expect(chips()[0].querySelector('.glt-sender-domain')).toBeNull();
        expect(chips()[0].classList.contains('glt-sender-chip--bare')).toBe(true);
    });

    test('a row Gmail re-rendered gets its chip back', () => {
        mount(rowHtml({ people: [{ email: 'a@example.com', name: 'A' }] }));
        install();
        scanNow();
        chips()[0].remove();
        expect(scanNow().changed).toBe(1);
        expect(chips()).toHaveLength(1);
    });

    test('a row Gmail reused for another thread gets the new sender, not the old one', () => {
        mount(rowHtml({ people: [{ email: 'a@first.com', name: 'A' }] }));
        install();
        scanNow();
        const row = document.getElementById('r1')!;
        row.querySelectorAll('[email]').forEach((el) => el.setAttribute('email', 'b@second.com'));
        scanNow();
        expect(chips().map((c) => c.getAttribute(CHIP_ATTR))).toEqual(['second.com']);
    });

    test('a row can only ever hold one chip', () => {
        mount(rowHtml({ people: [{ email: 'a@example.com', name: 'A' }] }));
        install();
        scanNow();
        const stray = chips()[0].cloneNode(true) as HTMLElement;
        document.querySelector(`.${SUBJECT_CLASS}`)!.appendChild(stray);
        scanNow();
        expect(chips()).toHaveLength(1);
    });

    test('nothing outside the list is touched, and an empty list records nothing', () => {
        document.body.innerHTML = '<div role="main"><p>Open thread</p></div>';
        install();
        expect(scanNow()).toMatchObject({ rows: 0, status: null });
        expect(local[healthKeyFor('senderIcons')]).toBeUndefined();
    });

    test('a sender name is text, never markup', () => {
        mount(rowHtml({ people: [{ email: 'x@gmail.com', name: '&lt;img src=x onerror=alert(1)&gt;' }] }));
        install();
        scanNow();
        expect(document.querySelector('img[src="x"]')).toBeNull();
        expect(chips()[0].querySelector('.glt-sender-badge')?.textContent).toBe('I');
    });
});

// ---------------------------------------------------------------------------
// Who the row is from
// ---------------------------------------------------------------------------

describe('choosing the sender', () => {
    test('the first participant who is not the user names the thread', () => {
        mount(
            rowHtml({
                people: [
                    { email: ME, name: 'me' },
                    { email: 'client@example.com', name: 'Client' },
                ],
            })
        );
        const sender = pickSender(threadGroup(document.getElementById('r1')!), ME);
        expect(sender?.address).toBe('client@example.com');
    });

    test('the user is compared without regard to case', () => {
        mount(
            rowHtml({
                people: [
                    { email: ME.toUpperCase(), name: 'me' },
                    { email: 'b@b.com', name: 'B' },
                ],
            })
        );
        expect(pickSender(threadGroup(document.getElementById('r1')!), ME)?.address).toBe('b@b.com');
    });

    test('a thread with only the user in it is named after the user', () => {
        mount(rowHtml({ people: [{ email: ME, name: 'me' }] }));
        expect(pickSender(threadGroup(document.getElementById('r1')!), ME)?.address).toBe(ME);
    });

    test('the hovercard attribute is the fallback when the email attribute is gone', () => {
        mount(rowHtml({ people: [{ hovercard: 'news@example.org', name: 'News' }] }));
        install();
        const report = scanNow();
        expect(chips()[0].getAttribute(CHIP_ATTR)).toBe('example.org');
        expect(report).toMatchObject({ status: 'degraded', reason: 'fallback-sender' });
    });

    test('a row with no readable address gets no chip, and says so when no row has one', () => {
        mount(rowHtml({ people: [{ email: 'not-an-address', name: 'Draft' }] }));
        install();
        // No row carries an address, so none is a thread row by that test.
        expect(scanNow().rows).toBe(0);
        expect(chips()).toHaveLength(0);
    });
});

// ---------------------------------------------------------------------------
// The fallbacks, one layer at a time
// ---------------------------------------------------------------------------

describe('finding rows', () => {
    test('rows without their ARIA role are found by the fallback class, and that is recorded', () => {
        mount(rowHtml({ aria: false, people: [{ email: 'a@example.com', name: 'A' }] }));
        install();
        const report = scanNow();
        expect(report).toMatchObject({ rowSource: 'fallback', status: 'degraded', reason: 'fallback-rows' });
        expect(chips()).toHaveLength(1);
        expect(local[healthKeyFor('senderIcons')]).toMatchObject({ status: 'degraded', reason: 'fallback-rows' });
    });

    test('a class learned while ARIA worked is tried before the shipped fallback', async () => {
        local[LEARNED_SELECTORS_KEY] = { row: 'newRow', subject: SUBJECT_CLASS };
        mount(rowHtml({ aria: false, rowClass: 'newRow', people: [{ email: 'a@example.com', name: 'A' }] }));
        install();
        await flush();
        expect(scanNow().rowSource).toBe('learned');
    });

    test('while ARIA works, the classes Gmail uses today are learned, and written only on change', () => {
        mount(
            ['r1', 'r2', 'r3'].map((id) => rowHtml({ id, people: [{ email: `${id}@example.com`, name: id }] })).join('')
        );
        install();
        scanNow();
        expect(local[LEARNED_SELECTORS_KEY]).toMatchObject({ row: ROW_CLASS, subject: SUBJECT_CLASS });
        const writes = (chrome.storage.local.set as jest.Mock).mock.calls.filter(
            ([items]) => LEARNED_SELECTORS_KEY in items
        );
        scanNow();
        scanNow();
        const after = (chrome.storage.local.set as jest.Mock).mock.calls.filter(
            ([items]) => LEARNED_SELECTORS_KEY in items
        );
        expect(after).toHaveLength(writes.length);
    });

    test('a learned value that is not a plain class token is never put in a selector', async () => {
        local[LEARNED_SELECTORS_KEY] = { row: 'zA"],script,[x="', subject: 'x y' };
        mount(rowHtml({ aria: false, people: [{ email: 'a@example.com', name: 'A' }] }));
        install();
        await flush();
        expect(() => scanNow()).not.toThrow();
        expect(scanNow().rowSource).toBe('fallback');
    });
});

describe('placing the chip', () => {
    test('without the row link, the subject class is the fallback', () => {
        mount(rowHtml({ link: false, people: [{ email: 'a@example.com', name: 'A' }] }));
        install();
        const report = scanNow();
        expect(report).toMatchObject({ status: 'degraded', reason: 'fallback-anchor' });
        expect(chips()[0].parentElement?.className).toBe(SUBJECT_CLASS);
    });

    test('without the link or the subject class, the sender cell holds it', () => {
        mount(rowHtml({ link: false, subjectClass: false, people: [{ email: 'a@example.com', name: 'A' }] }));
        const group = threadGroup(document.getElementById('r1')!);
        expect(findAnchor(group)?.source).toBe('sender-cell');
        install();
        scanNow();
        expect(chips()[0].closest('td')?.className).toBe('yX xY');
    });

    test('in the split reading pane, a continuation row supplies the subject', () => {
        mount(
            `<tr id="r1" role="row"><td role="gridcell"><span email="a@example.com" name="A">A</span></td></tr>` +
                `<tr><td role="gridcell"><div role="link"><div class="subject-box"></div></div></td></tr>`
        );
        const group = threadGroup(document.getElementById('r1')!);
        expect(group).toHaveLength(2);
        install();
        scanNow();
        expect(chips()[0].parentElement?.className).toBe('subject-box');
    });
});

// ---------------------------------------------------------------------------
// Mailbox providers
// ---------------------------------------------------------------------------

describe('mailbox providers', () => {
    const sender = { address: 'priya.k@gmail.com', name: 'Priya K', host: 'gmail.com', source: 'email' as const };

    test('by default, the sender’s own initial, and no icon is fetched for the provider', () => {
        const spec = chipSpecFor(sender, prefs);
        expect(spec.letter).toBe('P');
        expect(spec.iconHost).toBeNull();
        prefs.favicons = true;
        expect(chipSpecFor(sender, prefs).iconHost).toBeNull();
    });

    test('two people on the same provider get their own colours, not one shared one', () => {
        const other = { ...sender, address: 'zed@gmail.com', name: 'Zed' };
        const colours = new Set(
            ['a', 'b', 'c', 'd', 'e', 'f'].map(
                (n) => chipSpecFor({ ...other, address: `${n}@gmail.com` }, prefs).colour
            )
        );
        expect(colours.size).toBeGreaterThan(1);
    });

    test('with the provider style, the provider is treated like any organisation', () => {
        prefs.mailboxStyle = 'provider';
        prefs.favicons = true;
        const spec = chipSpecFor(sender, prefs);
        expect(spec.letter).toBe('G');
        expect(spec.iconHost).toBe('gmail.com');
    });

    test('a name with no letters falls back to the address, then to a question mark', () => {
        expect(chipSpecFor({ ...sender, name: '' }, prefs).letter).toBe('P');
        expect(chipSpecFor({ ...sender, name: '☺', address: '__@gmail.com' }, prefs).letter).toBe('?');
    });
});

// ---------------------------------------------------------------------------
// Website icons, off to the side
// ---------------------------------------------------------------------------

describe('website icons', () => {
    function deferredProbe() {
        const calls: Array<{ url: string; resolve: (r: ProbeResult) => void }> = [];
        setImageProbe((url) => new Promise((resolve) => calls.push({ url, resolve })));
        return calls;
    }

    test('nothing is requested unless the user opted in', () => {
        const probe = jest.fn(() => Promise.resolve('ok' as ProbeResult));
        setImageProbe(probe);
        mount(rowHtml({ people: [{ email: 'a@example.com', name: 'A' }] }));
        install();
        scanNow();
        expect(probe).not.toHaveBeenCalled();
        expect(document.querySelector('img')).toBeNull();
    });

    test('the badge is drawn at once, and the icon replaces it only once it has loaded', async () => {
        const calls = deferredProbe();
        prefs.favicons = true;
        mount(rowHtml({ people: [{ email: 'a@example.com', name: 'A' }] }));
        install();
        scanNow();
        expect(chips()[0].getAttribute('data-glt-kind')).toBe('badge');
        expect(calls).toHaveLength(1);
        expect(calls[0].url).toContain('t0.gstatic.com');
        expect(calls[0].url).toContain(encodeURIComponent('https://example.com'));

        calls[0].resolve('ok');
        await flush();
        scanNow();
        const img = chips()[0].querySelector('img');
        expect(chips()[0].getAttribute('data-glt-kind')).toBe('icon');
        expect(img?.getAttribute('src')).toBe(calls[0].url);
        expect(img?.referrerPolicy).toBe('no-referrer');
    });

    test('a subdomain with no icon of its own falls back to the organisation', async () => {
        const calls = deferredProbe();
        prefs.favicons = true;
        mount(rowHtml({ people: [{ email: 'alerts@email.mashreq.com', name: 'Mashreq' }] }));
        install();
        scanNow();
        calls[0].resolve('placeholder');
        await flush();
        // A placeholder is an answer, so the second provider is not asked about the same host.
        expect(calls).toHaveLength(2);
        expect(calls[1].url).toContain(encodeURIComponent('https://mashreq.com'));
        calls[1].resolve('ok');
        await flush();
        scanNow();
        expect(chips()[0].getAttribute('data-glt-kind')).toBe('icon');
    });

    test('when the first provider cannot be reached, the second is asked', async () => {
        const calls = deferredProbe();
        prefs.favicons = true;
        mount(rowHtml({ people: [{ email: 'a@example.com', name: 'A' }] }));
        install();
        scanNow();
        calls[0].resolve('error');
        await flush();
        expect(calls[1].url).toContain('www.google.com/s2/favicons');
    });

    test('a slow network holds at most four requests in flight and never blanks a badge', () => {
        const calls = deferredProbe();
        prefs.favicons = true;
        mount(
            Array.from({ length: 10 }, (_, i) =>
                rowHtml({ id: `r${i}`, people: [{ email: `a@org${i}.com`, name: `Org ${i}` }] })
            ).join('')
        );
        install();
        scanNow();
        expect(calls).toHaveLength(4);
        expect(chips()).toHaveLength(10);
        expect(chips().every((c) => c.getAttribute('data-glt-kind') === 'badge')).toBe(true);
    });

    test('a browser that loads no icons at all is recorded as working without them', async () => {
        setImageProbe(() => Promise.resolve('error'));
        prefs.favicons = true;
        mount(
            Array.from({ length: 6 }, (_, i) =>
                rowHtml({ id: `r${i}`, people: [{ email: `a@org${i}.com`, name: `Org ${i}` }] })
            ).join('')
        );
        install();
        scanNow();
        await flush();
        const report = scanNow();
        expect(report).toMatchObject({ status: 'degraded', reason: 'favicon-unreachable' });
        expect(chips().every((c) => c.getAttribute('data-glt-kind') === 'badge')).toBe(true);
    });

    test('once icons are unreachable, fetching pauses instead of failing once per sender', async () => {
        const probe = jest.fn(() => Promise.resolve('error' as ProbeResult));
        setImageProbe(probe);
        prefs.favicons = true;
        mount(
            Array.from({ length: 5 }, (_, i) =>
                rowHtml({ id: `r${i}`, people: [{ email: `a@org${i}.com`, name: `Org ${i}` }] })
            ).join('')
        );
        install();
        scanNow();
        await flush();
        const afterPause = probe.mock.calls.length;

        // New senders arrive while paused: they get badges and cost nothing.
        document
            .querySelector('tbody')!
            .insertAdjacentHTML(
                'beforeend',
                Array.from({ length: 5 }, (_, i) =>
                    rowHtml({ id: `n${i}`, people: [{ email: `a@new${i}.com`, name: `New ${i}` }] })
                ).join('')
            );
        scanNow();
        await flush();
        expect(probe.mock.calls.length).toBe(afterPause);
        expect(chips()).toHaveLength(10);
    });

    test('turning website icons off stops every queued request at once', async () => {
        const calls = deferredProbe();
        prefs.favicons = true;
        mount(
            Array.from({ length: 10 }, (_, i) =>
                rowHtml({ id: `r${i}`, people: [{ email: `a@org${i}.com`, name: `Org ${i}` }] })
            ).join('')
        );
        install();
        scanNow();
        expect(calls).toHaveLength(4);

        prefs.favicons = false;
        refreshSenderIcons();
        // The four in flight answer; nothing queued behind them is asked for.
        calls.forEach((c) => c.resolve('ok'));
        await flush();
        expect(calls).toHaveLength(4);
        scanNow();
        expect(document.querySelector('[data-glt-sender] img')).toBeNull();
    });

    test('an icon that arrives after the page was handed over is dropped', async () => {
        const calls = deferredProbe();
        prefs.favicons = true;
        mount(rowHtml({ people: [{ email: 'a@example.com', name: 'A' }] }));
        install();
        scanNow();
        uninstallSenderIcons();
        expect(chips()).toHaveLength(0);
        calls[0].resolve('ok');
        await flush();
        expect(chips()).toHaveLength(0);
    });
});

// ---------------------------------------------------------------------------
// Staying out of Gmail's way
// ---------------------------------------------------------------------------

describe('the observer', () => {
    // Fake timers, because the scan is deliberately throttled: waiting in
    // event-loop turns would race the 50ms gap under a loaded test run.
    async function settle(): Promise<void> {
        await microtasks();
        jest.advanceTimersByTime(200);
        await microtasks();
    }

    test('a change inside the list schedules a scan; our own chip going in does not loop', async () => {
        jest.useFakeTimers();
        mount(rowHtml({ people: [{ email: 'a@example.com', name: 'A' }] }));
        install();
        await settle();
        expect(chips()).toHaveLength(1);

        // Gmail discards the chip on its own: it comes back.
        chips()[0].remove();
        await settle();
        expect(chips()).toHaveLength(1);

        // And settles: with nothing changing, no timer is left pending.
        await settle();
        expect(jest.getTimerCount()).toBe(0);
    });

    test('a subject Gmail replaced gets its chip back before the next paint, not after a timer', async () => {
        jest.useFakeTimers();
        mount(rowHtml({ people: [{ email: 'a@example.com', name: 'A' }] }));
        install();
        await settle();
        // Gmail swaps the whole subject cell's content, as measured live.
        const link = document.querySelector('[role="link"]')!;
        link.innerHTML = `<div class="${SUBJECT_CLASS}"><div class="y6"><span>Hello again</span></div></div>`;
        // Microtasks only: the observer callback, which runs before paint.
        await microtasks();
        expect(chips()).toHaveLength(1);
        expect(chips()[0].parentElement?.parentElement).toBe(link);
    });

    test('the chip Gmail discarded with its cell is put back, not rebuilt', async () => {
        jest.useFakeTimers();
        mount(rowHtml({ people: [{ email: 'a@example.com', name: 'A' }] }));
        install();
        await settle();
        const before = chips()[0];
        const link = document.querySelector('[role="link"]')!;
        link.innerHTML = `<div class="${SUBJECT_CLASS}"><div class="y6"><span>Hello again</span></div></div>`;
        await microtasks();
        expect(chips()).toHaveLength(1);
        expect(chips()[0]).toBe(before);
    });

    test('a discarded chip that no longer matches the settings is rebuilt', async () => {
        jest.useFakeTimers();
        mount(rowHtml({ people: [{ email: 'a@example.com', name: 'A' }] }));
        install();
        await settle();
        const before = chips()[0];
        prefs = { ...prefs, domainText: false };
        const link = document.querySelector('[role="link"]')!;
        link.innerHTML = `<div class="${SUBJECT_CLASS}"><div class="y6"><span>Hello again</span></div></div>`;
        await microtasks();
        expect(chips()).toHaveLength(1);
        expect(chips()[0]).not.toBe(before);
        expect(chips()[0].querySelector('.glt-sender-domain')).toBeNull();
    });

    test('a change outside the list does not scan', async () => {
        jest.useFakeTimers();
        mount(rowHtml({ people: [{ email: 'a@example.com', name: 'A' }] }));
        install();
        await settle();
        // Make the chip stale in a way the observer cannot see (an attribute,
        // not a child), so any scan at all would replace it.
        const chip = chips()[0];
        chip.setAttribute('data-glt-key', 'stale');
        document.getElementById('outside')!.appendChild(document.createElement('span'));
        await settle();
        expect(chips()[0]).toBe(chip);

        // The same change inside the list does scan.
        document.getElementById('r1')!.appendChild(document.createElement('td'));
        await settle();
        expect(chips()[0]).not.toBe(chip);
    });

    test('a row whose chip Gmail keeps removing is eventually left alone', () => {
        mount(rowHtml({ people: [{ email: 'a@example.com', name: 'A' }] }));
        install();
        let inserted = 0;
        for (let i = 0; i < 50; i++) {
            inserted += scanNow().changed;
            chips()[0]?.remove();
        }
        expect(inserted).toBe(30);
    });
});
