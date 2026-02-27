# Requirements: Gmail Labels & Queries as Tabs

**Defined:** 2026-02-27
**Core Value:** Users can instantly switch between their most-used Gmail views via a clean, native-feeling tab bar — with zero configuration friction and zero data leaving their browser.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Quality & Security

- [ ] **QUAL-01**: Migration function completes before downstream code executes (fix fire-and-forget)
- [ ] **QUAL-02**: All user-controlled strings are HTML-escaped before DOM insertion (fix XSS)
- [ ] **QUAL-03**: Dual email detection cannot trigger double initialization (fix race condition)
- [ ] **QUAL-04**: Storage tests compile and pass against current `addTab`/`removeTab` API
- [ ] **QUAL-05**: Production build contains zero `console.log` statements
- [ ] **QUAL-06**: CI workflow runs tests and build on every push/PR

### Performance

- [ ] **PERF-01**: MutationObserver callbacks are debounced (≤10 calls/second under normal use)
- [ ] **PERF-02**: Unhandled promise rejections eliminated in drag-and-drop and export flows

### Architecture

- [ ] **ARCH-01**: `content.ts` decomposed into focused modules (tabs, modals, dragdrop, unread, theme)
- [ ] **ARCH-02**: Dead code removed (getLabelUrl, handleGlobalDragOver/Drop, legacy labels write, currentSdk)
- [ ] **ARCH-03**: Runtime schema validation for `chrome.storage.sync` data (type-safe deserialization)
- [ ] **ARCH-04**: Replace `innerHTML` modal construction with `document.createElement` + `textContent`
- [ ] **ARCH-05**: Remove legacy `labels?` field from Settings interface (replace with separate LegacySettings type)
- [ ] **ARCH-06**: Remove dead `openOptions` handler from background.ts
- [ ] **ARCH-07**: Fix `onInstalled` to not write legacy format

### Code Quality

- [ ] **CODE-01**: Replace deprecated `unescape()` with `TextEncoder` in background.ts
- [ ] **CODE-02**: Remove `@ts-ignore` suppressions with proper type augmentation for XHR
- [ ] **CODE-03**: Fix duplicate `.tab-drag-handle` CSS definitions
- [ ] **CODE-04**: Deduplicate drag-and-drop implementations (3 implementations → 1)
- [ ] **CODE-05**: Add `return true` for potential async `sendResponse` in message listener
- [ ] **CODE-06**: Add input validation on imported JSON tab schema

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Features

- **FEAT-01**: Keyboard shortcuts for tab switching (Ctrl+1, Ctrl+2, etc.)
- **FEAT-02**: Tab grouping / categories
- **FEAT-03**: Custom tab icons/colors
- **FEAT-04**: Firefox extension port (WebExtension APIs)
- **FEAT-05**: Options page (standalone, outside Gmail)
- **FEAT-06**: Nested label support (parent/child labels as hierarchical tabs)

### Testing

- **TEST-01**: Integration tests for content.ts initialization flow
- **TEST-02**: E2E testing with Puppeteer against real Gmail
- **TEST-03**: Visual regression testing for tab bar appearance

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Email composition / sending | Core value is navigation, not email creation |
| Server-side backend | Privacy-first: zero external requests is non-negotiable |
| Mobile app | Chrome extension platform only |
| OAuth / login management | Gmail handles auth; extension is purely UI |
| Notification system | Extension is passive navigation UI |
| AI / smart categorization | Complexity creep; user controls their own tabs |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| QUAL-01 | Phase 1 | ✅ Done |
| QUAL-02 | Phase 1 | ✅ Done |
| QUAL-03 | Phase 1 | ✅ Done |
| QUAL-04 | Phase 2 | ✅ Done |
| QUAL-05 | Phase 2 | ✅ Done (Gap Closure) |
| QUAL-06 | Phase 2 | ✅ Done (Gap Closure) |
| PERF-01 | Phase 1 | ✅ Done |
| PERF-02 | Phase 1 | ✅ Done |
| ARCH-01 | Phase 3 | ✅ Done |
| ARCH-02 | Phase 1 | ✅ Done |
| ARCH-03 | Phase 1 | ✅ Done |
| ARCH-04 | Phase 1 | ✅ Done |
| ARCH-05 | Phase 2 | ✅ Done |
| ARCH-06 | Phase 1 | ✅ Done |
| ARCH-07 | Phase 1 | ✅ Done |
| CODE-01 | Phase 2 | ✅ Done |
| CODE-02 | Phase 2 | ⚠️ Partial (0 in modules, 8 in xhrInterceptor — necessary) |
| CODE-03 | Phase 2 | ✅ Done |
| CODE-04 | Phase 3 | ⚠️ Partial (co-located, not unified — different axis semantics) |
| CODE-05 | Phase 2 | ✅ Done |
| CODE-06 | Phase 1 | ✅ Done |

**Coverage:**
- v1 requirements: 21 total
- Fully satisfied: 19
- Partially satisfied: 2 (CODE-02, CODE-04)
- Unsatisfied: 0 ✓

---
*Requirements defined: 2026-02-27*
*Last updated: 2026-02-27 after Gap Closure*
