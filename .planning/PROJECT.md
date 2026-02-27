# Gmail Labels & Queries as Tabs

## What This Is

A Chrome MV3 extension that injects a user-configurable tab bar directly into the Gmail web interface, enabling power users to create one-click shortcuts to Gmail labels, search queries, and custom hash views. Tabs are persistent, reorderable via drag-and-drop, and synced across devices via `chrome.storage.sync`. Includes a separate Vite+React marketing website.

## Core Value

**Users can instantly switch between their most-used Gmail views (labels, searches) via a clean, native-feeling tab bar — with zero configuration friction and zero data leaving their browser.**

## Requirements

### Validated

<!-- Shipped and confirmed valuable. -->

- ✓ **TABS-01**: User can add custom tabs for Gmail labels — v1.0
- ✓ **TABS-02**: User can add custom tabs for Gmail search queries — v1.0
- ✓ **TABS-03**: User can reorder tabs via drag-and-drop — v1.0
- ✓ **TABS-04**: User can pin/edit/delete individual tabs — v1.0
- ✓ **TABS-05**: Tabs persist across sessions via chrome.storage.sync — v1.0
- ✓ **THEME-01**: User can choose System/Light/Dark theme — v1.0
- ✓ **EXPORT-01**: User can export/import configuration as JSON — v1.0
- ✓ **MULTI-01**: Multi-account support with per-email settings — v1.0
- ✓ **UNREAD-01**: Real-time unread counts displayed on tabs — v1.0
- ✓ **NAV-01**: Click tab to navigate via Gmail hash-based routing — v1.0
- ✓ **PRIV-01**: Zero external network requests (privacy-first) — v1.0

### Active

<!-- Current scope. Building toward these. -->

- [ ] **QUAL-01**: Fix critical migration bug (fire-and-forget in storage.ts)
- [ ] **QUAL-02**: Fix XSS vulnerability in modal innerHTML
- [ ] **QUAL-03**: Fix race condition in dual email detection
- [ ] **QUAL-04**: Rewrite stale storage tests for current API
- [ ] **PERF-01**: Debounce MutationObserver (fires on every Gmail DOM change)
- [ ] **ARCH-01**: Break up content.ts monolith (2141 lines)
- [ ] **ARCH-02**: Remove dead code (getLabelUrl, handleGlobalDragOver/Drop, legacy labels write)
- [ ] **ARCH-03**: Add runtime schema validation for stored data
- [ ] **QUAL-05**: Strip console.log from production build
- [ ] **QUAL-06**: Add CI test + build workflow

### Out of Scope

<!-- Explicit boundaries. Includes reasoning to prevent re-adding. -->

- Real-time chat / messaging — Not aligned with navigation-tool core value
- Mobile app — Chrome extension only, no mobile equivalent platform
- OAuth / account management — Extension doesn't manage auth; Gmail handles it
- Email composition features — Out of scope; we only do navigation/view switching
- Notification system — Extension is passive UI; no alerts or notifications needed
- Server-side backend — Privacy-first means everything stays client-side

## Context

- **Platform:** Chrome Web Store, Manifest V3
- **Architecture:** Three execution contexts (Service Worker, Isolated World content script, Main World XHR interceptor)
- **Primary tech debt:** `content.ts` is a 2141-line monolith handling 8+ responsibilities
- **Tests:** Currently broken — `storage.test.ts` imports renamed functions; `content.ts` has zero test coverage
- **XHR approach:** Undocumented Gmail internal API parsing — inherently fragile, changes without notice
- **Recent audit:** Full AUDIT.md completed 2026-02-27 identifying 4 critical, 6 high, 4 medium, 3 low, 7 dead code items, 6 structural improvements

## Constraints

- **Tech stack**: TypeScript + esbuild, Chrome MV3, no runtime dependencies — Bundle must be self-contained
- **Privacy**: Zero external network requests — Core brand promise, non-negotiable
- **Platform**: Gmail web (`mail.google.com`) only — Extension relies on Gmail-specific DOM selectors
- **Storage**: `chrome.storage.sync` (102,400 bytes total, 8,192 per item) — Limits total tabs/accounts
- **Compatibility**: Chrome 120+ (MV3 baseline) — No Firefox/Safari support currently

## Key Decisions

<!-- Decisions that constrain future work. Add throughout project lifecycle. -->

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Use `chrome.storage.sync` over `local` | Cross-device sync is a key feature | ✓ Good |
| Per-account key namespacing (`account_{email}`) | Multi-account Gmail support | ✓ Good |
| Dual-world injection (Isolated + Main) | Need XHR access for unread counts; MV3 forbids direct page JS access from content scripts | ✓ Good |
| InboxSDK for route detection | Provides Gmail-aware routing and user identity | ⚠️ Revisit (200KB overhead for 2 features) |
| Single `content.ts` monolith | Rapid initial development | ⚠️ Revisit (now 2141 lines, unmaintainable) |
| `innerHTML` for modals | Quick implementation | ⚠️ Revisit (XSS vulnerability identified) |
| Three-strategy unread count waterfall | Robustness against any single method failing | ✓ Good |

---
*Last updated: 2026-02-27 after GSD initialization*
