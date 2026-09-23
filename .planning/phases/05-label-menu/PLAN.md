# v1.7.0: "Show as Tabs" in Gmail's label menu, with drift detection built first

Status: executed 2026-09-23, shipped as v1.7.0
Written: 2026-09-23
Supersedes nothing. Depends on: InboxSDK removal (commit f64a81d, ADR-021).

This document is under `.planning/phases/`, which the repository-consistency guard
treats as archived, because it names files that do not exist yet.

---

## 0. What this is, and the order it happens in

Three pieces of work, deliberately sequenced so the risky one lands last and lands
with instrumentation already around it.

| Phase | What | Why it is here and not later |
|---|---|---|
| 0 | InboxSDK removed | Done. Restore point, and it is the reason we now own the Gmail coupling outright |
| 1 | Drift canary | Measures whether Gmail's structure moves at all, before we bet a feature on it |
| 2 | Local health signal | Covers the users the canary will never reach: other accounts, other A/B buckets |
| 3 | The menu item | Built against a contract that is now measured and monitored |
| 4 | Release 1.7.0 | One release, one review cycle |

Phases 1 and 2 are useful even if phase 3 is cancelled. That is the point of the order.

---

## 1. The premise, restated from measurement

Gmail's class names (`J-N`, `J-M J-M-ayU aka`, `pM aj0`, `J-Kh`) are **not** randomised
per installation. Two independent Chrome installations, different `--user-data-dir`,
different Chrome patch builds, separate sessions, produced byte-identical class strings and
identical element counts on 2026-09-23. A competitor's shipped bundle hardcodes the same
strings and its May and July 2026 builds carry them unchanged. InboxSDK hardcodes them too.

What varies is the **Gmail build**, which is global and occasional. The design below reads
Gmail's classes at runtime and writes none, so a rename cannot break it. What can break it
is a short list of structural facts, and that list is what the canary watches.

### The contract

| # | Invariant | Failure mode | Fallback |
|---|---|---|---|
| C1 | A label row exposes its name without classes | Cannot identify the label | `[data-label-name]`, then ancestor `data-tooltip`, then `a[href*="#label/"]` |
| C2 | Clicking the trigger makes exactly one `[role="menu"]` visible | Cannot find the menu | Bounded poll, then give up |
| C3 | The menu holds a `[role="menuitem"]` with no `aria-haspopup` and non-zero height | No model to clone | Do not inject |
| C4 | A clone of that model renders identically | Our item looks foreign | Do not inject |
| C5 | Gmail reuses one menu node across labels | Item shows the previous label | Remove on close, re-add on open (the design already does this) |

C5 is the only invariant whose breakage is silently wrong rather than merely absent.
Everything else fails closed: no model, no item, and Gmail is exactly as it was.

---

## 2. Phase 1: the drift canary

### 2.1 What it is

`scripts/canary/gmail-drift-canary.mjs`, a standalone Node script. Roughly 40 seconds per
run. It never touches the user's own browser.

1. Copy the signed-in Chrome profile's cookie and preference files into a temporary
   directory (about 1.2 MB, the same slim clone used for store-asset generation).
2. Launch headless Chrome on a private port with `--disable-sync`.
3. Load the built `dist/` through CDP `Extensions.loadUnpacked`. Chrome 137 and later
   ignore `--load-extension`, which is why this is CDP and not a flag.
4. Open Gmail. If not signed in, exit `3` (SKIPPED). This distinction is the whole
   difference between a useful canary and one that is ignored after a fortnight.
5. Assert C1 through C5, and from phase 3 onward, that our own menu item is present,
   correctly labelled and correctly styled.
6. Write a fingerprint record and exit `0` or `2`.
7. Delete the clone, unconditionally, including on failure.

### 2.2 The fingerprint

`scripts/canary/fingerprint.json`, committed, overwritten on every passing run:

```
{
  "observedAt": "...",
  "gmailBuild": "fbb486d87c",
  "chrome": "153.0.8010.52",
  "labelRows": 36,
  "labelTriggers": 31,
  "menuClasses": "J-M J-M-ayU aka",
  "menuItemClasses": ["J-N", "J-N J-Ph"],
  "separatorClasses": "J-Kh",
  "visibleMenuItems": 5,
  "menuNodeReused": true,
  "contract": { "C1": "data-label-name", "C2": true, "C3": true, "C4": true, "C5": true }
}
```

Its git history is the dataset nobody has today: how often Gmail actually changes this.
`scripts/canary/history.ndjson` appends one line per run including failures and skips, so
the rate is recoverable even when the fingerprint is overwritten.

### 2.3 Scheduling and alerting

A systemd **user** timer, not cron, because three user timers already run on this machine
and `systemctl --user status` gives a failure record that cron does not.

- `scripts/canary/gmail-drift-canary.timer`, daily, with `Persistent=true` so a run missed
  while the machine was off happens on the next boot.
- `scripts/canary/install-canary.sh` to install and enable it, and to print how to remove it.
- Escalation on the **second consecutive** failure, never the first. A single failure is
  far more likely to be a slow Gmail load or an expired session than a Gmail redesign.
  State in `scripts/canary/state.json`, gitignored.
- On escalation: `notify-send` on the desktop, and `gh issue create` with the fingerprint
  diff in the body, deduplicated by a fixed title so a persisting break opens one issue and
  not one a day.

### 2.4 Why daily

Cheap enough to be free, and shorter than a Chrome Web Store review cycle, which is the
real floor on how fast we could respond anyway. Hourly would add session churn for nothing:
Gmail does not ship builds hourly.

### 2.5 What it cannot see

One account, one Gmail build, one A/B bucket, and only when this machine is on. It cannot
tell us that some percentage of users in a different experiment get a different menu. That
gap is phase 2, and it is why phase 2 is not optional.

### 2.6 Documentation and exit criteria

- `TESTING.md` gains a row under "What no guard here can see", because this is exactly that
  category: a fact about a live third-party page that no jsdom assertion can reach.
- `PLAYBOOK.md` gains "When the canary fails", listing each contract number and what to
  change for it.
- Exit criteria: the script passes against today's Gmail, correctly reports SKIPPED with
  cookies removed, correctly reports FAIL against a deliberately broken selector, the timer
  is installed and has fired once, and the clone directory is gone afterwards in all three
  cases.

---

## 3. Phase 2: the local health signal

### 3.1 What it is

The content script records whether its last attempt to install the menu item succeeded, in
`chrome.storage.local` under `integrationHealth`. The options page shows one row. Nothing
is transmitted anywhere.

```
integrationHealth = {
  labelMenu: {
    status: 'active' | 'unavailable' | 'not-attempted',
    reason?: 'no-trigger' | 'no-menu' | 'no-model' | 'clone-mismatch',
    at: <epoch ms>,
    gmailBuildSeen?: string
  }
}
```

### 3.2 Files

| File | Change |
|---|---|
| `src/modules/health.ts` | New. `recordIntegrationHealth(component, status, reason?)` and `readIntegrationHealth()`. Every storage access try/caught, as `themeMirror.ts` does |
| `src/modules/labelMenu.ts` | Calls it at each decision point (phase 3) |
| `src/options.html` | One row in the Settings section: label, status pill, and a "Copy diagnostics" button |
| `src/options.ts` | Renders the row, wires the copy button to the clipboard |
| `src/options.css` | Status pill tokens, taken from the existing palette so `contrast.test.ts` stays green |
| `DATA_MODEL.md` | The new `chrome.storage.local` key, in the storage table |

### 3.3 The privacy line, held explicitly

The listing says nothing leaves the browser. So:

- no automatic transmission, of anything, ever;
- no new host, no new permission, so `SECURITY.md`, the published privacy policy and the
  store listing's data-usage answers are all unchanged, and CI's published-policy check
  keeps passing without a deploy in the other repository;
- the diagnostic is a string the **user** copies and pastes if they choose to write in.

This is deliberately less convenient than prefilling the feedback form. Convenience there
would convert a user-initiated support message into an automatic upload, and the whole
positioning of the product rests on that not happening.

### 3.4 Exit criteria

Unit tests for `health.ts` including the storage-throws path; an options-page test that the
row reflects each status; no new outbound host in `background.ts`, which the existing
disclosure guard already enforces.

---

## 4. Phase 3: the menu item

### 4.1 Decisions taken

| Question | Decision |
|---|---|
| Wording | Toggle: **"Show as Tabs"** when the label has no tab, **"Remove from Tabs"** when it does |
| Position | Bottom of the menu, after a separator cloned from Gmail's own |
| Sublabels | The item appears on every label row, parent and child alike, and adds **that label only**. No aggregation. See section 4.6 |
| Permissions | **None added.** This works entirely within the existing content script and `host_permissions` |

### 4.2 New module: `src/modules/labelMenu.ts`

Hardcodes no Gmail class name. Its only inputs are ARIA roles and data attributes.

```
installLabelMenuItem({ getAccountId, getTabs, onChanged })
  ├── capture-phase mousedown listener on document
  │     └── resolveLabelName(target)          C1
  │           1. closest('[data-label-name]')
  │           2. ancestor data-tooltip
  │           3. nearest a[href*="#label/"]
  ├── awaitMenu()                              C2
  │     └── bounded: MutationObserver + poll, ~1s ceiling, then give up
  ├── pickModel(menu)                          C3
  │     └── last [role="menuitem"] with height and no aria-haspopup
  ├── buildItem(model, labelName)              C4
  │     ├── model.cloneNode(true)
  │     ├── replace the wrapper's text with the i18n string
  │     ├── verify height, font, padding, colour against the model
  │     └── tabindex="0" + Enter/Space handler, because Gmail's own
  │         keyboard handling only knows about its own items
  ├── findSeparator(menu)
  │     └── a child between two menuitems that has no role attribute
  └── on click: addTab | removeTab, renderTabs(), close the menu
```

### 4.3 Lifecycle, driven by what was measured

Gmail **reuses one menu node** across labels. Verified 2026-09-23: opening the menu on two
different labels returned the identical DOM node, and an injected item survived close and
reopen on its own.

Two consequences, and they point the same way:

1. The item must be **re-targeted** on every open, or it acts on the previously clicked
   label. This is the C5 failure and it is the only silent-wrong one.
2. The item must be **removed when the menu closes**, because the same node might be reused
   for a menu that is not a label menu. Eight to ten `[role="menu"]` nodes exist in a Gmail
   page; we have confirmed the reuse within label menus, not the absence of reuse across
   kinds.

So: remove on close, rebuild on open. It costs a clone per menu open, which is nothing, and
it makes leakage structurally impossible rather than empirically unobserved.

### 4.4 Integration points

| File | Change |
|---|---|
| `src/modules/labelMenu.ts` | New, as above |
| `src/content.ts` | Call `installLabelMenuItem()` from `finalizeInit()`, after settings load, because the wording depends on the current tab list |
| `src/modules/tabs.ts` | No change. `renderTabs()` is already the re-render entry point |
| `src/utils/storage.ts` | No change. `addTab()` and `removeTab()` already do exactly this, through the same `SettingsOp` path every other surface uses |
| `_locales/en/messages.json` | `labelMenuShowAsTabs`, `labelMenuRemoveFromTabs` |
| `src/ui/toolbar.css` | No change. The item inherits Gmail's styling; adding CSS would be the beginning of drift |

Note what is **not** in that list. No new permission, no new storage key beyond phase 2's,
no new message type, no change to the settings write path. The feature is a new caller of
machinery that already exists and is already tested.

### 4.5 Tests

`test/labelMenu.test.ts`, against a jsdom fixture built from the structure captured on
2026-09-23 (`[role="menu"]` containing `J-N` items, a `J-Kh` separator, a `J-Ph` submenu
item, `pM aj0` triggers with `data-label-name`):

- the item is added, at the bottom, after a separator;
- it inherits the model's classes and never a literal we wrote;
- text is "Show as Tabs" with no matching tab, "Remove from Tabs" with one;
- clicking adds a `label` tab whose `value` is the full label name;
- clicking again removes it;
- **no item** when there is no `[data-label-name]`, no visible menu, or no model without
  `aria-haspopup`: three separate tests, because these are three different give-up paths;
- the item is removed when the menu closes, and a second open on a different label produces
  an item targeting the second label, not the first (the C5 regression);
- `health.ts` records the right reason in each give-up case;
- Enter and Space activate it.

New guard in `test/repoConsistency.test.ts`: **a Gmail obfuscated class literal may appear
only in `src/utils/selectors.ts`.** That is already true today (`.G-atb`, `.aeF > div:first-child`,
`.bsU`, `.nH`, `.wT` are the complete set and they all live there), so the guard costs
nothing to adopt and prevents the one failure mode that would quietly undo this whole
design: somebody debugging a menu problem at 11pm pasting `J-N` into a selector. Mutation
tested, like every other guard.

### 4.6 Sublabels: what the open question actually was

It was never about aggregating a parent's children into one tab. That would be a feature
Gmail does not have, invented by us, which is outside what this extension does. It is not
proposed and will not be built.

The real question is **display**, and it is small:

Gmail shows a nested label in the sidebar by its leaf name ("ADCB Bank" indented under
"Banking") while its actual name is the full path ("Banking/ADCB Bank"). A tab must store
the full path as its `value`, or navigation breaks. But the `title` is a free choice:

| Option | Tab reads | Trade-off |
|---|---|---|
| (a) Leaf name | `ADCB Bank` | Matches what Gmail shows and what the user clicked. Ambiguous if two parents have a child of the same name |
| (b) Full path | `Banking/ADCB Bank` | Never ambiguous. Wide, in a horizontal bar where width is the scarce resource |
| (c) Leaf, falling back to full path on collision | `ADCB Bank`, or `Banking/ADCB Bank` if another tab already reads `ADCB Bank` | Correct in both cases. About fifteen lines |

Recommendation: **(c)**. The user can rename any tab afterwards through the existing edit
modal, so this only has to be a good default, not a permanent decision.

One item to verify live in phase 3, not assumed: that the hash we generate for a nested
label matches what Gmail's own sidebar link uses. Our existing code produces
`#label/Banking%2FADCB+Bank` from `encodeURIComponent` with `%20` swapped for `+`, and
users already add nested labels by hand through the settings modal today, so this path is
already in production. It is listed here because "already in production" is not the same as
"verified against Gmail's own anchor", and the canary can assert it permanently once checked.

### 4.7 Open items that need the live browser

Three things the design depends on that I have not yet measured. None changes the shape of
the plan; each could change a detail:

1. **Closing the menu after our click.** Gmail's own items close it through their own
   handlers. Ours will not. Escape dispatch, a body click, or Gmail's own dismissal path:
   to be determined by trying them.
2. **Keyboard reachability.** Gmail's arrow-key handling walks its own item list. Our item
   carries `role="menuitem"` and will get `tabindex="0"` and its own Enter/Space handler,
   but whether it participates in Gmail's arrow-key order needs checking.
3. **Hover highlight.** It should come free from the inherited class. A synthetic
   `mouseover` changed nothing on Gmail's **own** item either, so that test was inconclusive
   for both and needs a real pointer.

---

## 5. Phase 4: release

Ordinary `PLAYBOOK.md` release flow, with two notes specific to this one.

1. Version 1.7.0, not 1.6.3: a new user-visible feature.
2. **No permission change and no new outbound host**, so the published privacy policy in the
   other repository needs no edit and CI's published-policy step passes without a deploy.
   Confirm rather than assume, since that page went four versions stale once before.

Store listing: the release notes and the feature list gain the menu item. The "no tracking"
summary is unchanged and stays true, which is the reason phase 2 is built the way it is.

---

## 6. Effort and risk

| Phase | Rough effort | Main risk | Mitigation |
|---|---|---|---|
| 1 Canary | Half a day | Session expiry makes it noisy and it gets ignored | SKIPPED exit code, escalate only on the second consecutive failure |
| 2 Health | Two hours | Scope creep into telemetry | No network, by construction and by review |
| 3 Menu item | One day | An A/B bucket we cannot see | Fails closed, plus the health signal so users tell us |
| 4 Release | Two hours | The privacy page going stale again | Nothing changed; verify anyway |

The honest residual risk: everything here is verified against one Google account on one
Gmail build. The design, not the measurement, is what covers the rest, and the health signal
is what tells us if the design was wrong.

---

## 7. What execution changed, and why

A plan that is not corrected by contact with the thing it plans is a plan
nobody followed. Five things came out differently.

| Planned | Actual | Why |
|---|---|---|
| C5 (one reused menu node) asserted | Recorded, not asserted | Gmail was observed doing both. Our item is removed on close and rebuilt on open, and its removal searches the whole document, so either behaviour is fine. Asserting it would have failed the canary over something that cannot affect us |
| `history.ndjson` uncommitted, fingerprint committed | Unchanged, plus a 500-line cap | A daily job appending for years is a file nobody trims |
| Canary escalates on the second consecutive failure | Unchanged, plus a **second opinion in a fresh browser** within a single run | A cold headless profile sometimes never answers a click at all. Measured roughly one run in four. Without the internal retry, two consecutive false failures would have happened about monthly |
| Wait 1.5s for Gmail's menu | 10s | Measured: Gmail took 2.3s once and 4.1s another time on a cold profile. The first ceiling would have meant no item at all on a slow machine, which looks exactly like the feature not existing |
| Health recorded as `not-attempted` on install | Records nothing on install | Every Gmail page load installs it, so a second tab would have wiped the `unavailable` a first tab had just recorded. Absence already reads as "not used yet" |

Three things the plan listed as needing the live browser, now answered:

1. **Closing the menu after our click.** An Escape dispatched on `document.body`
   plus a `mousedown` on `document` closes it. Verified end to end: after the
   click, zero menus are visible and the item is gone.
2. **Hover highlight.** Comes free from the inherited class; the item carries
   exactly the model's `className`.
3. **Keyboard.** The item has `tabindex="0"` and its own Enter and Space
   handlers, and both are tested. Whether it joins Gmail's own arrow-key order
   is still **unverified**: Gmail walks its own list of items, which will never
   include ours.

And one the plan did not anticipate: `resolveLabelName` was handed a
`Document` rather than an `Element` the first time our own dismissal path ran,
because a `mousedown` dispatched on `document` has no `closest`. The unit tests
caught it before any browser did.
