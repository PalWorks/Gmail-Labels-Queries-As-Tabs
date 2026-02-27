# Roadmap: Gmail Labels & Queries as Tabs

## Overview

This roadmap addresses the 30 actionable items identified in the production audit (AUDIT.md). The project is a brownfield Chrome extension with a working v1.0 that needs hardening before further feature development. Work is structured as three phases: fix critical bugs first (safety), then clean up code quality (hygeine), then decompose the monolith (architecture). Each phase delivers independently verifiable improvements.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

- [ ] **Phase 1: Critical Fixes & Safety** - Fix the 4 critical defects and high-priority safety issues
- [ ] **Phase 2: Code Quality & Testing** - Restore tests, add CI, clean up code smells
- [ ] **Phase 3: Architecture & Decomposition** - Break content.ts monolith, deduplicate drag logic

## Phase Details

### Phase 1: Critical Fixes & Safety
**Goal**: The extension is safe from data loss, XSS, and race conditions — all critical defects resolved
**Depends on**: Nothing (first phase)
**Requirements**: QUAL-01, QUAL-02, QUAL-03, PERF-01, PERF-02, ARCH-02, ARCH-03, ARCH-04, ARCH-06, ARCH-07, CODE-06
**Success Criteria** (what must be TRUE):
  1. `migrateLegacySettingsIfNeeded()` awaits inner callback — legacy users' data survives upgrade
  2. All user-controlled strings in modals use `textContent` or `createElement`, never raw `innerHTML`
  3. `finalizeInit()` can never be called twice regardless of DOM/SDK detection timing
  4. MutationObserver fires ≤10 callbacks/second under normal Gmail usage
  5. `npm run build` produces a working extension with no dead code paths
**Plans**: TBD

Plans:
- [ ] 01-01: Fix migration fire-and-forget + add init race guard + fix dead code in background.ts
- [ ] 01-02: Replace innerHTML with safe DOM construction + add import validation
- [ ] 01-03: Debounce MutationObserver + fix unhandled promise rejections + add storage validation

### Phase 2: Code Quality & Testing
**Goal**: Tests pass, CI catches regressions, code smells cleaned up
**Depends on**: Phase 1
**Requirements**: QUAL-04, QUAL-05, QUAL-06, ARCH-05, CODE-01, CODE-02, CODE-03, CODE-05
**Success Criteria** (what must be TRUE):
  1. `npm test` passes with tests covering storage CRUD, XHR parsing, and import validation
  2. GitHub Actions runs tests + build on every push and PR
  3. Production bundle contains zero `console.log` statements
  4. Zero `@ts-ignore` suppressions in the codebase
**Plans**: TBD

Plans:
- [ ] 02-01: Rewrite storage tests + add import validation tests
- [ ] 02-02: Add CI workflow + strip console.log + fix deprecated APIs
- [ ] 02-03: Remove @ts-ignore with type augmentation + fix CSS duplication + clean up legacy types

### Phase 3: Architecture & Decomposition
**Goal**: content.ts is decomposed into focused modules — each responsibility is isolated and testable
**Depends on**: Phase 2
**Requirements**: ARCH-01, CODE-04
**Success Criteria** (what must be TRUE):
  1. `content.ts` is ≤200 lines and only contains `init()` + orchestration
  2. Tab rendering, modals, drag-and-drop, unread counts, and theme are separate modules
  3. A single drag-and-drop implementation serves both tab bar and settings modal
  4. `npm run build` produces identical bundle behavior (no regressions)
  5. Each new module is independently importable and testable
**Plans**: TBD

Plans:
- [ ] 03-01: Extract tab rendering + navigation into `tabs/` module
- [ ] 03-02: Extract all modals into `modals/` module
- [ ] 03-03: Extract + deduplicate drag-and-drop into `dragdrop/` module
- [ ] 03-04: Extract unread count logic into `unread/` module + extract theme

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Critical Fixes & Safety | 0/3 | Not started | - |
| 2. Code Quality & Testing | 0/3 | Not started | - |
| 3. Architecture & Decomposition | 0/4 | Not started | - |
