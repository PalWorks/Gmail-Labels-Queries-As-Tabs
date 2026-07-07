# Changelog

All notable changes to **Gmail Labels and Search Queries as Tabs** are documented here.
The format follows Keep a Changelog, and the project uses semantic versioning. Keep
`manifest.json` and `package.json` in sync with the version headings below.

## [1.2.1] - 2026-07-07

### Added

- Browser-wide theme propagation. Theme is now a single per-window preference in
  `chrome.storage.local` (`globalTheme`), so changing it in any account, the options page,
  or onboarding updates every open Gmail tab live.
- Export and import now include automation rules and the theme, not just tabs.
- Full keyboard and screen-reader support for the tab bar (roles, `tabindex`,
  `aria-label`, `aria-current`, `aria-expanded`, arrow-key navigation, Enter/Space
  activation, Escape to close menus and exit move mode).
- Shared tab-manager module ([src/modules/tabManager.ts](src/modules/tabManager.ts)) so
  the options page and the in-Gmail modal use one source of truth for add-tab parsing and
  list behavior.
- Agent-oriented documentation set: AGENTS, CONTEXT_MAP, DOMAIN, DATA_MODEL, DECISIONS,
  TESTING, SECURITY, PLAYBOOK, CONTRIBUTING, and this CHANGELOG.

### Changed

- Default theme is now `light` (previously `system`) for fresh installs. Existing users
  keep their migrated preference; `system` remains selectable.
- Replaced the Manage Tabs pencil icon with a standard settings gear icon.
- Automation rules are limited to tabs that map to a real Gmail label (hash-only tabs are
  skipped, since Apps Script operates on labels).
- Hardened the XHR interceptor against false-positive label/count matches (bounded integer
  counts, rejection of id/date-like keys, filtering against known rendered labels).
- Bounded, single-flight tab-bar injection retries and cached, coalesced unread fetches
  (about a 30 second TTL per label).
- Encapsulated shared runtime state behind typed accessors in
  [src/modules/state.ts](src/modules/state.ts).
- Raised Jest coverage thresholds and expanded the suite to 365 tests across 21 suites.
- Improved dark and light theme text contrast on the options page (muted, empty-state,
  version, and secondary hint text now meet WCAG AA).
- Added accessible names to modal close buttons and the unread-count toggle; marked
  decorative icons `aria-hidden`.

### Fixed

- Theme changes not propagating across multiple Gmail accounts in one window.
- Unread counts for hash-view tabs.
- Documentation corrected to match the modular architecture and dual storage areas.

## [1.2.0] - 2026

### Changed

- Version bump; Chrome Web Store listing URL corrected across the README and options page.
- CI hardening: added `export {}` to all test files to prevent TS2451 redeclaration errors.
- README rewritten with full architecture, modular structure, and expanded test coverage.
- Replaced the placeholder Get in Touch section with a support form link and a 5-star
  rating call to action.

## [1.1.0] - 2025

### Changed

- Modular architecture refactor, theme fixes, CI pipeline, and a production-ready README.
- Decomposed the modal monolith into `src/modules/modals/*`.

## [1.0.0] - 2025

### Added

- Initial release: configurable tab bar injected into Gmail, per-account tabs, unread
  counts, drag-and-drop reordering, automation rules with Google Apps Script generation,
  onboarding page, and data export.

[1.2.1]: https://github.com/PalWorks/Gmail-Labels-Queries-As-Tabs/releases
[1.2.0]: https://github.com/PalWorks/Gmail-Labels-Queries-As-Tabs/releases
[1.1.0]: https://github.com/PalWorks/Gmail-Labels-Queries-As-Tabs/releases
[1.0.0]: https://github.com/PalWorks/Gmail-Labels-Queries-As-Tabs/releases
