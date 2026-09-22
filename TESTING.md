# TESTING.md

Testing philosophy, commands, and thresholds for **Gmail Labels and Search Queries as Tabs**.

Last updated: 2026-09-22 (v1.6.0)

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

- 36 suites, 721 tests as of v1.6.2.
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
| [test/rulesProperty.test.ts](test/rulesProperty.test.ts) | Generated Apps Script mis-escapes any of 1,000 generated hostile inputs | Two comment-breakout bugs, the second found by this test on its sixth case |
| ... also: the floating-promise lint rules are removed, downgraded to a warning, or lose their type information | A rule that reports nothing looks exactly like a rule that is absent. `npm run lint` tolerates warnings, so "warn" would have retired the guard silently. See ADR-017 |

Each guard is mutation tested: it contains a case proving it still rejects what it is
supposed to reject. A guard that cannot fail is worse than no guard, because it reads like
coverage.

### Two gates that cannot live in jest

| Gate | Fails when | Why it is in CI |
|---|---|---|
| `Verify dist/icons contains only icons the manifest declares` | The build copies a file into `dist/icons` that `manifest.json` never names | It needs the built artefact. Two promo tiles, 398 KB and 44% of the package, shipped to users this way because `copy-assets` globbed `src/icons/*.png` |
| `Verify the published privacy policy matches what the code does` | The live policy omits an outbound host, a declared permission or the site's own analytics, or the site bundle contains an API key | It needs the network, and the page lives in another repository that deploys by hand. It went four versions stale. See ADR-016 |

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
