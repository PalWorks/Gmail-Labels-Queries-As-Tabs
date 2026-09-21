# DECISIONS.md

Architecture Decision Records (ADRs). Each entry captures a durable choice, its context,
and its consequences so agents do not undo deliberate decisions.

Last updated: 2026-09-21 (v1.5.0)

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

**Amended by ADR-012 and ADR-014.** Two exceptions exist and neither happens on its own:
feedback the user types and submits, and the uninstall page Chrome opens after the
extension has already been removed. Nothing is sent in the background, ever. Both hosts
must be disclosed in SECURITY.md, the in-extension privacy page and STORE_LISTING.md, or
the build fails.

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

## ADR-013: Serialize settings writes through the service worker

**Decision.** A change to an account's settings is described as a serializable `SettingsOp`
and applied by the service worker, which keeps one promise chain per account. When the
worker cannot be reached the same op is applied in the calling context, guarded by a `rev`
token and a bounded retry. `applyOp` is pure and does the work on both paths.

**Context.** Every surface writes: the options page, and the modals, drag handlers and tab
manager inside *every open Gmail tab*. Each did a read-modify-write against one storage key
and merged shallowly, so `tabs` and `rules` were replaced wholesale and two writers touching
unrelated tabs still clobbered each other.

The worst case needed no timing skill at all. The options page listened only for theme
changes, so its in-memory settings went stale the moment anything changed elsewhere and
stayed stale; meanwhile the reorder paths built a tab array from the rendered DOM and wrote
it whole. Open the options page with five tabs, add a sixth in Gmail, drag to reorder in the
options page, and the sixth is gone.

Three approaches were considered. A `rev` counter with read-verify-write narrows the window
to a microtask but never closes it, because `chrome.storage` has no compare-and-swap. Web
Locks cannot span the two contexts that matter: a content script's lock scope is the page's
origin, an extension page's is `chrome-extension://`. The service worker is a single
JavaScript context, so a per-account promise chain serializes every writer in the profile by
construction, with no lock and no window.

**Consequences.** Ops must be plain data and must be idempotent, because a lost worker reply
makes the caller fall back and apply the same op a second time. `reorderTabs` carries ids
rather than tab objects, which is what makes a stale drag safe rather than merely unlikely.

`applyOp` throws on an op kind it does not recognise. Without that it returned `undefined`
and the write path spread it over the account, erasing every tab and rule. A Gmail tab
running an older build against a just-updated worker reaches that path, so it is real.

This does not fix cross-device conflicts. Chrome Sync resolves per key as last-writer-wins
and gives us no hook. Shrinking the conflict unit would mean one key per tab, trading a
data-loss risk for a 120-writes-per-minute quota risk; not done, and recorded in
[DATA_MODEL.md](DATA_MODEL.md) rather than pretended away.

## ADR-014: Keep the uninstall URL, and make its disclosure a build gate

**Decision.** `chrome.runtime.setUninstallURL` stays, pointing at the Tally feedback form.
Its host is disclosed in SECURITY.md, on the in-extension privacy page, in STORE_LISTING.md
and in the Web Store data declaration, and a test fails the build if any of those omits an
outbound host the service worker names.

**Context.** During v1.5.0 this was removed on privacy grounds: it pointed at a third party
and was disclosed in no document, no privacy page and no store declaration. That reasoning
was half right. The undisclosed part was the defect; the URL itself is not, and uninstall is
the single moment the in-product feedback form cannot reach, because the extension is gone
by then. Losing that signal loses the only evidence of why people leave.

So the fix is disclosure, not deletion. Three things make the disclosure real rather than a
promise. The link is a bare form URL, so no address, settings or identifier travels with it,
and a test asserts that. The extension sends nothing itself: Chrome navigates the user, and
they decide whether to answer. And the disclosure is enforced by
`test/repoConsistency.test.ts`, which reads every `http(s)` host in `src/background.ts` and
fails if it is absent from any of the three documents, with a mutation test proving the
detector works. That is what stops it going quiet again, which is the failure that actually
happened.

**Consequences.** The product now has two outbound origins to explain instead of one: our
own relay, contacted only on Send, and the Tally form, opened by Chrome only after removal.
The Web Store answers do not change, because we collect and transfer nothing, but a reviewer
who greps the service worker will find the call, so the listing explains it unprompted.

The residual objection stands and is recorded: the form is hosted by a company we have no
relationship with, and moving it to our own domain would remove the third party entirely.
That is a follow-up, not a blocker, and it is the right shape for the next release.

## ADR-015: The theme settling ladder always runs all five steps

**Decision.** `SETTLE_DELAYS_MS` in [src/modules/theme.ts](src/modules/theme.ts) stays a
fixed ladder of five re-checks at 250ms, 750ms, 2s, 5s and 10s. It does not stop early.

**Context.** The v1.5.0 plan proposed cancelling the remaining timers once two consecutive
detections agreed. The appeal is tidiness, not performance: each step is one `matchMedia`
read and a class comparison, which is unmeasurable against a Gmail page load.

Against that, the whole reason the ladder exists is that Gmail's real background can arrive
very late. Two early detections agreeing proves only that Gmail had not repainted yet, which
is exactly the case where the 5s and 10s steps are the ones that do the work. Stopping early
would trade real robustness on a slow connection for an imaginary saving, and it would fail
in precisely the conditions that are hardest to reproduce and to report.

**Consequences.** A `system`-mode tab performs five cheap checks in its first ten seconds,
whether or not it needs them. The ladder is not the only source of truth in any case: the
attribute observer, the `<head>` stylesheet observer, `load` and `visibilitychange` all feed
the same `check()`, and `check()` is idempotent, so a redundant step costs a comparison and
nothing else. Recorded as a decision rather than an omission, and cross-referenced from the
constant so the next reader does not re-propose it.

## ADR-016: One marketing site, in its own repository, with the policy checked from CI

**Decision.** The marketing site lives only in
[PalWorks/Gmail-Labels-As-Tabs](https://github.com/PalWorks/Gmail-Labels-As-Tabs). The
`website/` folder and its deploy workflow are deleted from this repository and GitHub Pages
is disabled here. CI fetches the published privacy policy and fails if it stops describing
this code.

**Context.** The site was split out into its own repository on 2026-03-03, but the folder
left behind here kept its Pages workflow, so two sites served the same product from
`palworks.github.io/Gmail-Labels-As-Tabs` and `palworks.github.io/Gmail-Labels-Queries-As-Tabs`.

That is not untidiness, it is a compliance failure waiting to be noticed. Two privacy
policies existed. The Web Store listing named one, the extension's own Help button linked
to the other, and the policy that was correct for 1.5.0 was on the copy nobody pointed at,
while the one a reviewer would read still claimed the extension transmits nothing, months
after the feedback relay shipped. Preparing the 1.5.0 submission, the first attempt at a
fix updated the wrong copy, which is the clearest possible evidence that a human cannot be
expected to keep two of these straight.

Keeping the site separate was chosen over merging it back. The separate repository is
strictly ahead: SEO metadata, `robots.txt`, `sitemap.xml`, Search Console verification and
a `/contact` route, none of which exist in the copy here. It also keeps marketing edits out
of the Actions context that builds a security-sensitive artefact, and lets the site change
without touching a repository under store review.

Merging would have bought one real thing, which is a policy that cannot drift from the
code. That is bought here instead by a CI step that fetches the **published** page and
asserts it names every outbound host the extension can reach, every permission the manifest
declares, and the analytics the site itself runs, and that the bundle carries no API key.
Checking the deployed page is stronger than co-location, because what a reviewer reads is
the deployed page and not a file in a tree.

**Consequences.** The extension's own Help link had to move: it pointed at the site being
retired and would have 404'd for every installed user. It now opens `#/contact`, a real
route, rather than the `#/#contact` it used, which was not one.

CI depends on an external site being reachable. That is deliberate. If the privacy policy
cannot be produced, the release should not proceed.

The website deploys only on manual dispatch, so a change to the policy is not live until
someone runs it. That is stated in that repository's README beside the policy itself, and
in [PLAYBOOK.md](PLAYBOOK.md) as a numbered step in cutting a release, because "edited but
not deployed" is a worse state than "never edited".
