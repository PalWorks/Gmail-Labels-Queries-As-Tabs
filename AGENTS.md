# AGENTS.md

Agent behavior contract for the **Gmail Labels and Search Queries as Tabs** repository.
Read this before making any change. It encodes the non-obvious constraints that keep
the extension correct, private, and shippable to the Chrome Web Store.

Last updated: 2026-07-07 (v1.2.1)

## What this project is

A Chrome Manifest V3 extension that injects a configurable tab bar into Gmail. Each tab
maps to a Gmail label, a search query, or a built-in hash view (Inbox, Sent). It also
generates Google Apps Script for per-tab automation and shows live unread counts.

Orientation reading order for a new agent:

1. [README.md](README.md) (what and how)
2. [ARCHITECTURE.md](ARCHITECTURE.md) and [CONTEXT_MAP.md](CONTEXT_MAP.md) (where things live)
3. [DOMAIN.md](DOMAIN.md) and [DATA_MODEL.md](DATA_MODEL.md) (concepts and storage schema)
4. [DECISIONS.md](DECISIONS.md) (why the code is shaped this way)
5. This file (how to work here safely)

## Hard constraints (never violate)

1. **No background network requests.** Unread counts come only from Gmail's own Atom feed,
   Gmail's XHR responses, or the DOM. No analytics, telemetry, or remote config, ever.
   There is exactly one permitted outbound call, and only when the user presses Send on the
   feedback form: the relay in [worker/](worker/), reached from
   [src/modules/feedback.ts](src/modules/feedback.ts). Any other request to a non
   `mail.google.com` origin, or any request the user did not explicitly trigger, is a
   blocking defect. See [SECURITY.md](SECURITY.md) and ADR-012 in [DECISIONS.md](DECISIONS.md).
2. **Escape user data for the language it lands in, not "for output".** Tab titles, label
   names, ids and imported config are user data, and this project writes them into four
   different languages: HTML, a JavaScript string literal, a JavaScript block comment, and
   the Gmail search grammar. Each needs its own escaper, and using the wrong one has
   already shipped twice. Use `textContent` or `escapeHtml` for markup;
   [src/modules/rules.ts](src/modules/rules.ts) has `escapeForScript` and
   `escapeForComment` and quotes every label it puts in a search.
   [test/htmlSinks.test.ts](test/htmlSinks.test.ts) fails the build on an unescaped
   interpolation into `innerHTML`; do not silence it by extending its allowlist with
   anything user-controlled.
3. **All settings writes go through `mutateSettings`.** Never read settings, change the
   object and save it: that is the read-modify-write that lost tabs before v1.5.0.
   Describe the change as a `SettingsOp`. New ops must be plain data (they cross a message
   boundary) and idempotent (a lost worker reply makes the caller apply them twice). See
   ADR-013 and [DATA_MODEL.md](DATA_MODEL.md).
4. **No colour literals outside the stylesheets.** Every contrast guard reads `.css`, so a
   hex value in a `.ts` template string is invisible to all of them, which is exactly how
   two failing colours shipped. Define a token in CSS and use it.
   [test/contrast.test.ts](test/contrast.test.ts) enforces this.
5. **No `console.log` in the production bundle.** esbuild is configured with
   `drop: ['console']`, and CI greps `dist/js` to enforce it. Do not rely on console
   output at runtime.
6. **No `@ts-ignore` / `@ts-expect-error`.** The project builds under `tsc --noEmit`
   with strict mode and zero errors. Fix types properly.
7. **Manifest and package versions must match.** `manifest.json` and `package.json`
   carry the same version string. Bump both together.
8. **Theme is browser-wide, not per-account.** It lives in `chrome.storage.local` under
   `globalTheme`. Do not move it back into per-account `chrome.storage.sync`. See
   [DECISIONS.md](DECISIONS.md) ADR-002.
9. **Do not commit build artifacts.** `dist/`, `extension.zip`, `dist.zip`, and
   `coverage/` are gitignored. Never force-add them.

## Coding conventions

- TypeScript, ES2022, strict. Two-space indentation, single quotes, semicolons
  (Prettier enforced via `.prettierrc`; ESLint via `.eslintrc.json`).
- Match the surrounding code's comment density and naming. Modules carry a top-of-file
  block comment describing their responsibility.
- Circular dependencies between the content script and its modules are resolved with the
  **callback-injection pattern** (`setRenderCallback`, `setModalCallbacks`). Keep using
  it; do not introduce a framework or a DI container.
- Shared state lives in [src/modules/state.ts](src/modules/state.ts) behind typed
  accessors (`getAppSettings`, `setAppSettings`, `setAppTabs`, `getUserEmail`,
  `setUserEmail`, `resetState`). Never mutate settings objects in place from outside;
  route writes through the accessors.
- Add-tab parsing and the managed tab list are shared through
  [src/modules/tabManager.ts](src/modules/tabManager.ts). Do not re-implement that logic
  in the options page or the in-Gmail modal; reuse it.

## Required checks before you finish (the verification gate)

Run all of these and confirm they pass. Do not report a task complete until they do.

```
npx tsc --noEmit          # 0 errors
npx jest                  # all suites pass
npx jest --runInBand      # passes serially too; both flakes this suite has had
                          # only appeared when timing shifted
npx jest --coverage       # meets thresholds in jest.config.js
npm run lint              # 0 errors (warnings tolerated)
npm run build             # succeeds; then confirm no console.log in dist/js
```

Four of the suites are guards rather than unit tests, and a failure from them is a
statement about the repository, not about a function:

| Suite | Fails when |
|---|---|
| [test/htmlSinks.test.ts](test/htmlSinks.test.ts) | An unescaped value reaches `innerHTML` |
| [test/contrast.test.ts](test/contrast.test.ts) | A palette value drops below AA, or a colour appears outside a stylesheet |
| [test/repoConsistency.test.ts](test/repoConsistency.test.ts) | A document contradicts the code, names a path that does not exist, omits a module, or a CSS rule outlives its component |
| [test/rulesProperty.test.ts](test/rulesProperty.test.ts) | Generated Apps Script mis-escapes any of 1,000 hostile inputs |

Then verify `manifest.json` and `package.json` versions match. See
[TESTING.md](TESTING.md) and [PLAYBOOK.md](PLAYBOOK.md) for details.

## Change protocol

- Work on a branch, never commit directly to `main` unless the user explicitly asks.
- Keep commits scoped and descriptive (Conventional Commits style is used in history:
  `feat:`, `fix:`, `docs:`, `chore:`).
- When behavior changes, update the relevant docs in the same change:
  [CHANGELOG.md](CHANGELOG.md) always, plus [README.md](README.md),
  [DATA_MODEL.md](DATA_MODEL.md), or [DECISIONS.md](DECISIONS.md) as applicable.
- When you add a test surface, keep coverage at or above the configured thresholds.

## Restricted / high-caution areas

- [src/xhrInterceptor.ts](src/xhrInterceptor.ts): runs in Gmail's MAIN world. Bugs here
  can corrupt unread counts or leak into the page. Changes need regression tests for
  false-positive label/count matching.
- [src/content.ts](src/content.ts): injection lifecycle and storage listeners. Guard
  against unbounded timers; injection retries are single-flight and bounded.
- [src/modules/rules.ts](src/modules/rules.ts): generates Google Apps Script that runs
  under the user's own Google account, unattended, with destructive actions. Generated code
  must remain safe (delete means Trash, never permanent delete), every label must stay
  quoted in the search, the per-run cap must stay, and every thread must keep being checked
  for the exact label before it is touched. Changes here need
  [test/rulesProperty.test.ts](test/rulesProperty.test.ts) to stay green.
- [src/utils/storage.ts](src/utils/storage.ts): the single write path for everything the
  user configures. `applyOp` must stay pure, total (an unknown op throws, never returns
  `undefined`) and idempotent.
- [src/background.ts](src/background.ts): the only serialization point for settings writes.
  Do not return `true` from the message listener for a message you do not answer; that holds
  the sender's channel open and a promise-form `sendMessage` never settles.
