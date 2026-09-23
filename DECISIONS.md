# DECISIONS.md

Architecture Decision Records (ADRs). Each entry captures a durable choice, its context,
and its consequences so agents do not undo deliberate decisions.

Last updated: 2026-09-23 (v1.7.0)

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

## ADR-017: Unhandled promise rejections are a build failure

**Decision.** Enable `@typescript-eslint/no-floating-promises` and `no-misused-promises`
as **errors** over `src/`, with type-aware linting turned on for that override in
[.eslintrc.json](.eslintrc.json). Every `chrome.*` call that is genuinely
fire-and-forget states so at the call site through `catchChromeError` or
`ignoreChromeError` in [src/modules/extensionContext.ts](src/modules/extensionContext.ts).

**Context.** Four user-visible bugs were fixed in the run-up to 1.5.0. They read as four
unrelated defects and were found weeks apart by a person clicking things:

| Symptom | Actual cause |
|---|---|
| "Manage all accounts" did nothing, since v1.2.1 | A blocked navigation whose rejection nobody held |
| A theme click in an old tab did nothing | A rejected storage write in an orphaned context |
| Uninstall closed its dialog and did not uninstall | `sendMessage` into a dead context, promise dropped |
| The options page never opened from Gmail | The same, one layer down |

They are one bug. A promise rejected, no handler existed, and the only trace was a console
entry in a tab nobody had open. The common repair — add a `.catch` where the bug was
reported — fixes the instance and leaves the class, which is why the same defect kept
arriving wearing different clothes.

Turning the rule on found **25 more** in a single pass, across the service worker, the
options page, the welcome page, the content script and two modals. That ratio is the
argument: manual review had caught four in four months, and the compiler caught
twenty-five in one command.

`no-misused-promises` is included because three of the twenty-five were not floating at
all. They were `async` functions assigned to a callback the renderer types as
`() => void`: delete and reorder in the managed tab list, where a rejected storage write
left the row on screen with nothing said.

**Consequences.** Linting `src/` now needs type information, so `npm run lint` is slower.
That cost is paid once per run and bounded; the alternative was paying it per release in
user-reported silent failures.

A rule that reports nothing is indistinguishable from a rule that is absent, so
[test/repoConsistency.test.ts](test/repoConsistency.test.ts) asserts the override still
exists, still carries `parserOptions.project`, and is still set to `error` rather than
`warn` — `npm run lint` is gated on zero **errors** and tolerates warnings, so a
downgrade would have retired the guard without failing anything.

Three call sites are marked `void` with a comment, not given a handler, because the
function already reports its own failure to the user: `loadInboxSDK`, `loadSettings` and
`applyTemplate`. `void` here means "audited", not "ignored".

The linter cannot see two shapes, so they were fixed by hand and are called out in the
code: an `async` callback passed to `setInterval` (the account poller in
[src/content.ts](src/content.ts)), which has nowhere to reject to, and a `.then()` chain
whose rejection is handled by its eventual caller rather than in place.

## ADR-018: Onboarding demonstrates inside the panel, over Gmail

**Decision.** One wizard module
([src/modules/onboarding/wizardView.ts](src/modules/onboarding/wizardView.ts))
renders both onboarding surfaces. It carries a working miniature of the tab bar
*inside* the panel, above the narration. It is shown as a modal over Gmail
whenever a Gmail tab exists, and as the standalone welcome page when none does.
The toolbar icon gains a popup menu so the tour has somewhere to live after
install.

**Context.** The old welcome page was a separate tab listing three things the
extension does, in prose, next to three numbered cards. It made two bets that
both lost: that a new user reads, and that they will still remember in Gmail
what they read on another tab.

The first attempt at fixing it animated the real Gmail page **behind** a dimmed
modal, so the wizard narrated while the product demonstrated. On paper that is
the strongest possible demo. In practice it splits attention across two places
and then dims the half the reader is meant to watch, so whether the point lands
depends on whether they happen to be looking at the right moment. The product
owner spotted it immediately on the first preview. Moving the demonstration
inside the panel is the correction: it sits a few lines under the sentence
describing it, at full contrast, and there is nowhere else to look.

Every slide also carries a caption naming what the miniature is doing. That is
not decoration. It is the fallback for every case where motion does not land —
the reader skipped ahead, the tab was in the background, or
`prefers-reduced-motion` switched the animation off entirely. Motion may
reinforce a message; it may never be the only thing carrying one.

**Over Gmail** rather than in a tab, because it buys one thing a separate page
cannot: choosing a theme on the last slide retints the user's real tab bar while
they watch, since the write goes through `setGlobalTheme` and every open Gmail
tab already listens on that key. The standalone page survives as the fallback,
and mounts the same wizard — a second copy of the copy, the choreography and the
chooser would have drifted within a release.

**Consequences.** The toolbar icon now opens a menu instead of toggling the
settings modal. That costs the most common action one extra click, which is why
Configure tabs is first and largest. It buys a home for the tour, for help, and
for an icon that does something useful on a non-Gmail tab; previously clicking
it anywhere but Gmail did nothing at all.

`chrome.action.onClicked` never fires once `default_popup` is set, so that
listener was deleted rather than left as code that cannot run.

On install the worker cannot message an open Gmail tab: until it reloads, that
tab is running no content script and the message reaches nothing. It sets a flag
in `chrome.storage.local` and reloads those tabs — which is what makes the tab
bar appear at all — and the freshly injected script consumes the flag. The flag
is cleared as it is read, so the tour opens in one tab rather than in every
Gmail tab the user has open.

The wizard declares its own colour tokens rather than inheriting toolbar.css,
because the welcome page never loads toolbar.css and a wizard that looked right
in only one of its two homes would be worse than no sharing at all. That
independence is why it needed its own contrast test: nothing else reads those
tokens, so nothing else would notice them drifting.

Onboarding copy is structured data, not HTML strings, so every segment renders
through `textContent`. No onboarding copy can reach `innerHTML`, which keeps the
whole feature outside the blast radius of
[test/htmlSinks.test.ts](test/htmlSinks.test.ts) rather than inside it with an
exemption.

Message names moved to [src/modules/messages.ts](src/modules/messages.ts), a
leaf module with no imports. `OPEN_OPTIONS_PAGE_ACTION` had lived in
`settingsModal.ts`; importing it into the popup would have pulled the settings
modal, the tab manager and the import and uninstall modals into a page that
renders four buttons. A message name is a contract between two bundles, and
keeping it in a leaf is what stops the contract dragging an implementation with
it. The popup bundle is 1 KB.

## ADR-019: Every surface resolves 'system' through Gmail, and a guard says so

**Decision.** No module may decide what 'system' means by asking
`prefers-color-scheme` alone. Each surface resolves it from Gmail's own theme
and falls back to the OS only when Gmail's theme is unknown:

| Surface | How it learns Gmail's theme |
|---|---|
| Tab bar and in-Gmail modals | `resolveSystemTheme()` — samples the live Gmail DOM |
| Onboarding wizard | Asks its host, which is one of the two below |
| Options page, welcome page, toolbar menu | `detectedGmailTheme` in `chrome.storage.local`, published by any content script |

[test/repoConsistency.test.ts](test/repoConsistency.test.ts) fails any `src/`
module that reads `prefers-color-scheme` without also naming a Gmail theme
source.

**Context.** The rule itself is not new. It is stated at the top of
[src/modules/theme.ts](src/modules/theme.ts) and is the reason that module
exists: Gmail's theme is an account setting, so a user on a dark desktop can be
reading a light Gmail, and matching the OS there makes the tab bar stand out
instead of blending in — the one thing it must not do.

The onboarding wizard shipped in 1.6.0 broke it in a single line. It called
`window.matchMedia('(prefers-color-scheme: dark)')` directly, so on the
reporter's machine — dark desktop, light Gmail, 'system' selected — it rendered
itself dark over a light inbox, inside a modal sitting on that inbox.

Nothing caught it, and the reason is worth recording. There were twenty theme
assertions across the suite, and every one of them set an explicit 'light' or
'dark'. Not one exercised 'system' on a machine where the two sources disagree,
which is the only configuration in which the bug is visible. A hundred tests of
the two easy cases say nothing about the third.

**Consequences.** `WizardHost.resolveSystem()` is **required**, not optional.
Making it optional with an OS default would have reintroduced the bug for the
next host by silence; requiring it meant the compiler named both existing hosts
the moment the interface changed.

The wizard re-resolves on every slide change rather than caching the value from
when it opened. Gmail paints its real background well after injection and the
user can switch Gmail's theme without reloading, so a value read once is a
value that can be wrong a second later. See ADR-015.

Three further places were corrected in the same pass, all the same mistake:

- The welcome page removed `data-theme` for 'system' and let welcome.css's
  `prefers-color-scheme` block decide, which is the OS. It now stamps the
  resolved value, and that block is the pre-JavaScript default only.
- The toolbar menu followed the OS. It is browser chrome, so that looked
  defensible, but a dark menu hanging off an otherwise light extension is the
  mismatch the theme setting exists to prevent.
- `finalizeInit` rendered the tab bar *before* applying the theme, so until
  `force-light` landed the bar fell back to toolbar.css's own media query — a
  one-frame dark flash for exactly this user.

The guard strips comments before scanning. Its first version failed on the
comment in `content.ts` that explains the fix above, which mentions
`prefers-color-scheme` by name: the same self-matching mistake the dead-CSS
probe made in 1.5.0.

What the guard does **not** prove is that Gmail is consulted *first*. A file
could name both and still get the order wrong. Ordering is covered by unit
tests per surface instead, each asserting the reporter's configuration: OS dark,
Gmail light, 'system' selected, result light.


## ADR-020: An unknown theme is drawn as nothing, and a page opens in what it last painted

**Date:** 2026-09-22
**Status:** Accepted
**Context:** v1.6.2

Two reports, a day apart, of the same shape. The tab bar appeared over Gmail as
a black slab, settled to the real theme, and only then filled with tabs. The
options page opened black, drew its elements, and then turned light.

Neither was a wrong final state. Both were a surface painting a colour before
it had any right to one, and then contradicting itself in front of the user.

There are three windows where that can happen, and they have different causes:

1. **Injection runs ahead of theming.** `attemptInjection()` inserts the tab bar
   the moment it finds somewhere to put it; `finalizeInit()` reads the stored
   theme on its own schedule. Measured on a real Gmail load: 318ms with no
   theme class on `<body>` at all.
2. **'System' can be applied and still be a guess.** Gmail paints its own
   background late, so `detectGmailTheme()` returns null at first and the only
   answer available is the OS preference — which ADR-019 exists because it is
   so often wrong.
3. **Every `chrome.storage` read yields.** An extension page must paint
   something between "HTML parsed" and "storage answered", and painted its
   stylesheet's default. For the options page, whose base tokens are dark, that
   default is a black page.

### Decision

**Where the surface sits on top of something else, draw nothing.** The tab bar
has a background only when the theme is known: transparent before that, so what
shows through is the Gmail already on screen, with a 250ms fade when the real
colour arrives. A guessed 'system' resolution is marked `theme-unresolved` and
keeps the bar transparent even though a class has been applied.

**Where the surface is the whole page, open in what this browser last painted.**
`localStorage` is the only storage a page can read without yielding, so
[src/themeBoot.ts](src/themeBoot.ts) reads a cached resolved theme and stamps it
as the first thing inside `<body>`, before any content is parsed.

**With nothing cached, open light.** Not the OS. `getGlobalTheme()` returns
`light` when nothing is stored, so light is what the extension is actually set
to; asking `prefers-color-scheme` there would be ADR-019's bug in the one place
that has no chance to correct itself before the user sees it.

### Consequences

Transparency cannot get stuck. `watchGmailTheme` tracks whether Gmail's
background was ever readable and commits the guess when the settle ladder runs
out, because a bar that stays invisible looks broken where a bar of the wrong
colour merely looks wrong.

The cache can go stale in exactly one way: the theme changed from the in-Gmail
modal, which is another origin and cannot write it. One frame, then corrected.

A guessed theme is no longer published as `detectedGmailTheme`. That key is how
the toolbar menu and the welcome page learn what Gmail looks like when they
have no Gmail DOM of their own, and they were being handed the desktop's
preference labelled as Gmail's, in exactly the case they needed telling about.
An absent key already meant "fall back to the OS".

### Alternatives considered

**Paint the guess faster.** A synchronous `chrome.storage` read does not exist,
and a faster wrong colour is still a wrong colour.

**Hide the page until themed** (`visibility: hidden` until a class lands). It
trades a flash for a blank page, and a blank page that never resolves is a
worse failure than a wrong colour. Rejected for the same reason the ladder
commits its guess.

**Invert the options page stylesheet so light is the base.** It would fix the
common case and break the dark one, and it means rewriting every
`body.theme-light` override in an 1,100-line file to no benefit a cache does not
already give.

### What is guarded

The position of the boot script, not its presence: the same script deferred, at
the foot of the page, or folded into the page's own bundle fixes nothing and
looks identical in review. `test/repoConsistency.test.ts` fails if it is not the
first thing inside `<body>` on any extension page, and the check is mutation
tested against a page that loads it late.

What no guard can prove is the absence of a flash, which is a frame rather than
a value. That was verified by sampling the computed background on every
animation frame, before and after, in the reported configuration: 4 dark frames
before and 0 after on the tab bar, 2 and 0 on the options page.

## ADR-021: No third-party library runs inside the user's mailbox

**Date:** 2026-09-23
**Status:** Accepted
**Context:** after v1.6.2

`@inboxsdk/core` was 1.03 MB of a 1.09 MB content script and had never executed
a single line of its own API in a shipped build. Its page world is injected
only with the `scripting` permission, which this extension does not declare, so
`InboxSDK.load()` never settled and never rejected. That combination is the
worst one available: no feature, no error, no way to notice.

The question deferred for four releases was whether we would eventually want it.
Two pieces of evidence closed it.

First, an inventory of what a real user of the SDK gets. A competitor's shipped
build calls `ButterBar`, `Widgets.showModalView`, `Router.handleAllRoutes`,
`Router.goto`, `Toolbars.addToolbarButtonForApp` and `User.getEmailAddress`.
Every one of those except ButterBar we already do by hand, tested, in code we
own.

Second, and decisive: **InboxSDK does not solve Gmail's obfuscated class names.
It hardcodes them.** `inboxsdk.js` in `node_modules` carries `.dw .nH > .nH >
.no`, `T-I J-J5-Ji ztGYyc T-I-atl L3` and `pM aRw` as literal strings. What the
megabyte buys is not a technique, it is someone else maintaining a selector list
and shipping updates when Gmail changes. Verified separately that Gmail's class
names are identical across installations and vary only by Gmail build, so that
list is a maintenance contract, not a capability.

### Decision

Remove it, and treat "no third-party code in the content script" as a property
worth keeping rather than an accident.

### Consequences

- The content script is 72,159 bytes. `dist/pageWorld.js`, 583,907 bytes, is no
  longer built or shipped.
- `api.inboxsdk.com/api/v2/errors` and `register.inboxsdk.com` are no longer
  present in any shipped file. They were never contacted, verified over a
  25-second Gmail load, but their presence in a package whose listing says
  nothing leaves the browser was a disclosure risk we no longer carry.
- We own the Gmail DOM coupling outright. That is the real cost, and it is the
  reason the next piece of work is a drift canary rather than a feature.
- If Gmail notifications ever become worth having, the answer is our own strip,
  not a megabyte of someone else's.

## ADR-022: Read Gmail's class names, never write them

**Date:** 2026-09-23
**Status:** Accepted
**Context:** v1.7.0

Adding an item to Gmail's own label menu means depending on Gmail's markup,
which is obfuscated and changes when Gmail ships a build.

The first thing established was what actually varies. Gmail's class names are
**not** randomised per installation: on 2026-09-23, two independent Chrome
installations with different `--user-data-dir` values and different Chrome patch
builds produced byte-identical strings (`J-M J-M-ayU aka`, `J-N`, `J-N-Jz`,
`J-Kh`, `pM aj0`) and identical element counts. A competitor's shipped bundle
hardcodes the same strings, unchanged between its May and July 2026 builds, and
one of its selectors has since rotted for everybody at once.

So the risk is not that a hardcoded selector is wrong for some users. It is that
it is right until the day it is wrong for all of them.

### Decision

`src/modules/labelMenu.ts` hardcodes no Gmail class name. It finds the menu by
`[role="menu"]`, finds an ordinary item by `[role="menuitem"]` without
`aria-haspopup`, clones that item and replaces its text. The clone inherits
whatever Gmail calls it that day. The label name comes from
`[data-label-name]`, with `data-tooltip` and a `#label/` href as fallbacks.

`src/utils/selectors.ts` keeps the five class names the tab bar still needs, in
one place, deliberately.

A guard in `test/repoConsistency.test.ts` enforces the split: an obfuscated-looking
class in a selector anywhere else in `src/` fails the build.

### Consequences

- A Gmail rename is not an event for this feature.
- The item is styled by Gmail, so it cannot drift away from the menu around it.
  We ship no CSS for it at all.
- The guard is the load-bearing part. This design erodes silently: one `J-N`
  pasted into a selector at 11pm makes a bug go away and leaves no diff that
  looks wrong.
- What we still depend on is structural, and is watched daily by the canary in
  ADR-023: ARIA roles on the menu and its items, and a readable label name.

## ADR-023: Watch the drift, and let the users we cannot see report it

**Date:** 2026-09-23
**Status:** Accepted
**Context:** v1.7.0

ADR-022 removes the class-name risk but not the structural one. Two things were
built before the feature, deliberately, because both are useful even if the
feature is cancelled.

**A drift canary** (`scripts/canary/`) clones the signed-in profile's cookies,
runs headless Chrome on a private port, loads the built extension through CDP
`Extensions.loadUnpacked`, opens a real label menu and asserts the contract. It
runs daily as a systemd user timer and escalates on the **second** consecutive
failure, with a desktop notification and a deduplicated GitHub issue.

Three of its design choices came from being wrong first:

- **SKIPPED is not FAIL.** A canary that cries wolf when a cookie expires is
  ignored inside a fortnight.
- **A failing run never overwrites `fingerprint.json`.** The first version did,
  destroying the baseline needed to diagnose the failure it had just reported.
- **It clicks once and waits, rather than retrying quickly.** Measured: a loop
  clicking every 2.3 seconds for 152 seconds never opened the menu, while a
  single click with a 12-second window opened it in 4.1 seconds on the same
  profile. The second click lands while Gmail is still opening the menu and
  cancels it.

**A local health signal** covers what the canary cannot: one account, one Gmail
build, one A/B bucket, one machine that has to be on. The content script records
whether its last attempt worked; the options page shows one row and a button
that copies a short diagnostic. Nothing is transmitted, on any schedule or
trigger, and the diagnostic carries no address, label name or tab title.

### Consequences

- No new permission and no new outbound host, so the published privacy policy
  and the store listing's data-usage answers are unchanged.
- The canary's git history becomes the dataset nobody had: how often this
  actually drifts. `fingerprint.json` is rewritten only when something it
  records moves.
- It is coupled to one developer machine being switched on. That is accepted:
  the alternative is Gmail credentials in CI, which is not acceptable.
