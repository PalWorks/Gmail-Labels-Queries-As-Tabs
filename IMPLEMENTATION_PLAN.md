# Gmail Labels as Tabs: Implementation Roadmap

> **Based on:** [AUDIT.md](file:///home/palani/Documents/Gmail-Labels-As-Tabs/AUDIT.md)
> **Target Version:** 1.2.0
> **Created:** 2026-03-02

## Execution Strategy Overview

### Philosophy: Infrastructure First, Then Vertical Refactoring

The roadmap follows a **foundation-then-feature** approach. Phase 0 hardens the tooling and developer experience so every subsequent phase ships with linting, formatting, and test coverage enforced automatically. Phases 1 through 3 decompose the two largest monoliths (`modals.ts` at 919 lines and `options.ts` at 657 lines) into testable, single-responsibility modules. Phase 4 introduces architectural improvements to the shared state and selector resilience. Phase 5 addresses automated quality gates.

This ordering is deliberate: tooling improvements have zero user-facing risk and immediately reduce friction for all future work. Refactoring follows because the duplicated code between `modals.ts` and `options.ts` is the primary source of regressions today, and both modules lack test coverage.

### Risk Management Strategy

| Strategy | Application |
|---|---|
| **Atomic commits** | Each task produces a single commit that is independently revertable. |
| **Test-before-refactor** | Write unit tests for existing behavior before modifying any module. This locks in current behavior and catches regressions immediately. |
| **No behavior changes during refactoring** | Phases 1 through 3 are pure structural refactors. Functional changes are deferred to later phases. |
| **Manual smoke test checkpoints** | After each phase, load the extension in Chrome and verify: tab bar renders, settings modal opens, theme switching works, tabs can be added/removed/reordered. |
| **CI is the source of truth** | Every phase must pass CI before merging. No manual-only verification gates. |

### Assumptions

| Assumption | Basis |
|---|---|
| **Solo developer** with AI-assisted tooling (Gemini AntiGravity) | Repository commit history shows a single author. |
| **Developer is proficient in TypeScript** and Chrome Extension MV3 APIs | Evidenced by the existing codebase quality. |
| **No breaking changes to user settings** | The `chrome.storage.sync` schema defined in `storage.ts` must remain backward compatible. Existing v1.1.0 users must not lose data on update. |
| **Gmail's DOM structure is stable** for the duration of this roadmap | Gmail selector changes are external and unpredictable; this plan does not add new DOM dependencies. |
| **Website (`website/`) is out of scope** | It has its own build pipeline and deployment and is not coupled to the extension code. |

## Phase 0: Tooling and Developer Experience

**Objective:** Establish linting, formatting, and code quality gates so all future changes are automatically validated.

**Effort:** S (1 day)

### Scope

| Included | Excluded |
|---|---|
| ESLint config creation and integration | Source code changes |
| Prettier config creation and integration | Feature work |
| CI pipeline update to enforce lint | Website linting |

### Tasks

| # | Task | Files Impacted |
|---|---|---|
| 0.1 | Create `.eslintrc.json` with TypeScript rules. Use `@typescript-eslint/parser` and `@typescript-eslint/eslint-plugin`. Enable rules: `no-unused-vars`, `no-explicit-any` (warn), `prefer-const`, `no-console` (warn in src, off in test). | `.eslintrc.json` [NEW] |
| 0.2 | Create `.prettierrc` with: `singleQuote: true`, `tabWidth: 4`, `trailingComma: 'es5'`, `printWidth: 120`. These match the existing code conventions observed across all source files. | `.prettierrc` [NEW] |
| 0.3 | Install `@typescript-eslint/parser` and `@typescript-eslint/eslint-plugin` as devDependencies. | `package.json` |
| 0.4 | Update `npm run lint` script in `package.json` to `eslint 'src/**/*.ts' 'test/**/*.ts'`. Add `lint:fix` and `format` scripts. | `package.json` |
| 0.5 | Run `npx prettier --write 'src/**/*.ts' 'test/**/*.ts'` to normalize formatting. Commit as a standalone formatting-only commit (no logic changes). | All `.ts` files |
| 0.6 | Update `ci.yml` to add a `npm run lint` step after `npm test` and before `npm run build`. | `.github/workflows/ci.yml` |
| 0.7 | Run `npm test` and `npm run build` to confirm zero regressions from formatting changes. | None (verification only) |

### Dependencies

None. This phase has no prerequisites.

### Risks and Mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Formatter changes cause merge conflicts with in-flight work | Low (solo dev) | Complete this phase first, before any other work. |
| ESLint flags hundreds of existing violations | Medium | Set `no-explicit-any` to `warn` initially. Fix violations incrementally in later phases. |

### Exit Criteria

- [ ] `npm run lint` exits with 0 errors (warnings are acceptable)
- [ ] `npm run build` succeeds
- [ ] `npm test` passes all existing tests
- [ ] CI pipeline runs lint step and produces green build
- [ ] Single formatting commit contains only whitespace/style changes (no logic diffs)

## Phase 1: Extract Shared UI Utilities

**Objective:** Eliminate the code duplication between `modals.ts` and `options.ts` by extracting shared rendering functions into reusable modules.

**Effort:** M (2 to 3 days)

### Scope

| Included | Excluded |
|---|---|
| Extract shared tab-list rendering logic | Modifying modal behavior |
| Extract shared import/export logic | Adding new features |
| Extract shared drag-and-drop list handlers | Changing storage schema |

### Tasks

| # | Task | Files Impacted |
|---|---|---|
| 1.1 | **Write tests for existing import/export behavior** in `modals.ts` and `options.ts`. Cover: valid JSON import, invalid JSON rejection, missing `tabs` array rejection, export downloads a file via `chrome.runtime.sendMessage`. Use the mock pattern from `storage.test.ts`. | `test/import-export.test.ts` [NEW] |
| 1.2 | Create `src/utils/importExport.ts` [NEW]. Move `exportSettings()`, the import validation logic, and `exportAllAccounts()` from `modals.ts` into this module. Both `modals.ts` and `options.ts` will import from here. | `src/utils/importExport.ts` [NEW], `src/modules/modals.ts`, `src/options.ts` |
| 1.3 | Create `src/utils/tabListRenderer.ts` [NEW]. Extract the tab list item DOM construction logic that is duplicated between `createSettingsModal.refreshList()` in `modals.ts` (lines 732 to 795) and `renderSettingsTabList()` in `options.ts` (lines 236 to 306). The shared function should accept configuration (container element, tab array, drag-drop enabled flag, edit/delete callbacks). | `src/utils/tabListRenderer.ts` [NEW], `src/modules/modals.ts`, `src/options.ts` |
| 1.4 | **Write unit tests for `tabListRenderer.ts`**. Test: renders correct number of list items, attaches correct data attributes, calls edit callback on edit button click, calls delete callback on delete button click. | `test/tabListRenderer.test.ts` [NEW] |
| 1.5 | **Write unit tests for `importExport.ts`**. Cover: `validateImportData()` accepts valid schema, rejects missing tabs, rejects invalid tab entries, `buildExportPayload()` produces correct JSON shape. Move the inline `validateImportTabs` function from `storage.test.ts` (lines 237 to 250) into the new module as a proper export. | `test/import-export.test.ts` [NEW] |
| 1.6 | Update `modals.ts` to import from `importExport.ts` and `tabListRenderer.ts` instead of containing inline implementations. | `src/modules/modals.ts` |
| 1.7 | Update `options.ts` to import from `importExport.ts` and `tabListRenderer.ts` instead of containing inline implementations. | `src/options.ts` |
| 1.8 | Run full test suite + manual smoke test in Chrome. Verify: settings modal tab list renders, drag reorder works in both Gmail overlay and options page, import/export functions identically to before. | None (verification only) |

### Dependencies

| Depends On | Reason |
|---|---|
| Phase 0 | Linting ensures new modules follow conventions from day one. |

### Risks and Mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Subtle behavioral differences between modal and options page implementations | Medium | Task 1.1 writes tests for both existing implementations before extraction, catching divergence. |
| Drag-and-drop breaks after extraction | Medium | The `dragdrop.ts` module's `createModalDragHandlers()` factory takes callbacks; extraction will preserve this pattern. Manual smoke test required. |

### Exit Criteria

- [ ] `modals.ts` no longer contains inline import/export or tab-list rendering code
- [ ] `options.ts` no longer contains inline import/export or tab-list rendering code
- [ ] All new test files pass
- [ ] All existing test files pass without modification
- [ ] Line count of `modals.ts` reduced by at minimum 100 lines
- [ ] Line count of `options.ts` reduced by at minimum 60 lines
- [ ] Manual smoke test confirms: import, export, tab list rendering, drag reorder all work in both contexts

## Phase 2: Decompose `modals.ts`

**Objective:** Split the 919-line `modals.ts` monolith into individual single-responsibility modal modules.

**Effort:** L (3 to 5 days)

### Scope

| Included | Excluded |
|---|---|
| Split each modal into its own file | Changing modal UI or behavior |
| Write tests per modal | Adding new modals |
| Preserve the callback injection pattern | Changing the coordinator wiring |

### Milestones

| Milestone | Deliverable |
|---|---|
| M2.1: Pin + Edit + Delete extracted | 3 new files, 1 barrel file, tests |
| M2.2: Import + Uninstall extracted | 2 new files, tests |
| M2.3: Settings modal extracted, old `modals.ts` deleted | 1 new file, barrel file finalized |

### Tasks

| # | Task | Files Impacted |
|---|---|---|
| 2.1 | Create `src/modules/modals/` directory. | Directory [NEW] |
| 2.2 | Extract `showPinModal()` (lines 27 to 120) into `src/modules/modals/pinModal.ts` [NEW]. It depends on `addTab` from storage and `state.currentUserEmail`. Preserve the same function signature. | `src/modules/modals/pinModal.ts` [NEW] |
| 2.3 | Extract `showEditModal()` (lines 126 to 207) into `src/modules/modals/editModal.ts` [NEW]. Depends on `updateTab` from storage and `state.currentUserEmail`. | `src/modules/modals/editModal.ts` [NEW] |
| 2.4 | Extract `showDeleteModal()` (lines 213 to 284) into `src/modules/modals/deleteModal.ts` [NEW]. Depends on `removeTab` from storage and `state.currentUserEmail`. | `src/modules/modals/deleteModal.ts` [NEW] |
| 2.5 | Write unit tests for Pin, Edit, Delete modals. Each test should verify: modal element is appended to `document.body`, correct callback is invoked on confirm, modal is removed on cancel/Escape. Use jsdom environment. | `test/modals/pinModal.test.ts` [NEW], `test/modals/editModal.test.ts` [NEW], `test/modals/deleteModal.test.ts` [NEW] |
| 2.6 | Extract `showImportModal()` (lines 338 to 455) into `src/modules/modals/importModal.ts` [NEW]. After Phase 1, this delegates to `importExport.ts` for validation. | `src/modules/modals/importModal.ts` [NEW] |
| 2.7 | Extract `showUninstallModal()` + `exportAllAccounts()` + `uninstallExtension()` (lines 461 to 564) into `src/modules/modals/uninstallModal.ts` [NEW]. | `src/modules/modals/uninstallModal.ts` [NEW] |
| 2.8 | Write unit tests for Import and Uninstall modals. | `test/modals/importModal.test.ts` [NEW], `test/modals/uninstallModal.test.ts` [NEW] |
| 2.9 | Extract `toggleSettingsModal()` + `createSettingsModal()` (lines 570 to 918) into `src/modules/modals/settingsModal.ts` [NEW]. This is the largest extraction (348 lines). After Phase 1, it delegates tab list rendering to `tabListRenderer.ts`. | `src/modules/modals/settingsModal.ts` [NEW] |
| 2.10 | Create barrel file `src/modules/modals/index.ts` [NEW] that re-exports all modal functions and `setRenderCallback()`. This preserves the existing import path for `content.ts`. | `src/modules/modals/index.ts` [NEW] |
| 2.11 | Update `content.ts` imports from `'./modules/modals'` to `'./modules/modals/index'` (or let barrel resolution handle it). Verify callback wiring still works. | `src/content.ts` |
| 2.12 | Delete old `src/modules/modals.ts` once all modals are extracted and tests pass. | `src/modules/modals.ts` [DELETE] |
| 2.13 | Run full test suite + manual smoke test. Verify: all 6 modal types open, function, and close correctly. | None (verification only) |

### Dependencies

| Depends On | Reason |
|---|---|
| Phase 1 | Import/export and tab list rendering must already be extracted for clean modal decomposition. |

### Risks and Mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| `setRenderCallback` wiring breaks during extraction | Medium | The barrel file re-exports `setRenderCallback`. The variable `_renderTabs` moves to the barrel or to a shared scope accessible by all modal files. |
| Settings modal (335 lines) is too complex to extract cleanly | Low | After Phase 1, tab list rendering is already extracted. The remaining logic is theme switching and control wiring, which is self-contained. |

### Exit Criteria

- [ ] `src/modules/modals.ts` no longer exists
- [ ] 6 individual modal files exist in `src/modules/modals/`
- [ ] Barrel file `index.ts` re-exports all public functions
- [ ] `content.ts` imports work without changes to the wiring pattern
- [ ] All new modal tests pass
- [ ] All existing tests pass
- [ ] Manual smoke test confirms all 6 modal dialogs function correctly

## Phase 3: Test Coverage Expansion

**Objective:** Bring test coverage to the untested modules: `tabs.ts`, `unread.ts`, `theme.ts`, and `content.ts` initialization logic.

**Effort:** L (3 to 5 days)

### Scope

| Included | Excluded |
|---|---|
| Unit tests for `tabs.ts` rendering | Integration/E2E tests |
| Unit tests for `unread.ts` label matching | Testing InboxSDK interactions |
| Unit tests for `theme.ts` detection | Testing actual Gmail DOM |
| Unit tests for `content.ts` init sequence | Testing XHR interception in production |

### Tasks

| # | Task | Files Impacted |
|---|---|---|
| 3.1 | **`tabs.ts` tests**: Test `createTabsBar()` returns element with correct ID. Test `renderTabs()` generates correct number of tab elements from mock settings. Test `updateActiveTab()` applies `active` class to correct tab based on `window.location.hash`. Test click handler sets correct hash value. | `test/tabs.test.ts` [NEW] |
| 3.2 | **`unread.ts` tests**: Test `normalizeLabel()` handles slashes, dashes, underscores, mixed case, and encoded characters. Test `buildLabelMapFromDOM()` with a mock sidebar DOM containing label links. Test `handleUnreadUpdates()` correctly maps system labels (`^i` to `#inbox`, `^t` to `#starred`) and custom labels. Test `getUnreadCountFromDOM()` extracts count from `.bsU` element, `aria-label`, and `title` attribute patterns. | `test/unread.test.ts` [NEW] |
| 3.3 | **`theme.ts` tests**: Test `detectGmailDarkMode()` returns `true` for known dark background colors. Test `detectGmailDarkMode()` returns `false` for light backgrounds. Test `applyTheme()` toggles `force-dark`/`force-light` classes correctly. Test `parseLuminance()` (internal, test via detection). | `test/theme.test.ts` [NEW] |
| 3.4 | **`content.ts` init tests**: Test `extractEmailFromDOM()` via mock document title containing email. Test `extractEmailFromDOM()` via mock `aria-label` on account element. Test storage change listener triggers `renderTabs()` for relevant key changes. | `test/content.test.ts` [NEW] |
| 3.5 | Add Jest `--coverage` flag to `npm test` script. Set coverage thresholds in `jest.config.js`: `statements: 60`, `branches: 50`, `functions: 60`, `lines: 60`. | `jest.config.js`, `package.json` |
| 3.6 | Update CI to upload coverage report as artifact and fail on threshold violations. | `.github/workflows/ci.yml` |

### Dependencies

| Depends On | Reason |
|---|---|
| Phase 2 | Modal extraction must be complete so tests do not depend on the monolith. |

### Risks and Mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| JSDOM cannot simulate Gmail-specific DOM structures | Medium | Create factory functions (e.g., `createMockGmailSidebar()`) that produce minimal DOM matching Gmail's structure. Test behavior, not layout. |
| `content.ts` has side effects on import (InboxSDK, MutationObserver) | High | Mock `InboxSDK.load`, `MutationObserver`, and `chrome.*` APIs at the top of test files. Alternatively, extract `extractEmailFromDOM()` and `attemptInjection()` into a separate testable utility. |

### Exit Criteria

- [ ] Test files exist for `tabs.ts`, `unread.ts`, `theme.ts`, `content.ts`
- [ ] Total tests across the repo exceed 60
- [ ] `npm test -- --coverage` reports at minimum 60% statement coverage
- [ ] CI enforces coverage thresholds
- [ ] No existing tests are broken

## Phase 4: Architectural Improvements

**Objective:** Harden the shared state pattern, centralize Gmail DOM selectors, and remove dead code.

**Effort:** M (2 to 3 days)

### Scope

| Included | Excluded |
|---|---|
| State access control improvements | New feature development |
| Gmail selector centralization | Selector refactoring (keeping existing selectors) |
| Experimental code cleanup | Re-implementing deferred features |
| `@ts-ignore` reduction in xhrInterceptor | Rewriting the XHR interceptor |

### Tasks

| # | Task | Files Impacted |
|---|---|---|
| 4.1 | **State access control**: Replace direct property mutation of `state.currentSettings` with getter/setter functions in `state.ts`. Add `getSettings()`, `setSettings()`, and `getUserEmail()` functions. The setter should reject `null` if settings have already been loaded (preventing accidental clearing). Update all consumers. | `src/modules/state.ts`, `src/content.ts`, `src/modules/tabs.ts`, `src/modules/modals/settingsModal.ts`, `src/modules/unread.ts` |
| 4.2 | **Centralize Gmail selectors**: Create `src/utils/selectors.ts` [NEW]. Move all Gmail-specific CSS selectors from across the codebase into named constants with JSDoc comments explaining what each selector targets. This includes: `TOOLBAR_SELECTORS` from `state.ts`, `.bsU` from `unread.ts`, `.nH` from `theme.ts`, `[role="navigation"]` / `.wT` from `unread.ts`, label link selectors from `unread.ts`. | `src/utils/selectors.ts` [NEW], `src/modules/state.ts`, `src/modules/unread.ts`, `src/modules/theme.ts` |
| 4.3 | **Remove dead experimental code**: Delete `src/experimental/LabelMenuIntegration.ts`. Create a git tag `archive/label-menu-integration` pointing to the current commit before deletion, so the code remains accessible via Git history. | `src/experimental/LabelMenuIntegration.ts` [DELETE] |
| 4.4 | **Reduce `@ts-ignore` in xhrInterceptor.ts**: Replace the 4 `@ts-ignore` comments with a typed `InstrumentedXHR` interface extending `XMLHttpRequest` with the `_url` property. Cast `this` to `InstrumentedXHR` in the monkey-patched methods. | `src/xhrInterceptor.ts` |
| 4.5 | **Add source maps for development builds**: Add `sourcemap: true` to the esbuild config when `isWatch` is true (watch mode only). Production builds remain without source maps. | `build.js` |
| 4.6 | Write tests for the new state getter/setter functions. Verify setter rejects null after initialization. | `test/state.test.ts` [NEW] |

### Dependencies

| Depends On | Reason |
|---|---|
| Phase 3 | Tests must exist for modules being modified to catch regressions. |

### Risks and Mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| State setter changes break initialization order in `content.ts` | Medium | The setter `setSettings(null)` rejection only activates after the first non-null set. During initialization, the state starts as `null` and the first `setSettings()` call succeeds. |
| Selector centralization causes import cycles | Low | `selectors.ts` lives in `utils/` with zero internal dependencies (only string constants). |

### Exit Criteria

- [ ] `state.currentSettings` is no longer directly mutated outside `state.ts`
- [ ] All Gmail CSS selectors live in `src/utils/selectors.ts`
- [ ] `src/experimental/` directory is empty or deleted
- [ ] Zero `@ts-ignore` comments in `xhrInterceptor.ts`
- [ ] `npm run watch` produces source maps; `npm run build` does not
- [ ] All tests pass

## Phase 5: CI/CD Hardening

**Objective:** Automate production packaging validation and add Chrome Web Store deployment readiness checks.

**Effort:** S (1 day)

### Tasks

| # | Task | Files Impacted |
|---|---|---|
| 5.1 | Add a CI step that runs `npm run package` and verifies `extension.zip` exists and is under 5MB (Chrome Web Store limit). | `.github/workflows/ci.yml` |
| 5.2 | Add a CI step that validates `manifest.json` has version matching `package.json` version. | `.github/workflows/ci.yml` |
| 5.3 | Add a CI step that verifies no `@ts-ignore` comments in the production source (excluding `node_modules`). | `.github/workflows/ci.yml` |
| 5.4 | Add a CI step that checks the `dist/` folder structure matches expected layout: `js/content.js`, `js/background.js`, `js/xhrInterceptor.js`, `css/toolbar.css`, `manifest.json`, `options.html`, `welcome.html`. | `.github/workflows/ci.yml` |
| 5.5 | Upload `extension.zip` as a CI artifact alongside the existing `dist/` upload. | `.github/workflows/ci.yml` |

### Dependencies

| Depends On | Reason |
|---|---|
| Phase 4 | `@ts-ignore` check depends on Phase 4 removing all instances. |

### Exit Criteria

- [ ] CI produces both `dist/` artifact and `extension.zip` artifact
- [ ] CI validates manifest/package version parity
- [ ] CI validates dist folder structure
- [ ] CI checks for zero `@ts-ignore` in source

## Data Migration and Backward Compatibility

### Storage Schema Backward Compatibility

This roadmap makes **zero changes** to the `chrome.storage.sync` schema. The `Settings` interface in `storage.ts` is not modified. All refactoring is structural (moving code between files) not behavioral.

If a future phase adds new settings fields:

1. Add the field as optional (`newField?: type`) in the `Settings` interface
2. Add a default value in `DEFAULT_SETTINGS`
3. The spread merge in `getSettings()` (`{ ...defaults, ...stored }`) automatically handles existing users who lack the new field
4. Write a test in `storage.test.ts` confirming old settings without the new field still load correctly (see `settings backward compatibility` test block at line 396)

### Import/Export Backward Compatibility

The import validation function (currently inline, extracted in Phase 1) must continue accepting the current schema `{ version?: number, tabs: Tab[] }`. Any new fields added to the export format must be optional and ignore-safe during import.

## Observability and Logging Plan

### Current State

Production builds strip all `console.*` calls via esbuild's `drop: ['console']` config. The CI pipeline verifies zero `console.log` in the production bundle.

### Recommended Additions (Optional, Post Phase 5)

| Addition | Implementation |
|---|---|
| **Extension error tracking** | Add a `try/catch` boundary around `content.ts::init()` that writes failures to `chrome.storage.local` under a `_errors` key. The options page can display a "Debug Info" section. |
| **Usage telemetry** | Optional, privacy-respecting event tracking (tab count, rule count, theme preference) stored locally. No external network calls. Exportable via the existing export mechanism. |

## Rollback and Recovery Plan

### Per-Phase Rollback

Each phase produces a single merge commit (or a small set of commits). Rollback procedure:

```bash
# Identify the merge commit for the phase
git log --oneline --merges -5

# Revert the entire merge
git revert -m 1 <merge-commit-hash>

# Verify
npm test && npm run build
```

### Extension Update Rollback

Chrome auto-updates extensions. If a broken version reaches users:

1. **Hot fix:** Push a corrected version with an incremented patch number
2. **Nuclear option:** Use `chrome.management.uninstallSelf()` mechanism already built into the extension
3. **User recovery:** The export/import flow allows users to back up and restore their settings

### Settings Recovery

Users who experience data loss can:

1. Check `chrome.storage.sync` directly via `chrome://extensions` developer tools
2. Import a previously exported JSON backup
3. Settings are synced via Chrome Sync; signing into another Chrome profile restores them

## Task Dependency Graph

```
Phase 0: Tooling
    │
    ▼
Phase 1: Extract Shared Utilities ─────────┐
    │                                        │
    ▼                                        │
Phase 2: Decompose modals.ts                │
    │                                        │
    ▼                                        │
Phase 3: Test Coverage Expansion ◄──────────┘
    │
    ▼
Phase 4: Architectural Improvements
    │
    ▼
Phase 5: CI/CD Hardening
```

**Critical Path:** Phase 0 → Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5

Phase 3 can partially overlap with Phase 2 (writing tests for already-extracted modals while remaining extractions continue).

## Effort Estimation Summary

| Phase | Effort | Total Tasks | Reasoning |
|---|---|---|---|
| **Phase 0** | **S** (1 day) | 7 | Config file creation + one formatting commit. No logic changes. |
| **Phase 1** | **M** (2 to 3 days) | 8 | Two new utility modules with tests, updating two existing files. Medium complexity due to understanding both implementations. |
| **Phase 2** | **L** (3 to 5 days) | 13 | Largest phase. 6 modal extractions, each requiring careful preservation of DOM construction and callback wiring. |
| **Phase 3** | **L** (3 to 5 days) | 6 | Writing tests for complex DOM-dependent modules. Requires building mock factories for Gmail DOM structures. |
| **Phase 4** | **M** (2 to 3 days) | 6 | State pattern change touches 5+ files but each change is small. Selector centralization is mechanical. |
| **Phase 5** | **S** (1 day) | 5 | CI YAML changes only. No source code modifications. |

**Total estimated effort:** 12 to 18 days of focused development.

## Top 5 Execution Risks

| # | Risk | Impact | Probability | Mitigation |
|---|---|---|---|---|
| 1 | **Gmail DOM update during refactoring** breaks existing selectors | High (extension stops working) | Low (infrequent) | Phase 4 centralizes selectors. Selector changes become single-file fixes. |
| 2 | **Settings modal extraction (Phase 2.9)** introduces subtle behavioral regressions | Medium (user-facing UX breaks) | Medium | Write targeted tests, manual smoke test checkpoint after extraction. |
| 3 | **Drag-and-drop breaks** after tab list renderer extraction | Medium (tab reordering unusable) | Medium | `createModalDragHandlers()` factory pattern is preserved. Test manually in both Gmail overlay and options page. |
| 4 | **Test environment limitations** prevent testing DOM-heavy modules | Low (tests are incomplete) | Medium | Accept that some modules need integration tests that run in a real browser. Defer E2E tests to a future phase. |
| 5 | **Scope creep** from discovering additional debt during refactoring | Low (timeline slips) | High | Log discovered issues as GitHub Issues. Do not fix them inline unless they are blocking the current phase. |

## First 7 Days Action Plan

### Day 1: Phase 0 (Tooling)

- [ ] 09:00: Create `.eslintrc.json` and `.prettierrc` (Tasks 0.1, 0.2)
- [ ] 10:00: Install ESLint TypeScript packages (Task 0.3)
- [ ] 10:30: Update `package.json` scripts (Task 0.4)
- [ ] 11:00: Run Prettier across all source files, commit formatting-only (Task 0.5)
- [ ] 11:30: Update CI pipeline (Task 0.6)
- [ ] 12:00: Run `npm test && npm run build && npm run lint` to verify (Task 0.7)
- [ ] 12:30: Push Phase 0 commit to `main`

### Day 2 to 3: Phase 1 (Extract Shared Utilities)

- [ ] Day 2 AM: Write pre-extraction tests for import/export behavior (Task 1.1)
- [ ] Day 2 PM: Create `importExport.ts`, extract logic from both files (Tasks 1.2, 1.5)
- [ ] Day 3 AM: Create `tabListRenderer.ts`, extract logic (Tasks 1.3, 1.4)
- [ ] Day 3 PM: Update `modals.ts` and `options.ts` to use shared modules (Tasks 1.6, 1.7)
- [ ] Day 3 EOD: Full test suite + manual smoke test (Task 1.8)

### Day 4 to 7: Phase 2 Milestone M2.1 (Pin + Edit + Delete Extraction)

- [ ] Day 4 AM: Create `src/modules/modals/` directory (Task 2.1)
- [ ] Day 4: Extract Pin, Edit, Delete modals (Tasks 2.2, 2.3, 2.4)
- [ ] Day 5: Write tests for Pin, Edit, Delete modals (Task 2.5)
- [ ] Day 6: Extract Import and Uninstall modals (Tasks 2.6, 2.7, 2.8)
- [ ] Day 7: Create barrel file, verify wiring, smoke test (Tasks 2.10, 2.11)

**End of Day 7 checkpoint:** Pin, Edit, Delete, Import, and Uninstall modals are extracted with tests. Settings modal extraction (the largest) begins Day 8.
