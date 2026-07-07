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

1. **Zero external network requests.** The extension must never call any third-party
   server. Unread counts come only from Gmail's own Atom feed, Gmail's XHR responses,
   or the DOM. No analytics, telemetry, or remote config. Adding a `fetch`/`XMLHttpRequest`
   to any non `mail.google.com` origin is a blocking defect. See [SECURITY.md](SECURITY.md).
2. **Escape all user-controlled strings before insertion into HTML.** Tab titles, label
   names, and imported config are user data. Use `textContent` or an escape helper, never
   raw `innerHTML` interpolation of user values.
3. **No `console.log` in the production bundle.** esbuild is configured with
   `drop: ['console']`, and CI greps `dist/js` to enforce it. Do not rely on console
   output at runtime.
4. **No `@ts-ignore` / `@ts-expect-error`.** The project builds under `tsc --noEmit`
   with strict mode and zero errors. Fix types properly.
5. **Manifest and package versions must match.** `manifest.json` and `package.json`
   carry the same version string. Bump both together.
6. **Theme is browser-wide, not per-account.** It lives in `chrome.storage.local` under
   `globalTheme`. Do not move it back into per-account `chrome.storage.sync`. See
   [DECISIONS.md](DECISIONS.md) ADR-002.
7. **Do not commit build artifacts.** `dist/`, `extension.zip`, `dist.zip`, and
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
npx jest --coverage       # meets thresholds in jest.config.js
npm run lint              # 0 errors (warnings tolerated)
npm run build             # succeeds; then confirm no console.log in dist/js
```

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
  under the user's own Google account. Generated code must remain safe (delete means
  Trash, never permanent delete).
