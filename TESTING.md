# TESTING.md

Testing philosophy, commands, and thresholds for **Gmail Labels and Search Queries as Tabs**.

Last updated: 2026-09-24 (v1.7.4)

## Philosophy

- Every source module has a mirrored spec under [test/](test/). Behavior is tested through
  public functions and rendered DOM, not private internals.
- Tests run in jsdom. Chrome APIs (`chrome.storage`, `chrome.runtime`, `chrome.tabs`) are
  mocked per suite. The dual-world `CustomEvent` channel and Gmail DOM are simulated.
- Prefer behavioral assertions over brittle implementation details (for example, assert
  that the bar is or is not injected, not that a specific timer count exists).
- When default behavior changes, update the assertions that encode the old default in the
  same change (for example the theme default lives in
  [test/storage.test.ts](test/storage.test.ts) and [test/welcome.test.ts](test/welcome.test.ts)).

## Commands

```
npm test                  # run all suites (jest)
npx jest <pattern>        # run a subset, e.g. npx jest storage
npx jest --coverage       # run with coverage and enforce thresholds
npx jest --runInBand      # run serially; CI does this as a second pass

# Contrast against rendered pixels, in a real Chrome (manual, see below)
NODE_PATH=$(npm root -g) node scripts/contrast-audit.mjs <extension-id> [port]
```

## Coverage thresholds

Enforced in [jest.config.js](jest.config.js):

| Metric | Threshold |
|--------|-----------|
| Statements | 65 |
| Branches | 50 |
| Functions | 65 |
| Lines | 65 |

Current measured coverage sits above these. Do not let a change drop coverage below the
thresholds; add tests with new behavior.

## Suite shape

- 39 suites, 844 tests as of v1.7.4.
- Unit suites cover: storage and migrations, the settings reducer and write path, tab
  rendering and keyboard/aria, the unread waterfall, XHR interceptor validation, rules and
  Apps Script generation, the options page, the onboarding wizard and both of its hosts,
  the toolbar menu, modals, drag-and-drop, state accessors, import/export, the shared tab
  manager, tab colors, rule templates, in-product feedback, and the color-contrast palette.
- The onboarding wizard is covered once, in
  [test/onboarding/wizardView.test.ts](test/onboarding/wizardView.test.ts), because both
  surfaces mount the same module. The two host suites
  ([onboardingModal](test/onboarding/onboardingModal.test.ts) and
  [welcome](test/welcome.test.ts)) cover only what differs: how a theme is persisted and
  what finishing does.

### Guards, which are not unit tests

Four suites assert things about the repository rather than about a function. A failure is a
statement about the codebase, and the fix is usually in the code they point at, not in the
test.

| Suite | Fails when | Why it exists |
|---|---|---|
| [test/htmlSinks.test.ts](test/htmlSinks.test.ts) | An unescaped value is interpolated into `innerHTML` anywhere in `src/` | 22 sites were reviewed by eye and pronounced fine; one was a stored XSS reachable from an imported backup |
| [test/contrast.test.ts](test/contrast.test.ts) | A palette token drops below AA, or any colour literal appears in a `.ts` or `.html` file | Two failing colours shipped inside TypeScript template strings, invisible to guards that only read `.css` |
| [test/repoConsistency.test.ts](test/repoConsistency.test.ts) | A live document contradicts the code, names a path that does not exist, omits a module from CONTEXT_MAP, or a CSS rule outlives its component | Five documents once claimed a network behaviour the code had not had for months, including the rule an agent reads first |
| ... also: an outbound host in `background.ts` is missing from SECURITY.md, the privacy page or STORE_LISTING | The uninstall URL opened a third-party form for four versions, disclosed nowhere |
| ... also: live documents disagree on the test count | Four of them stated four different totals inside one release, each correct when written |
| ... also: anything links to the Pages site retired in v1.5.0, the shipped Help link names a route that does not exist, the listing names the wrong site, or a `website/` folder reappears | Two sites served two privacy policies, and the one the listing named was the stale one. See ADR-016 |
| ... also: a workflow gains a `push:`, `pull_request:` or `schedule:` trigger | Actions run on manual dispatch only, in both repositories |
| ... also: a module reads `prefers-color-scheme` without consulting Gmail's own theme | 'system' means Gmail's theme, not the OS. The 1.6.0 wizard asked the OS and rendered dark over a light Gmail. Twenty theme assertions existed; every one set an explicit Light or Dark, so none could have caught it. See ADR-019 |
| ... also: an extension page loads `themeBoot.js` late, or not at all, or the options page markup loses its default theme class | The same script deferred, at the foot of the page, or folded into the page's own bundle fixes nothing and looks identical in review. Its whole value is its position. See ADR-020 |
| ... also: a module outside `src/utils/selectors.ts` hardcodes one of Gmail's obfuscated class names | `labelMenu.ts` finds Gmail's menu by ARIA role and clones an item to inherit whatever Gmail calls it that day. That design erodes silently: one `J-N` pasted into a selector at 11pm makes the bug go away and leaves no diff that looks wrong. See ADR-022 |
| [test/rulesProperty.test.ts](test/rulesProperty.test.ts) | Generated Apps Script mis-escapes any of 1,000 generated hostile inputs | Two comment-breakout bugs, the second found by this test on its sixth case |
| ... also: the floating-promise lint rules are removed, downgraded to a warning, or lose their type information | A rule that reports nothing looks exactly like a rule that is absent. `npm run lint` tolerates warnings, so "warn" would have retired the guard silently. See ADR-017 |

Each guard is mutation tested: it contains a case proving it still rejects what it is
supposed to reject. A guard that cannot fail is worse than no guard, because it reads like
coverage.

### What no guard here can see

Both theme fixes in 1.6.2 were about a *frame*, not a value. Every final state was already
correct, so no assertion about the end of a render could have caught either one, and the
844 tests below would all have passed on the broken build.

They were verified by sampling the computed background on every animation frame through a
real load, before and after, in the configuration that was reported:

| Surface | Before | After |
|---|---|---|
| Tab bar over Gmail, dark desktop, light Gmail | `rgb(32, 33, 36)` for 318ms, no tabs on screen | transparent throughout, 0 dark frames |
| Options page, first load | `rgb(26, 26, 46)` for 166ms with the cards already drawn | correct theme on the first frame, 0 dark frames |
| Options page, a user who chose Dark | n/a | dark at +59ms, 0 light-flash frames |

That measurement is not in the suite. It needs a real browser, a real Gmail and a
frame-accurate sampler, and it is recorded here so the next person does not have to
invent it. The unit tests cover the mechanism the fix introduced: that a guess is marked,
dropped when a real reading arrives, committed when none ever does, and never published as
though it came from Gmail.

### The bug a dispatched event can never find

v1.7.1 added an item to Gmail's own label menu. Every unit test passed, and so did a
scripted check in a real Gmail that opened the menu, found the item and clicked it. For a
real user it did nothing at all.

Gmail tears its menu down on **mousedown**, not on click. A real mouse produces
pointerdown, mousedown, mouseup, click, and by the time the button comes back up Gmail has
replaced what is under the cursor, so the click lands on a Gmail element instead. Measured
through Chrome's own input pipeline, the event trace on our item read:

```
item:pointerdown   doc:mousedown   item:mousedown   doc:click on pp
```

`item:click` never appears. A dispatched `new MouseEvent('click')` goes wherever it is
aimed, including at a node the browser would never have given a click to, which is why
every test agreed with the broken build.

The item now activates on `mousedown`, which is what Gmail's own items do, and
[test/labelMenu.test.ts](test/labelMenu.test.ts) asserts that mousedown alone is enough,
that a mousedown and a click together act once, and that a rebuilt item can act again.

The lesson generalises: **when testing something embedded in another application's UI,
drive it through the browser's input pipeline at least once.** `page.mouse.click(x, y)`
found this in one run; nothing else would have.

What that check cannot be made into is a routine one. Gmail reveals a label's three-dot
trigger only on hover, and headless Chrome raises that hover unreliably: across seven
attempts the trigger became clickable in three. Two of those three completed the whole
sequence, a real mouse press adding the tab within 500ms. The other four never got as far
as opening Gmail's menu.

So the real-mouse check is a **deliberate, occasional** one, run when the way the item is
activated changes, and the daily canary covers the rest by dispatching events. If the
activation event is ever changed again, run it. The script is not committed because it is
throwaway scaffolding; what it proved is above, and the unit tests in
[test/labelMenu.test.ts](test/labelMenu.test.ts) encode the conclusion.

### The thing a unit test cannot see: what the page looks like

v1.7.1's item worked and looked wrong. It did not light up under the pointer, because
Gmail highlights from its own `jsaction` handler rather than from a `:hover` rule, and the
clone strips that wiring on purpose. No unit test could have caught it: jsdom lays nothing
out, computes no styles and fires no hover, and the canary asserted structure, not
appearance.

What caught it was a person using it. What confirmed the cause was a stylesheet sweep in a
live Gmail: every `:hover` selector in the page, tested against the item with `matches()`,
and not one matched.

The fix is tested from both ends. [test/labelMenu.test.ts](test/labelMenu.test.ts) plants a
handler that adds a class of the test's own invention, and asserts our item takes it on,
gives it back, and leaves Gmail's element exactly as found, including when the planted
handler never un-highlights. It also asserts the wash appears when nothing can be learned,
light or dark according to the menu's own background, and that an implausible handler
adding six classes is not copied at all. The canary asserts the live version of the same
thing, through `HOVER`.

The lesson generalises: **structure passing is not the same as looking right.** A check
that an element exists says nothing about whether it reacts.

### What Chrome says, which no mock will tell you

1.7.3 makes the worker start the content script in Gmail tabs that were already open. The
unit tests cover the decisions: ping before injecting, inject the stylesheets too, reload
only when injection fails, leave a discarded tab alone, let one unreachable tab not stop
the rest. Every one of them passed against a first version that did nothing at all in a
real browser.

It skipped any tab whose `status` was `'loading'`, on the reasoning that such a tab is
about to receive the manifest's own copy anyway. **A Gmail tab that has been open and
usable for minutes reports `status: 'loading'`**, because Gmail holds a request open for
its live updates. The rule therefore skipped every Gmail tab there was. The test double
answered whatever the test told it to, so the suite had no opinion.

Three facts were measured in a headless Chrome against a real signed-in Gmail on
2026-09-24, and each one changed the code or the documentation:

| Question | What Chrome actually does |
|---|---|
| What is a loaded Gmail tab's `status`? | `'loading'`, indefinitely |
| Does the chrome://extensions Reload button fire `onInstalled`? | Yes, with `reason: 'update'` and `previousVersion` equal to the version being installed |
| Does injection avoid a page reload? | Yes. A sentinel set on `window` before the install was still there after it, and again after an update |
| What does upgrading from 1.7.2, whose copy cannot stand down, leave behind? | One tab bar, populated, and one "Show as Tabs" item. The orphaned copy only re-adds an empty bar if the live one is removed, which happens only if it is removed deliberately |

The proof scripts are throwaway scaffolding and are not committed, for the same reason the
real-mouse check is not. What they established is written above and encoded in
[test/background.test.ts](test/background.test.ts),
[test/handover.test.ts](test/handover.test.ts) and
[test/content.test.ts](test/content.test.ts). **If the sweep's rules for which tabs to
touch change again, measure them against a real Gmail before trusting the suite.**

### Two gates that cannot live in jest

| Gate | Fails when | Why it is in CI |
|---|---|---|
| `Verify dist/icons contains only icons the manifest declares` | The build copies a file into `dist/icons` that `manifest.json` never names | It needs the built artefact. Two promo tiles, 398 KB and 44% of the package, shipped to users this way because `copy-assets` globbed `src/icons/*.png` |
| `Verify the published privacy policy matches what the code does` | The live policy omits an outbound host, a declared permission or the site's own analytics, or the site bundle contains an API key. The permission list is read from `manifest.json` as of 1.7.3, so adding a permission fails this step until the published policy names it. It cannot tell a mention from a denial: the live policy said the extension had *no* `scripting` permission, which a word match reads as present | It needs the network, and the page lives in another repository that deploys by hand. It went four versions stale. See ADR-016 |

The second one couples a green build to an external site being up. That is the intended
trade: an extension whose declared privacy policy cannot be produced should not ship.

### The gate that is not a test at all

`npm run lint` is type-aware over `src/` and treats
`@typescript-eslint/no-floating-promises` and `no-misused-promises` as errors. It is
listed here because it catches a class of defect no unit test in this repository ever
did: a promise whose rejection nobody holds, which produces a control that does nothing
and says nothing.

Every user-visible bug fixed in 1.5.0 was an instance. Turning the rules on found
twenty-five more in one pass. Writing a test per instance would not have helped; the
tests that existed for the broken options-page link passed, because they mocked the call
that was failing. See ADR-017.

### Concurrency

[test/settingsOps.test.ts](test/settingsOps.test.ts) uses
[test/helpers/storageMock.ts](test/helpers/storageMock.ts), a `chrome.storage` double with
a controllable delay. The default mock elsewhere calls its callback synchronously, which
makes every read-modify-write atomic by accident and hides the races entirely. One test
deliberately demonstrates the old lost-update behaviour so the fix has something to be
measured against.

## Color contrast

Two layers, because neither alone is enough:

1. [test/contrast.test.ts](test/contrast.test.ts) runs in `npm test`. It reads the palette
   tokens straight out of `options.css`, `toolbar.css` and `welcome.css` and fails if any
   text token drops below 4.5:1 against the surfaces it is used on, if the primary button
   gradient stops carrying white at both ends, if a retired low-contrast hex reappears as a
   `color:`, or if helper text goes back to fading with `opacity`.
2. [scripts/contrast-audit.mjs](scripts/contrast-audit.mjs) measures *rendered pixels* in a
   real Chrome, which the unit test cannot: composited opacity, inherited colors and
   stacked translucent surfaces. Run it after any visual change. It needs a Chrome started
   with `--remote-debugging-port`, the unpacked `dist/` loaded, and a global Playwright.

The token test is the guardrail; the browser script is the proof. A palette change should
pass both before it ships.

## Writing a new test

1. Create or extend the mirrored `test/<module>.test.ts`.
2. Start the file with `export {};` to avoid TS2451 redeclaration errors across the shared
   test scope (this convention is already applied repo-wide).
3. Mock only the Chrome APIs the module touches. Reset mocks in `beforeEach`.
4. Assert observable behavior. Wait in turns, never in milliseconds: use `flush()` from
   [test/helpers/async.ts](test/helpers/async.ts) rather than a fixed sleep. Fixed sleeps
   caused the one long-standing flake in this suite, because under coverage instrumentation
   or on a loaded machine the chain is not finished when the timer fires.
5. Under `jest.useFakeTimers()`, use `microtasks()` instead of `flush()`. `flush` goes
   through `setTimeout`, which fake timers replace, so awaiting it inside a fake-timer test
   hangs forever.

## CI

[.github/workflows/ci.yml](.github/workflows/ci.yml) is **manual trigger only**
(`gh workflow run ci.yml --ref <branch>`). It runs the suite with coverage, runs it a
**second time serially**, lints, typechecks the feedback worker, builds, verifies there is
no `console.log` in `dist/js`, packages and size-checks the zip, checks manifest and package
versions match, checks for `@ts-ignore`, verifies the `dist/` structure, and uploads the
artifacts.

The second serial run is not redundant. Both intermittent failures this suite has ever had
appeared only when timing shifted, and neither reproduced on a normal parallel run, so one
green run was never evidence of a stable suite.

Keep the local verification gate (see [AGENTS.md](AGENTS.md)) green so CI stays green.
