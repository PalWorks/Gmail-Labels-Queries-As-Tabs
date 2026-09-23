# The Gmail drift canary

Gmail is a third-party page we do not control. This watches the handful of
structural facts the label-menu feature depends on, and says so when one stops
being true.

## What it does not watch

Class names. `J-N`, `J-M J-M-ayU aka`, `pM aj0` and the rest are read at
runtime and never written into our source, so a Gmail rename cannot break us.
Measured on 2026-09-23: two independent Chrome installations, different
`--user-data-dir`, different Chrome patch builds, separate sessions, produced
byte-identical class strings and identical element counts. What varies is the
Gmail build, which is global and occasional, and what a build can take away is
structure.

## The contract

| Check | What it asserts | Failure |
|---|---|---|
| C1 | A label row exposes its name without classes | Cannot identify the label |
| C2 | Clicking the trigger makes exactly one `[role="menu"]` visible | Cannot find the menu |
| C3 | That menu holds a `[role="menuitem"]` with no `aria-haspopup` and height | No model to clone |
| C4 | A clone of that item renders identically to it | Our item would look foreign |
| OURS | Our own item is present and styled like its siblings | Only checked once a build ships it |

Every one of these fails closed: no model, no item, and Gmail is exactly as it
was.

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
preference files out of a signed-in profile (about 1.2 MB, seven files), runs
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
notification, and a GitHub issue deduplicated by title so a persisting break
opens one issue and not one a day.

## The files

| File | Committed | What it is |
|---|---|---|
| `gmail-drift-canary.mjs` | yes | The measurement. Reports; never escalates |
| `run-canary.sh` | yes | The escalation. Streak counting, notify-send, `gh issue create` |
| `install-canary.sh` | yes | Writes and enables the systemd user units |
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
