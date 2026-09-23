# Changelog

All notable changes to **Gmail Labels and Search Queries as Tabs** are documented here.
The format follows Keep a Changelog, and the project uses semantic versioning. Keep
`manifest.json` and `package.json` in sync with the version headings below.

## [1.7.0] - 2026-09-23

### Added

- **"Show as Tabs" in Gmail's own label menu.** Click the three dots beside any
  label in Gmail's sidebar and the menu now ends with "Show as Tabs", or
  "Remove from Tabs" if that label already has one. It works on sublabels the
  same way, and adds that label only: a tab for "Banking/ADCB Bank" shows what
  Gmail shows for that label, nothing more.

  A sublabel's tab is named after its leaf ("ADCB Bank"), because the bar is
  horizontal and width is the scarce resource, unless another tab already reads
  that, in which case it uses the full path, which is never ambiguous. Either
  way it can be renamed afterwards.

  The item hardcodes **no Gmail class name**. It finds Gmail's menu by its ARIA
  role, clones an ordinary item from it and changes the text, so it inherits
  Gmail's styling and a Gmail rename is not an event. See ADR-022.

  Verified end to end in a real Gmail on 2026-09-23: the item appears styled
  like its neighbours, adds `Banking/ADCB Bank` as a tab named "ADCB Bank",
  closes the menu, and on reopening offers to remove it again.

- **A row on the options page saying whether it is working.** Under Gmail
  integration: "Working", or which check gave up. Nothing is transmitted; there
  is a button that copies a short diagnostic if you want to send one. It exists
  because Gmail runs experiments, so a layout present for us can be absent for
  some users, and nothing we run locally would ever show that. See ADR-023.

- **A daily drift canary** (`scripts/canary/`), for the developer rather than
  the user. It opens a real Gmail label menu in a throwaway profile and checks
  the structure the feature depends on, escalating on the second consecutive
  failure. See [scripts/canary/README.md](scripts/canary/README.md).

### Changed

- The extension now waits up to ten seconds for Gmail to open a menu before
  giving up, because Gmail was measured taking 2.3 and 4.1 seconds on a cold
  profile. The first draft waited 1.5 seconds, which would have meant no item
  at all on a slow machine, and would have looked exactly like the feature not
  existing.

### Removed

- **InboxSDK, all 1.03 MB of it.** It was bundled to do two things, detect the
  signed-in address and notice Gmail route changes, and it did neither in any
  shipped build. `InboxSDK.load()` waits on a page world that is injected only
  with the `scripting` permission this extension has never declared, so the
  promise never settled. It never rejected either, which is why the failure was
  invisible apart from one console error per Gmail load.

  Both jobs were already done by code we own: the address by
  `extractEmailFromDOM()` and the one-second poller, routes by the body
  `MutationObserver` and `popstate`.

  Gone with it: the `APP_ID` constant, `loadInboxSDK()`, the service worker's
  background import, the `pageWorld.js` copy step and its
  `web_accessible_resources` entry, and the dev dependency. The content script
  falls from **1,103,251 bytes to 72,159**, a 93.5% reduction, and
  `dist/pageWorld.js` (583,907 bytes) is no longer shipped at all. Nothing a
  user can see changes. See ADR-021.

  One test changed meaning rather than disappearing. `content.test.ts` asserted
  that the SDK supplied the address when the DOM had none, and passed only
  because the mock resolved where production never did. It now drives the
  poller instead, which is the path that actually recovers a late address.

## [1.6.2] - 2026-09-22

### Fixed

- **A black bar appeared over Gmail for a moment before the real theme
  arrived.** Reported from a dark desktop reading a light Gmail: a black slab
  appears, settles to white, and only then fills with tabs.

  The bar is drawn before the theme is known, twice over. Injection and
  theming are independent, so `attemptInjection()` inserts the bar as soon as
  it finds a place to put it, which can be a third of a second before the
  stored theme has been read and a class put on `<body>`. And in "System" mode
  the theme can be applied and still be a guess, because Gmail paints its own
  background late and there is nothing to sample until it does. Both windows
  were painted from the `prefers-color-scheme` defaults, which on a dark
  desktop are black.

  The fix is not a faster guess. The bar now carries a background only when
  the theme is actually known; until then it has none, so what shows through
  is the Gmail already on screen, and the real colour fades in over 250ms when
  it arrives. The tabs keep their own colours throughout, so nothing is
  invisible except the slab behind them.

  Measured frame by frame under the reported configuration, with the desktop
  set to dark and Gmail light: before, `rgb(32, 33, 36)` for 318ms with no
  tabs on screen; after, transparent throughout the same window and not one
  dark frame.

  The state cannot get stuck: the settle ladder commits the guess if Gmail's
  background is never readable, because a bar that stays invisible looks broken
  where a bar of the wrong colour merely looks wrong.

- **The options page did the same thing, in its own way.** A black page, then
  the elements, then the real theme. Two causes, both of them the page
  painting before it knew anything: `options.css` uses dark as its base theme,
  so the stylesheet's own default is a dark page; and the theme lives in
  `chrome.storage.local`, which cannot be read without yielding, so there is
  always a window between "HTML parsed" and "storage answered".

  Extension pages now carry a synchronous boot script as the first thing
  inside `<body>`, which stamps the theme this browser last painted before any
  content is parsed. The last painted theme is kept in `localStorage`, the
  only storage a page can read without yielding, shared across the options
  page, the toolbar menu and the welcome page. A first-ever load has nothing
  to read and opens light, which is not a guess about the user: it is the
  value `getGlobalTheme()` returns when nothing is stored.

  Measured on the options page: before, `rgb(26, 26, 46)` for 166ms with the
  cards already on screen; after, the correct theme on the first frame, and a
  user who has chosen Dark opens dark rather than flashing light on the way.

  The cache is only ever a first frame. `chrome.storage` still decides, a few
  milliseconds later, and corrects it if the theme was changed from inside
  Gmail, which lives on another origin and cannot write this cache.

- **A guessed theme was published to the extension's other pages as though it
  were Gmail's.** `detectedGmailTheme` is how the toolbar menu and the welcome
  page learn what Gmail looks like when they have no Gmail DOM of their own.
  It was being written with the desktop's preference whenever Gmail could not
  be read, which is precisely the case those pages needed to be told about.
  Only real readings are published now; an absent key already means "fall back
  to the OS".

### Store listing and assets

Nothing in this section ships inside the package; it is what goes to the Web
Store alongside it.

- **A sixth screenshot: the tour, open over a real inbox**, with the real tab
  bar in frame above the panel. Captured from the running product by sending
  the content script the same `SHOW_ONBOARDING` message the toolbar menu
  sends, so it cannot drift from what a slide actually looks like.
- **All six screenshots re-shot** against this build, so the options page they
  show carries the tour entry point added in 1.6.0.
- **The colour screenshot had never had a colour picker in it.** The palette
  opens beside its row, low in the tab list, and the fixed crop cut it off, so
  the one asset about colour showed the Theme and Add Tab cards instead. The
  capture now centres the row before clicking and throws if the palette is
  outside the frame. A generated asset nobody looks at twice can be wrong for
  as long as nothing checks it.
- **The listing is rewritten for how it is read now**: a questions block whose
  answers open with Yes or No and stand alone, because answer engines lift a
  sentence rather than a page, and a record of which search term sits where so
  a later edit does not quietly undo the placement. See STORE_LISTING.md.
- The listing claimed the website had no `/contact` route and pointed its
  Support URL at the homepage. The route exists, is deployed, and is what the
  extension's own help button already opens.
- `scripts/store-assets/build.mjs` documents how to shoot from a throwaway
  copy of a signed-in profile, headless, rather than taking over the browser
  somebody is using, and that Chrome 137 and later ignore `--load-extension`.

### The website

- **The marketing site now runs this extension's own tour**, vendored from
  this repository rather than re-created, so a visitor who plays it and then
  installs sees exactly what they were shown.
- Its FAQ matches the listing's questions word for word, and its `FAQPage`
  markup moved from the React component into the served HTML, where a crawler
  that does not execute JavaScript can actually read it.
- `SoftwareApplication` markup now names the shipping product and version,
  and `llms.txt` was added.

## [1.6.1] - 2026-09-22

### Fixed

- **The theme chooser followed your operating system instead of Gmail.** With a
  dark desktop and a light Gmail, picking "System" turned the onboarding tour
  dark over a light inbox. Gmail's theme is an account setting, so the desktop
  says nothing about the inbox the tab bar has to blend into — the extension has
  always resolved "System" from Gmail's own rendered theme, and the wizard added
  in 1.6.0 was the one place that asked the OS instead.
- **The same mistake in three more places**, found by auditing rather than
  reported: the welcome page handed "System" to a CSS media query; the toolbar
  menu followed the OS while everything else followed Gmail; and the tab bar was
  drawn one frame before its theme was applied, so a dark desktop flashed a dark
  bar over a light Gmail.
- A guard now fails any module that reads `prefers-color-scheme` without also
  consulting Gmail's theme, and each surface has a test for the configuration
  where the two disagree. Twenty theme assertions existed before this; every one
  set an explicit Light or Dark, so none of them could have caught it. See
  ADR-019.

## [1.6.0] - 2026-09-22

Onboarding, rebuilt. The old welcome page listed three things the extension
does; this one shows them.

### Added

- **A tour that demonstrates rather than describes.** Six slides, each pairing a
  sentence with a working miniature of the tab bar directly above it: labels
  rising out of the sidebar, a search being saved as a tab, unread counts
  filling in, a tab being dragged, the Apps Script a cleanup rule generates, and
  a theme chooser. An earlier draft animated the real Gmail page behind a dimmed
  scrim, which asked the reader to look in one place and watch in another, and
  then dimmed the half they were meant to watch. See ADR-018.
- **It runs over Gmail.** The tour opens as a modal on the Gmail page whenever
  there is one, which buys something the old page could not: picking a theme on
  the last slide retints the user's real tab bar, behind the panel, as they
  choose. The standalone page is now the fallback for a browser with no Gmail
  open, and it mounts the same wizard rather than a second copy of the copy.
- **Four ways in, not one.** The tour was previously reachable exactly once, on
  install, so anyone who dismissed it had no route back. It is now also in the
  toolbar menu, on the options page under Settings, and reachable by message.
- **A menu behind the toolbar icon.** Configure tabs, Show me around, All
  settings, Help & support. Outside Gmail, "Configure tabs" says it will open
  Gmail first rather than silently doing nothing, which is what clicking the
  icon did anywhere but Gmail before.
- **Contrast cover for the wizard's palette.** It carries its own tokens so it
  can render in two hosts, and nothing else reads them, so nothing else would
  have noticed them drifting. Both themes are now checked.

### Changed

- **Clicking the toolbar icon opens the menu instead of toggling the settings
  modal.** That costs the most common action one extra click, which is why
  "Configure tabs" is the first and largest entry. It buys a home for the tour
  and for help, and it makes the icon do something useful on a non-Gmail tab.
- **The welcome page is now a thin host.** Its three step-cards and its own
  theme radios are gone; everything explanatory lives in the shared wizard.

### Fixed

- **A theme chosen before the wizard finished reading storage was silently
  reverted.** The initial read resolves while the wizard is already
  interactive, and its result overwrote the user's choice a moment later — the
  value saved, the wrong card pressed. Found by a test, not by a person.
- **First-run onboarding no longer races the content script.** On install the
  worker cannot message an open Gmail tab, because that tab is running no
  content script until it reloads. It leaves a flag that the freshly injected
  script consumes, and the flag is cleared as it is read, so the tour opens in
  one tab rather than in all four of someone's Gmail tabs.

## [1.5.0] - 2026-09-21

Mostly a hardening release: correctness, safety, and the guards that stop each defect
coming back. One small addition, in the modal people actually use.

### Added

- **A way to reach the full settings page from the in-Gmail modal's header.** Configure
  Tabs only offers what fits in an overlay; automation rules, the privacy page, the user
  guide and logs live on the options page. The route there existed, as a "Manage all
  accounts" link in the footer, but it sat below the fold of a tall modal and read as an
  account control rather than a way out to everything the modal does not show. There is
  now an icon in the header, beside the close button, labelled and tooltipped for what it
  actually does ([src/modules/modals/settingsModal.ts](src/modules/modals/settingsModal.ts)).

### Fixed

- **"Manage all accounts" never worked.** From v1.2.1 until now, the link in the settings
  modal's footer did nothing at all: it called
  `window.open(chrome.runtime.getURL('options.html'))` from the content script, and Chrome
  refuses that with `ERR_BLOCKED_BY_CLIENT`, because the navigation's initiator is
  `mail.google.com` and `options.html` is not in `web_accessible_resources`. Every test
  mocked `window.open`, so the suite proved only that the right URL was computed. Both
  routes to the options page now ask the service worker, which has no such restriction and
  focuses an already-open options tab instead of piling up duplicates. `options.html` was
  deliberately **not** added to `web_accessible_resources`: that would fix the symptom by
  letting any script on the Gmail page reach the settings UI.
- **An extension update silently killed the settings modal in every open Gmail tab.**
  Chrome does not reload a page when it updates the extension running in it, so the content
  script keeps running, the modal still opens and every button still clicks, while each
  `chrome.*` call throws "Extension context invalidated." Nothing saved and nothing said.
  Gmail tabs stay open for days, so this happens in the wild, not only in development. The
  modal now detects an orphaned script and offers the only thing that helps: a short
  explanation, a reminder that tabs, rules and settings are untouched, and a Reload button
  ([src/modules/extensionContext.ts](src/modules/extensionContext.ts)).
  The check runs when the modal opens, which covers coming back to a tab left open
  overnight, and again on every action inside it, which covers the update landing while the
  modal is already on screen. Before that second guard, clicking Dark in an orphaned modal
  changed nothing and said nothing. A failure that is *not* a dead context is logged rather
  than dressed up as one: telling someone to reload when reloading will not help is worse
  than saying nothing.
- **Twenty-five more dropped promises, found by turning the compiler on the problem.**
  The four silent failures above are one bug wearing four coats: a promise rejected, no
  handler existed, and the only trace was a console line in a tab nobody had open.
  Enabling `@typescript-eslint/no-floating-promises` and `no-misused-promises` as
  type-aware errors over `src/` found twenty-five more, in the service worker, the
  options page, the welcome page, the content script, the tab bar and two modals. The
  ones a user could hit:
  - **Uninstall, in an orphaned tab, removed its own dialog and uninstalled nothing** —
    indistinguishable from an uninstall that worked. It now checks first, leaves the
    dialog up, and shows the same reload notice as the settings modal.
  - **Delete and reorder in the managed tab list reported nothing when the write
    failed.** The row stayed exactly where it was, which reads as a broken button. Both
    are `async` handlers assigned to a callback the renderer types as `() => void`, so
    nothing was ever going to await them. They now report: the reload notice in Gmail, a
    message on the options page.
  - **The service worker answered `ok: true` for an options page that never opened.** The
    handler's `try`/`catch` could not see the failure, because MV3 rejects rather than
    throws. It is asynchronous now and reports what actually happened.
  - **A failed theme write on the welcome page left the radio button showing a choice
    that had not been saved.**
  - `chrome.storage` cleanup in two places sat inside a `try`/`catch` whose comment
    claimed to handle a dead context, and never could, for the same reason.

  Fire-and-forget calls now say so at the call site through `catchChromeError` or
  `ignoreChromeError`. A guard asserts the lint rules stay enabled, type-aware, and set
  to `error` rather than `warn` — `npm run lint` tolerates warnings, so a downgrade would
  have retired the check without failing anything. See ADR-017.
- **The help control in the modal footer was a `<div>`**, so it was unreachable by keyboard
  and announced as nothing: its icon is an `<svg>` with no text and its only description
  was a `title` attribute. It is a `<button>` with an `aria-label` now, as is the new header
  icon, and both hide their glyph from the accessibility tree. A test asserts that every
  icon-only control in this modal is a focusable, labelled button, so the next one cannot
  ship as a div.

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

### Disclosed

- **The uninstall URL.** Uninstalling opens a third-party feedback form, and until now that
  was disclosed nowhere: not in SECURITY.md, not on the privacy page, not in the store
  listing, and not in the Web Store data declaration. It is kept, because uninstall is the
  one moment the in-product form cannot reach, and it is now stated in all four places. The
  link carries no address, no settings and no identifier. A guard fails the build if the
  service worker names an outbound host that any of those documents omits. See ADR-014.

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
- A guard that fails the build if the service worker names an outbound host that is missing
  from SECURITY.md, the in-extension privacy page or STORE_LISTING.md. The uninstall URL went
  four versions undisclosed; a promise not to repeat that is worth less than a failing test
  ([test/repoConsistency.test.ts](test/repoConsistency.test.ts)).
- A guard that fails when anything bundled into the content script names a
  `chrome.runtime.getURL` resource that is not in `web_accessible_resources`. Chrome blocks
  those navigations silently, which is how the options-page link stayed broken for three
  releases ([test/repoConsistency.test.ts](test/repoConsistency.test.ts)).
- A guard that fails when live documents disagree about how many tests there are. Four of them
  stated four different totals within this release, each correct when written.
- Guards on the marketing-site links: nothing here may link to the retired Pages address,
  the extension's help button must name a route that exists, the listing must name the live
  site, and a `website/` folder may not reappear in this repository.

### Changed (documentation)

- Every live document was swept against the shipped code on 2026-09-21. Corrections worth
  naming, because each was a statement a reader would have acted on: ARCHITECTURE said the
  extension sets no uninstall URL; AUDIT said the uninstall URL was gone; AGENTS rule 1
  said there was exactly one permitted outbound call; PLAYBOOK said pushes and PRs run CI
  and the website deploys from here; three documents still described a `deploy_website.yml`
  and a `website/` folder that no longer exist; DOMAIN and PROJECT described InboxSDK as a
  fallback rather than as inert; and the worker README called its relay the only origin the
  extension contacts.
- AGENTS gains three hard constraints: ship only what the manifest declares, do not
  re-create a `website/` folder, and every workflow is manually dispatched.
- PLAYBOOK's release procedure gains a numbered step to update and **deploy** the published
  privacy policy in the other repository before uploading anything, and its guard-failure
  table now covers all eight failure modes.

### Changed (the marketing site moved out, and one link had to move with it)

- **The duplicate website is gone.** The site was split into
  [PalWorks/Gmail-Labels-As-Tabs](https://github.com/PalWorks/Gmail-Labels-As-Tabs) in
  March 2026, but the `website/` folder left behind here kept deploying a second copy to
  GitHub Pages. Two privacy policies existed and drifted: the store listing named one, the
  extension's own help button linked to the other, and the one that was correct for 1.5.0
  was on the copy nobody pointed at. The folder and its deploy workflow are deleted and
  Pages is disabled on this repository, so exactly one policy exists.
- **The in-Gmail Help button pointed at the site being retired**, and would have started
  404ing for every installed user. It now opens
  `https://palworks.github.io/Gmail-Labels-As-Tabs/#/contact`, which is a real route; the
  old link used `#/#contact`, which is not one and silently fell back to the homepage.
- **CI now fetches the published privacy policy** and fails if it does not name every
  outbound host the extension can reach, every permission the manifest asks for, or the
  analytics the site itself runs, or if the site bundle contains an API key. The policy
  lives in another repository and deploys by hand, so nothing else can keep it honest.
- Both repositories now build only on manual dispatch. A guard fails the build if a
  `push:` trigger reappears in any workflow here.

### Changed (website and store assets)

- The public privacy policy was rewritten. It had not been touched since before the feedback
  form shipped: it claimed nothing was ever transmitted, listed two of the four permissions,
  and mentioned neither the feedback relay nor the uninstall page. It now states the storage
  model, both outbound paths in full, every permission, the Apps Script boundary, and the
  fact that the marketing site itself uses analytics while the extension does not
  (now in [PalWorks/Gmail-Labels-As-Tabs](https://github.com/PalWorks/Gmail-Labels-As-Tabs)).
- The public changelog covered v1.0.0 only. It now runs through 1.5.0
  (same repository).
- Store screenshots regenerated against the shipping build, and the privacy caption no longer
  says nothing leaves the browser unless you press Send Feedback, which stopped being true
  the moment the uninstall URL came back.

### Removed (package)

- **Two promo tiles that were shipping inside the extension.** `Marquee Promo Tile.png` and
  `Small Promo Tile.png` sat in `src/icons/`, which `copy-assets` copied wholesale, so every
  user downloaded 398 KB of store graphics the manifest never names and no page loads. They
  are also the superseded AI mockups that `store-assets/README.md` records as replaced. The
  package drops from 898,996 to about 500,100 bytes, 44% smaller, with no change to behaviour. A
  new CI step fails the build if `dist/icons/` gains a file the manifest does not declare.

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
