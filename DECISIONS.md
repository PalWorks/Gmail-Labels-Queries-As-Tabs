# DECISIONS.md

Architecture Decision Records (ADRs). Each entry captures a durable choice, its context,
and its consequences so agents do not undo deliberate decisions.

Last updated: 2026-07-07 (v1.2.1)

## ADR-001: Dual-world architecture for unread counts

**Decision.** Run a content script in the isolated world and inject a separate script into
Gmail's MAIN world ([src/xhrInterceptor.ts](src/xhrInterceptor.ts)) to observe Gmail's own
XHR responses. The two communicate via `CustomEvent` on `document`.

**Context.** Isolated-world content scripts cannot see the page's `XMLHttpRequest`
traffic. Gmail's unread numbers are most reliable from its own API responses.

**Consequences.** More moving parts and a cross-world message channel to maintain. The
interceptor is `web_accessible` in the manifest. Changes to it need false-positive
regression tests.

## ADR-002: Theme stored browser-wide in chrome.storage.local

**Decision.** Persist the theme once per browser profile in `chrome.storage.local` under
`globalTheme`, not per account in `chrome.storage.sync`.

**Context.** Users with many Gmail accounts open in one window expect a single theme to
apply everywhere at once. Per-account theme in synced storage caused each account to differ
and did not propagate live.

**Consequences.** Theme is not device-synced (accepted tradeoff for per-window
consistency). A `storage.local` change event fans the theme out to every open Gmail tab.
`Settings.theme` is kept only for migration seeding. See [DATA_MODEL.md](DATA_MODEL.md).

## ADR-003: Default theme is light

**Decision.** When no theme is stored, default to `light` (previously `system`).

**Context.** A predictable, high-contrast default reads better for most users than
following the OS, and it makes the first-run appearance deterministic.

**Consequences.** Existing users keep whatever value migration already seeded; only fresh
installs see the new default. `system` remains a selectable option.

## ADR-004: Callback-injection to break circular dependencies

**Decision.** Modules that the content script both imports and must call back into receive
their callbacks via setters (`setRenderCallback`, `setModalCallbacks`) rather than
importing the content script.

**Context.** Rendering and modal code need to trigger re-renders, but importing back into
`content.ts` would create import cycles.

**Consequences.** A small amount of wiring at startup. No framework or DI container is
introduced, and cycles are avoided. Keep this pattern for new cross-module calls.

## ADR-005: Encapsulated module state behind accessors

**Decision.** Shared runtime state lives in [src/modules/state.ts](src/modules/state.ts)
as module-private fields exposed only through typed accessors
(`getAppSettings`, `setAppSettings`, `setAppTabs`, `getUserEmail`, `setUserEmail`,
`resetState`).

**Context.** Direct mutation of a shared settings object from many modules made state
changes hard to trace and easy to corrupt.

**Consequences.** All writes are funneled and guarded. Do not reach around the accessors.

## ADR-006: Shared tab-manager for add-tab and list behavior

**Decision.** The options page and the in-Gmail settings modal share add-tab parsing and
managed-list rendering through [src/modules/tabManager.ts](src/modules/tabManager.ts),
sharing behavior rather than markup.

**Context.** The two surfaces had duplicated, drifting add/edit/reorder logic.

**Consequences.** One source of truth for tab input behavior; fixes apply to both
surfaces. Net code reduction.

## ADR-007: Bounded, single-flight injection and cached unread fetches

**Decision.** Tab-bar injection uses a single-flight guard with bounded retries; unread
fetches are coalesced and cached per label with a short TTL (about 30 seconds).

**Context.** Gmail re-renders aggressively. Naive retrying produced unbounded timers and
duplicate network reads.

**Consequences.** At most one in-flight fetch per label per TTL window and no runaway
timers. See [src/content.ts](src/content.ts) and [src/modules/unread.ts](src/modules/unread.ts).

## ADR-008: Zero external network requests

**Decision.** The extension never contacts any origin other than `mail.google.com`.

**Context.** Privacy is a core product promise and a Chrome Web Store trust factor.

**Consequences.** No analytics or remote config is possible. Unread data must come from
Gmail's feed, XHR, or DOM only. This is a hard constraint, see [SECURITY.md](SECURITY.md).

**Amended by ADR-012.** The single exception is feedback the user types and submits.
Nothing is sent in the background, ever.

## ADR-009: esbuild with console dropped, TypeScript strict

**Decision.** Bundle five entry points with esbuild, minified, with `drop: ['console']`;
build under `tsc --noEmit` strict with zero errors and no `@ts-ignore`.

**Context.** Small, fast, dependency-light build suited to a browser extension; clean
production bundle; strong type safety.

**Consequences.** No runtime console output in production; CI enforces both. See
[PLAYBOOK.md](PLAYBOOK.md) and [TESTING.md](TESTING.md).

## ADR-010: Tab colors are named palette tokens, not raw hex

**Decision.** `Tab.color` stores one of a fixed set of named tokens
([src/utils/colors.ts](src/utils/colors.ts)); the actual color is supplied by CSS per
token, not stored. No free-form hex input.

**Context.** Arbitrary user hex breaks theme safety and accessibility (unreadable accents
in one theme, uncontrollable contrast) and is unvalidatable on import. A small enum keeps
stored data validatable, keeps color decorative (accent dot + active underline, never the
sole cue), and lets each theme render an appropriate shade.

**Consequences.** Adding a color means editing the palette in one util + its CSS token
map (mirrored in [toolbar.css](src/ui/toolbar.css) and [options.css](src/options.css)).
Imported unknown tokens fall back to default rather than erroring.

## ADR-011: Rule-template library behind a single feature flag

**Decision.** The one-click starter-preset feature lives entirely in
[src/modules/ruleTemplates.ts](src/modules/ruleTemplates.ts) and is gated by the
`RULE_TEMPLATES_ENABLED` constant. `applyRuleTemplate` ensures the label tab exists and
upserts its enabled rule in a single atomic `saveSettings`.

**Context.** The feature was requested with an explicit "make it easy to toggle OFF later"
constraint. Isolating definitions, apply logic, and the flag in one module means flipping
the flag removes all UI with no other code change, and the module can be deleted wholesale.

**Consequences.** The options page renders the templates gallery only when the flag is on.
Applying is atomic, so a tab is never created without its rule.

## ADR-012: In-product feedback via a relay, the one exception to ADR-008

**Decision.** The options page carries a feedback form that POSTs to a small Cloudflare
Worker ([worker/](worker/)), which sends one email via Resend. This is the only origin the
extension contacts besides `mail.google.com`, and it is contacted only when the user presses
Send.

**Context.** Feedback previously required leaving the extension for an external form, and
most people did not. Calling the mail provider straight from the extension is not an option:
a published CRX is a zip anyone can unpack, so an API key inside it is a public key that
would let a stranger send mail as our domain. A relay holds the key instead.

**Consequences.** The "zero external network requests" claim becomes "no telemetry, and no
request at all unless you submit feedback", which the Privacy page now states in those
terms. The Chrome Web Store data disclosure must declare that a message, an optional email
address, and opt-in diagnostics are transmitted. Diagnostics are counts, the extension
version and the browser build only: never label names, tab titles, addresses or mail
content. The relay validates hard, rate limits per IP, and stores nothing. If the Worker is
ever taken down, the form degrades to an error message and the `mailto:` fallback beneath
it still works.
