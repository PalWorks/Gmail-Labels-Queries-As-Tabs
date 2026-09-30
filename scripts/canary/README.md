# The Gmail drift canary

Gmail is a third-party page we do not control. This watches the handful of
structural facts the label-menu and sender-icons features depend on, and says
so when one stops being true, including when a fallback is quietly doing the
work.

## What it does not watch

Class names. `J-N`, `J-M J-M-ayU aka`, `pM aj0` and the rest are read at
runtime and never written into our source, so a Gmail rename cannot break us.
Measured on 2026-09-23: two independent Chrome installations, different
`--user-data-dir`, different Chrome patch builds, separate sessions, produced
byte-identical class strings and identical element counts. What varies is the
Gmail build, which is global and occasional, and what a build can take away is
structure.

With two exceptions, both deliberate: the sender icons fallbacks
`SENDER_ROW_FALLBACK` and `SENDER_SUBJECT_FALLBACK` are class names written
into `src/utils/selectors.ts`, because they are what the feature falls back to
when ARIA does not answer. They are never the primary path, so a rename cannot
break the feature; W1 and W2 watch them so that a rename is noticed, and
refreshed, before the day the fallback is needed.

## The contract

| Check | What it asserts | Failure |
|---|---|---|
| C1 | A label row exposes its name without classes | Cannot identify the label |
| C2 | Clicking the trigger makes exactly one `[role="menu"]` visible | Cannot find the menu |
| C3 | That menu holds a `[role="menuitem"]` with no `aria-haspopup` and height | No model to clone |
| C4 | A clone of that item renders identically to it | Our item would look foreign |
| OURS | Our own item is present and styled like its siblings | Only checked once a build ships it |
| HOVER | Our own item lights up under the pointer | Only checked once a build ships it |
| S1 | Inbox rows are `tr[role="row"]` with an id inside `[role="main"]` | Rows only by fallback |
| S2 | Those rows carry the sender in an `email` attribute | Sender only by `data-hovercard-id` |
| S3 | Each row's `[role="link"]` has a first child for the chip | Chip only by fallback placement |
| S4 | Our chips are drawn on at least 90% of rows and no row changes height | Ours, not Gmail's |
| W1 | `SENDER_ROW_FALLBACK` still matches the rows S1 found | The fallback would not hold (DEGRADED) |
| W2 | `SENDER_SUBJECT_FALLBACK` still matches the containers S3 found | The fallback would not hold (DEGRADED) |
| W3 | Both favicon providers answer with a real icon for a known domain | Website icons degrade to badges (DEGRADED) |

Every one of these fails closed: no model, no item, no row, no chip, and Gmail
is exactly as it was.

To judge S1 to W3 the canary switches sender icons on in its own throwaway
profile (the extension ships with them off), with website icons on and the
provider style for mailbox senders, so every chip is eligible for an icon.

## Three verdicts that work, one that does not

**PASS** (0), **SKIPPED** (3, not signed in: nothing learned), and **DEGRADED**
(5): everything works, but only because a fallback held, or a shipped fallback
has stopped matching and would not hold next time. **FAIL** (2) is the only one
where something is broken on screen. **ERROR** (4) is the canary itself.

## Refreshing a fallback

When W1 or W2 fails while S1 to S3 hold, the canary knows exactly which
elements the fallback should have matched, so it reads what Gmail calls them
today and writes `selector-proposal.json`. `run-canary.sh` then runs
`propose-selectors.mjs`, if `GLT_CANARY_AUTO_PR=1` is set in `alerts.env`,
which applies the value to `src/utils/selectors.ts` in a throwaway git
worktree, runs `test/senderIcons.test.ts` and `test/repoConsistency.test.ts`
against it, and opens a pull request. It never merges, it opens one pull
request per distinct value, and it may change only the two sender fallbacks,
each only to a plain class selector. To rehearse it by hand:

```
NODE_PATH=$(npm root -g) node scripts/canary/gmail-drift-canary.mjs --no-record \
    --selectors-file /tmp/stale-selectors.ts --proposal-out /tmp/proposal.json
node scripts/canary/propose-selectors.mjs --proposal /tmp/proposal.json --dry-run
```

**How Gmail highlights** is recorded alongside HOVER but not asserted. Gmail
adds a class from its own `jsaction` handler rather than using a `:hover` rule,
and the extension learns that class at runtime (ADR-024). If Gmail ever moved
to a stylesheet, the fingerprint would show the class disappearing while HOVER
stayed green, because the extension falls back to a wash of its own.

**C5**, whether Gmail reuses one menu node across labels, is **recorded but not
asserted**. It was written as an assertion because an implementation that
injected once and left the item there would depend on it absolutely: the item
would keep acting on the label before last. Ours removes the item when a menu
closes and rebuilds it when one opens, and its removal searches the whole
document rather than one menu, so either behaviour is fine. Gmail has been
observed doing both.

**OURS is not judged** when Gmail took longer to open the menu than the
extension waits (`MENU_WAIT_MS`, read out of the source rather than copied). An
absent item then is the extension behaving exactly as designed.

## Running it by hand

```
npm run build
NODE_PATH=$(npm root -g) node scripts/canary/gmail-drift-canary.mjs
```

Options: `--profile <dir>`, `--dist <dir>`, `--json`, `--keep`,
`--no-extension` (measure Gmail alone, without loading our build).

Exit codes: `0` PASS, `2` FAIL, `3` SKIPPED, `4` ERROR. **SKIPPED is not
FAIL**: it means the canary could not reach a signed-in Gmail and therefore
learned nothing. A canary that cries wolf when a cookie expires is a canary
that gets ignored inside a fortnight.

Two more things exist for the same reason. A run whose menu never opened takes
**a second opinion in a completely fresh browser** before reporting anything,
because that is the one flaky outcome this has: a cold headless profile
sometimes never answers a click at all, and everything downstream of C2 fails
with it. And several Chrome profiles are tried in turn, because nothing on disk
distinguishes a signed-in one cheaply and reaching Gmail is the only honest
test.

It never touches the browser you are using. It copies the cookie and
preference files out of a signed-in profile (about 1.2 MB, six files, never
`Login Data`: the saved passwords are not needed, since the session rides on the cookies), runs
headless Chrome on a private port against the copy, and deletes the copy
afterwards whatever happens, including on failure and on Ctrl-C.

## Running it daily

```
scripts/canary/install-canary.sh          # install and enable the user timer
scripts/canary/install-canary.sh --status # when it last ran and what it said
scripts/canary/install-canary.sh --remove # stop and delete
```

Daily, with a randomised delay of up to 30 minutes and `Persistent=true` so a
run missed while the machine was off happens at the next boot. Daily is chosen
because it is free and because it is shorter than a Chrome Web Store review
cycle, which is the real floor on how fast we could respond anyway.

`run-canary.sh` keeps the consecutive-failure count and decides whether anyone
is told. Escalation is on the **second** consecutive failure: a desktop
notification, a GitHub issue deduplicated by title so a persisting break opens
one issue and not one a day, and a Google Chat message. Notifications repeat
weekly while the break persists, and a recovery is announced in the thread of
what broke. DEGRADED escalates the same way but opens no issue. ERROR does open
one, and a build that fails before the canary can run counts as an ERROR, in the
same streak.

A SKIPPED run breaks no streak, but seven in a row means the canary has learned
nothing for a week, usually because the Gmail session expired. The seventh
consecutive skip sends one desktop notification and one Google Chat message, in
its own `canary-skipped` thread, and opens no issue; any run that is not a skip
resets the count. Output embedded in a GitHub issue has the home directory
replaced with `~`, so no issue publishes a local path.

## Google Chat alerts

```
scripts/canary/install-canary.sh --alerts      # create ~/.config/gmail-labels-as-tabs/alerts.env (mode 600)
scripts/canary/install-canary.sh --test-alert  # send one test message
```

In the Google Chat space, open **Apps & integrations**, then **Webhooks**, add
one, and paste its URL into `GCHAT_WEBHOOK_URL` in that file. The URL is a
credential: it lives only there, `notify.mjs` never prints it, and only a
`https://chat.googleapis.com/v1/spaces/.../messages` URL is accepted. Some
Google Workspace administrators turn incoming webhooks off; the test alert is
how to find out. Delivery is three attempts of ten seconds each. Each kind of
break (`canary-fail`, `canary-error`, `canary-degraded`, `canary-skipped`) has its own thread.

## The files

| File | Committed | What it is |
|---|---|---|
| `gmail-drift-canary.mjs` | yes | The measurement. Reports; never escalates |
| `run-canary.sh` | yes | The escalation. Streak counting, notify-send, `gh issue create`, Google Chat |
| `notify.mjs` | yes | Delivers one Google Chat alert. Decides nothing |
| `propose-selectors.mjs` | yes | Turns a selector proposal into a pull request. Never merges |
| `install-canary.sh` | yes | Writes and enables the systemd user units; creates the alert config |
| `selector-proposal.json` | no | Written only while a sender fallback has rotted; removed when it no longer has |
| `~/.config/gmail-labels-as-tabs/alerts.env` | never | The webhook and the auto-PR switch. Outside the repository on purpose |
| `fingerprint.json` | yes | What Gmail looked like on the last run that changed anything |
| `history.ndjson` | no | One line per run, including skips |
| `state.json` | no | The streak counters |
| `canary.log` | no | Human-readable log of every run |

`fingerprint.json` is rewritten only when something it records actually moves,
so its git history is a log of Gmail changes rather than a daily timestamp
commit. That history is the dataset nobody has today: how often this actually
drifts.

## What it cannot see

One Google account, one Gmail build, one A/B bucket, and only when this
machine is on. It cannot tell us that some percentage of users in a different
experiment get a different menu. That gap is what the in-product health signal
on the options page exists to close, by giving those users something to
report.
