# TESTING.md

Testing philosophy, commands, and thresholds for **Gmail Labels and Search Queries as Tabs**.

Last updated: 2026-07-07 (v1.2.1)

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
npx jest --runInBand      # run serially (useful when diagnosing flake)
```

## Coverage thresholds

Enforced in [jest.config.js](jest.config.js):

| Metric | Threshold |
|--------|-----------|
| Statements | 65 |
| Branches | 50 |
| Functions | 65 |
| Lines | 65 |

Current measured coverage sits above these (roughly 72 percent statements, 54 percent
branches, 72 percent functions, 75 percent lines). Do not let a change drop coverage below
the thresholds; add tests with new behavior.

## Suite shape

- 21 suites, 365 tests as of v1.2.1.
- Suites cover: storage and migrations, tab rendering and keyboard/aria, unread waterfall,
  XHR interceptor validation, rules and Apps Script generation, options page, onboarding,
  modals, drag-and-drop, state accessors, import/export, and the shared tab manager.

## Writing a new test

1. Create or extend the mirrored `test/<module>.test.ts`.
2. Start the file with `export {};` to avoid TS2451 redeclaration errors across the shared
   test scope (this convention is already applied repo-wide).
3. Mock only the Chrome APIs the module touches. Reset mocks in `beforeEach`.
4. Assert observable behavior. For async storage helpers, await a microtask flush
   (`await new Promise((r) => setTimeout(r, 0))`) before asserting DOM effects.

## CI

[.github/workflows/ci.yml](.github/workflows/) runs the test suite, builds the extension,
verifies there is no `console.log` in `dist/js`, and uploads the build artifact. Keep the
local verification gate (see [AGENTS.md](AGENTS.md)) green so CI stays green.
