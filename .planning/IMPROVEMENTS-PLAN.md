# Improvements Plan (post-review Table A/B/C)

Status legend: [ ] pending, [~] in progress, [x] done + audited.

This plan covers the remaining review findings after the first fix session.
Already shipped and excluded: A1 (global theme propagation), A2 (rules limited to
label tabs), A3 (hash-tab unread counts), A5 (export/import rules+theme),
C5 (settings gear icon).

## Verification gate (run at the end of every phase)

- `npx tsc --noEmit` -> 0 errors
- `npx jest` -> all suites pass
- `npx jest --coverage` -> meets configured thresholds
- `npm run lint` -> 0 errors
- `npm run build` -> succeeds, zero `console.log` in `dist/js/`
- manifest.json and package.json versions match

## Phase status tracker

| Phase | Title | Items | Status |
|-------|-------|-------|--------|
| 1 | Documentation truth-up | B4, B5 | [x] |
| 2 | Test safety net + threshold raise | C3 | [x] |
| 3 | Runtime hardening (injection + unread fetching) | C2, C4 | [x] |
| 4 | XHR interceptor hardening | A4 | [x] |
| 5 | Shared tab-manager extraction | B1 | [x] |
| 6 | In-Gmail modal alignment | B2 | [x] |
| 7 | State encapsulation | B3 | [x] |
| 8 | Accessibility + keyboard | C1 | [x] |
| - | Master audit | all | [x] |

### Master audit result (all phases complete)

Verification gate (final): `tsc --noEmit` clean; 365 tests across 21 suites pass
(parallel x2 + in-band, no flake); coverage 71.8% stmts / 53.8% branches / 72.3%
funcs / 74.6% lines (all above thresholds); ESLint 0 errors; production build clean
with zero `console.log`; manifest/package versions match (1.2.1); all 11 dist files present.

Cohesiveness checks: no stray `state.observer`/`state.initPromise`; no direct
`getAppSettings().tabs =` mutation (routed through `setAppTabs`); `renderTabListItems`
and `createModalDragHandlers` used only via the shared `tabManager`; add-tab parsing
unified across both surfaces. Known-label filter degrades gracefully to the tightened
heuristic if the cross-world message is unavailable (no regression path).

New modules: `src/modules/tabManager.ts` (shared add-tab + list behavior).
New tests: `test/tabManager.test.ts`. New doc: this file.

Dependencies: 1 standalone; 2 -> {3,4,8}; 2 -> 5 -> {6,7}.

---

## Phase 1: Documentation truth-up (B4, B5)

Goal: docs match current code.

Tasks:
1. B5: fix README storage schema: `Rule.action` is `trash|archive|markRead|moveToLabel`
   (not `move`); remove `sheetUrl` from the `Settings` interface; document that
   theme is now a browser-wide `chrome.storage.local` `globalTheme` key (per-window,
   all accounts, not device-synced).
2. B4: refresh `AUDIT.md` to current version; correct stale claims (modals split into
   `modules/modals/*`; ESLint/Prettier configs exist; current test counts; dual storage
   areas sync+local).
3. Update README Roadmap "Shipped" list.

Tests: none. Acceptance: no stale factual claim remains.

## Phase 2: Test safety net + threshold raise (C3)

Goal: cover untested runtime paths before refactors, then raise thresholds.

Tasks:
1. content.ts tests: attemptInjection insert/reposition; extractEmailFromDOM cases;
   storage.onChanged (local theme reapply, sync account reload).
2. tabs.ts tests: dropdown open/close, active-tab highlighting, move mode.
3. settingsModal.ts tests: add-tab flow, unread toggle, theme buttons -> setGlobalTheme.
4. Raise jest thresholds a few points under measured coverage.

Acceptance: new tests pass; coverage clears raised thresholds.

## Phase 3: Runtime hardening (C2, C4)

Goal: bounded injection retries; cached/coalesced unread fetches.

Tasks:
1. C2: single-flight guard + bounded backoff for attemptInjection; defer to observer.
2. C4: unread cache Map<label,{count,ts}> with TTL (~30s) + in-flight de-dup.

Acceptance: <=1 fetch per label per TTL window; no unbounded timers.

## Phase 4: XHR interceptor hardening (A4)

Goal: fewer false-positive label/count matches.

Tasks:
1. Tighten isValidLabel/findCounts: non-negative bounded int count; reject
   date/id-looking keys.
2. Cross-reference against known rendered labels (content script dispatches the
   known-label set to the page world); filter only when populated.
3. Regression tests for rejects/accepts.

Acceptance: false-positive tests pass; counts still update live.

## Phase 5: Shared tab-manager extraction (B1)

Goal: single source of truth for add-tab and tab-list behavior.

Tasks:
1. New module (e.g. src/modules/tabManager.ts) with createAddTabController and
   attachTabListControls; share behavior, not markup.
2. Refactor settingsModal.ts and options.ts onto it; delete dup logic.

Acceptance: identical add/edit/reorder behavior on both surfaces; net LOC drop; tests pass.

## Phase 6: In-Gmail modal alignment (B2) -- DECISION: minimal alignment + link

Goal: align the in-Gmail modal with the multi-account model without adding a switcher.

Tasks:
1. Keep the modal single-account-contextual (it belongs to the current Gmail account).
2. Adopt Phase 5 shared controllers.
3. Ensure theme copy is global-aware (no per-account implication).
4. Add a "Manage all accounts" link in the modal that opens the options page.

Acceptance: modal uses shared controllers; global-aware theme copy; link opens options.

## Phase 7: State encapsulation (B3)

Goal: remove unguarded global state mutation.

Tasks:
1. Make state fields module-private; expose typed accessors only; route writes through them.
2. Light guards; single change-notifier to replace scattered renderTabs calls.
3. Keep callback-injection pattern; no new framework.

Acceptance: no direct state.* writes outside accessors; tests pass.

## Phase 8: Accessibility + keyboard (C1)

Goal: keyboard + screen-reader usable tab bar.

Tasks:
1. Convert tab/action divs to buttons or add role/tabindex/aria-label/aria-current.
2. Keyboard: Enter/Space activate; arrows move focus; Escape exits move mode.
3. Visible focus styles in toolbar.css (both themes), scoped to the bar id.
4. Tests for roles/aria/key handlers.

Acceptance: full keyboard operation; a11y check passes; tests pass.

## Master audit (after all phases)

- Cross-phase cohesiveness: consistent patterns, no dead code, no duplicated logic reintroduced.
- Robustness: error handling, no unbounded timers, no unguarded state, no XSS via innerHTML.
- Full verification gate green; manual smoke reasoning documented.

## Post-plan polish (2026-07-07)

Work done after the plan completed, at the user's request:

1. Default theme changed from `system` to `light` for fresh installs (storage defaults,
   `getGlobalTheme` fallback, migration seed, content/options caches, welcome page). Existing
   users keep their migrated preference. Tests updated accordingly.
2. Accessibility recheck: accessible names added to modal close buttons (settings, pin, edit,
   import) and the options-page unread toggle; decorative icons marked `aria-hidden`.
3. Contrast recheck: options-page muted, empty-state, version, and secondary hint text raised to
   meet WCAG AA in both light and dark themes.
4. Documentation: added agent-oriented docs per `agent_docs_guide.md` (AGENTS, CONTEXT_MAP, DOMAIN,
   DATA_MODEL, DECISIONS, TESTING, SECURITY, PLAYBOOK, CONTRIBUTING, CHANGELOG) and refreshed
   README and AUDIT.

Verification gate re-run green: `tsc` clean, 365 tests pass, ESLint 0 errors, build clean with no
`console.log`, manifest/package parity at 1.2.1.
