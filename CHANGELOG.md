# Changelog

All notable changes to **Gmail Labels and Search Queries as Tabs** are documented here.
The format follows Keep a Changelog, and the project uses semantic versioning. Keep
`manifest.json` and `package.json` in sync with the version headings below.

## [1.5.0] - 2026-09-21

A hardening release. No new features; the changes are correctness, safety and the
guards that stop each defect coming back.

### Fixed

- **Automation rules could act on the wrong mail.** The generated Apps Script put the label
  into the Gmail search unquoted, so a label named `Old Stuff` produced a query Gmail reads
  as `label:Old AND Stuff` and matched threads that were never in the label. With a trash
  rule that deletes the wrong mail, unattended, and no unusual input was needed. The label is
  now quoted, each rule is capped at 200 threads per run, and every thread is checked for the
  exact label name before anything touches it ([src/modules/rules.ts](src/modules/rules.ts)).
- **A second script-injection path.** The account id was escaped for a JavaScript string and
  then dropped into the block comment in the generated script's header, which needs a
  different escaper. A close-comment sequence in that value ended the comment and turned what
  followed into live top-level code in a script the user runs under their own Google account.
  Found by the new property test, not by review.
- **Settings could be lost when two surfaces wrote at once.** Every write was a
  read-modify-write against one storage key with a shallow merge, so two writers touching
  unrelated tabs still clobbered each other. The worst case needed no timing skill: the
  options page rendered five tabs, a Gmail tab added a sixth, and a drag in the options page
  wrote the five-tab array straight over the top. See ADR-013.
- **An unrecognised mutation could erase an account.** Uncovered while testing the above.
  See ADR-013.
- **Stored XSS via an imported backup.** A tab id went unescaped into a `data-tab-id`
  attribute in the options page, and import validation checked that an id was a non-empty
  string but never what was in it. Fixed at the sink and at the boundary: unsafe ids are
  replaced with fresh UUIDs and the rules that referenced them are repointed, so a legacy
  export still restores ([src/utils/importExport.ts](src/utils/importExport.ts)).
- **A failed unread fetch looked like an empty label.** Failure was stored as the number 0 and
  served for the full 30s cache window, which blocked the retry that would have corrected it.
  Failures are now tracked separately, keep the last known count on screen, and back off from
  5s to a 5 minute ceiling ([src/modules/unread.ts](src/modules/unread.ts)).
- **Deleting a tab left its rule behind** in sync storage forever, unreachable because rules
  are keyed by a tab id that is never reused.
- **Two colours failed WCAG AA.** The rules table header (3.72 to 4.25:1 across all four
  surface and theme combinations) and the in-Gmail modal help icon (2.66:1 in dark mode,
  below even the non-text threshold). Both were hex values inside TypeScript template
  strings, where neither contrast guard could see them.
- **The theme could stay wrong on a slow connection.** The watcher observed class and style
  attributes, but Gmail's background usually arrives via a stylesheet, which changes no
  attribute. It now also watches for stylesheets and re-checks when a background tab is shown
  ([src/modules/theme.ts](src/modules/theme.ts)).
- Neither the service worker nor the content script returns `true` for messages it does not
  answer, which used to hold the sender's message channel open so a promise-form
  `sendMessage` never settled.

### Changed

- **All settings writes are serialized.** A change is now described as a `SettingsOp` and
  applied in the service worker, which is a single JavaScript context running one promise
  chain per account. When the worker cannot be reached, the write falls back to an optimistic
  `rev`-checked retry in the calling context. See ADR-013 and
  [DATA_MODEL.md](DATA_MODEL.md).
- **The options page follows changes made in Gmail.** It previously listened only for theme
  changes, so its state went stale the moment anything changed elsewhere and stayed stale.
  It now reloads on its own account's changes, skips its own writes, restores focus and caret
  afterwards, and defers a redraw while a drag is in progress.
- Unread feed fetches are capped at four at a time, so a tab bar with many labels on a slow
  link no longer competes with Gmail's own requests.
- Rule fields that accept free text coalesce their writes over 250ms and flush when the page
  is hidden.

### Removed

- **The uninstall URL.** Uninstalling used to open a third-party form, telling a company we
  have no relationship with that someone had just removed the extension. It was disclosed
  nowhere: not in SECURITY.md, not on the privacy page, not in the store listing, and not in
  the Web Store data declaration. Removed rather than disclosed; the in-product feedback form
  is the channel now, and the product is back to exactly one outbound origin. See ADR-014.

### Added (tests and guards)

- Property tests for the Apps Script generator: 1,000 generated inputs drawn from an alphabet
  of everything that has ever broken one of its four output languages, each evaluated and
  checked for parse failure, lossless round trip, a single quoted label term, and three
  canary globals ([test/rulesProperty.test.ts](test/rulesProperty.test.ts)).
- A guard that walks the TypeScript AST and fails on any unescaped interpolation into
  `innerHTML` ([test/htmlSinks.test.ts](test/htmlSinks.test.ts)).
- A guard that fails on any colour literal in `.ts` or `.html`, because both previous
  contrast guards only read `.css` ([test/contrast.test.ts](test/contrast.test.ts)).
- Guards against documentation drift and dead CSS: no live document may repeat the network
  claim the feedback relay retired, every repo path named in a document must resolve, every
  module must appear in CONTEXT_MAP, and no stylesheet may style a class the code never uses
  ([test/repoConsistency.test.ts](test/repoConsistency.test.ts)).
- Concurrency tests covering the reducer, the queue under ten interleaved writers, and every
  service-worker fallback path ([test/settingsOps.test.ts](test/settingsOps.test.ts)).
- CI now runs the suite a second time serially. Both intermittent failures this suite has had
  appeared only when timing shifted, so one green run was never evidence of a stable suite.

## [1.4.0] - 2026-09-21

### Added

- In-product feedback form on the Support & Feedback page. Pick a category, write a message, add
  an optional reply address, and send without leaving the extension. Diagnostics (extension
  version, browser build, and tab/rule/account counts) are opt-in via a ticked checkbox and
  never include label names, tab titles, addresses or mail content
  ([src/modules/feedback.ts](src/modules/feedback.ts)).
- Feedback relay Worker under [worker/](worker/): a small Cloudflare Worker that holds the
  Resend API key and sends one email per submission. It validates hard, rate limits to 5
  messages per IP per hour, carries a honeypot field, and stores nothing. Deployed to
  `gmail-tabs-feedback.sunmooncal.workers.dev`.

### Changed

- The Privacy page no longer claims "zero external network requests" in the absolute. It now
  states that there are no background requests at all, and describes the single user-initiated
  exception in plain terms (ADR-008 amended by ADR-012 in [DECISIONS.md](DECISIONS.md)).
- "Get in Touch" is now "Support & Feedback", and the section carries the form itself instead
  of a link out to the external support form; a
  `mailto:` fallback remains beneath it.

## [1.3.0] - 2026-07-09

### Added

- Custom tab colors. Assign an optional color to any tab from a fixed, theme-safe palette
  (red, orange, yellow, green, teal, blue, purple, pink). Colors render as a leading dot on
  the in-Gmail bar plus an active-state underline, and as a swatch on the options page and
  in-Gmail tab lists. Available from both the in-Gmail Edit Tab modal and the options page
  tab rows. Color is decorative only (never the sole indicator) and stored as a named token
  ([src/utils/colors.ts](src/utils/colors.ts)), so it stays accessible in light and dark.
- Automation rule starter templates. A gallery of one-click presets (Clean Promotions, Tidy
  Newsletters, Quiet Social, Archive Receipts, Clear Updates) on the Automation Rules page;
  applying one creates the matching label tab (if missing) and an enabled rule in a single
  atomic save. The whole feature is behind a single `RULE_TEMPLATES_ENABLED` flag
  ([src/modules/ruleTemplates.ts](src/modules/ruleTemplates.ts)).

### Changed

- Export/import now round-trips `Tab.color`; unknown color tokens are stripped on import
  and fall back to default rather than failing the import.
- Theme "System" now follows **Gmail's own theme**, not the OS setting. Gmail's theme is an
  account preference, so a dark desktop with a light Gmail used to render the tab bar dark
  against a light inbox. Detection reads Gmail's painted background, re-checks while the
  page settles, and tracks a Gmail theme switch without a reload
  ([src/modules/theme.ts](src/modules/theme.ts)). The OS media query is now only a last
  resort, used when Gmail's background cannot be read yet.
- The options page mirrors the theme Gmail last reported when the preference is "System",
  instead of consulting the OS, and applies it before account data loads so it no longer
  flashes the wrong mode.

### Fixed

- The options page sidebar showed a hardcoded version (`v1.2.1`) that never tracked
  releases; it now reads the version from the manifest.
- Tab colors are sanitized where they are read from storage, so an unknown token can no
  longer reach a render path. Previously such a token became a dead CSS class, was
  interpolated unescaped into the options-page markup, and left the color picker with
  nothing selected, which stranded keyboard focus on the trigger button.

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
