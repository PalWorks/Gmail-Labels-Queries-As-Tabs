# PLAYBOOK.md

Operational procedures for **Gmail Labels and Search Queries as Tabs**. Step-by-step
recipes for building, testing, releasing, rolling back, and troubleshooting.

Last updated: 2026-09-23 (v1.7.0)

## Local setup

```
npm install
npm run build
```

Then load the unpacked extension in Chrome:

1. Open `chrome://extensions`.
2. Enable Developer mode (top right).
3. Click Load unpacked and select the `dist/` folder.
4. Open or reload `https://mail.google.com` to see the tab bar inject.

Use `npm run watch` to rebuild on change; click the reload icon on the extension card in
`chrome://extensions` after each rebuild.

## Verification gate (run before any commit or release)

```
npx tsc --noEmit          # 0 errors
npx jest                  # all suites pass
npx jest --runInBand      # passes serially too
npx jest --coverage       # meets thresholds
npm run lint              # 0 errors
npm run build             # succeeds; then confirm no console.log in dist/js
```

Confirm `manifest.json` and `package.json` carry the same version.

## Implement a feature

1. Branch off `main`.
2. Read [AGENTS.md](AGENTS.md) and the relevant entries in [DECISIONS.md](DECISIONS.md).
3. Make the change; reuse [src/modules/tabManager.ts](src/modules/tabManager.ts) and the
   state accessors rather than duplicating logic.
4. Add or update the mirrored test under [test/](test/).
5. Update docs: [CHANGELOG.md](CHANGELOG.md) always, plus README/DATA_MODEL/DECISIONS as
   applicable.
6. Run the verification gate.
7. Commit with a Conventional Commit message and open a PR.

## Cut a release

1. Decide the new version. Bump it in **both** `manifest.json` and `package.json`.
2. Move the Unreleased notes in [CHANGELOG.md](CHANGELOG.md) under the new version and date.
3. Run the full verification gate.
4. Build the store package:
   ```
   npm run package        # produces extension.zip from a clean build
   ```
5. Re-read [STORE_LISTING.md](STORE_LISTING.md) and update the release notes, the version
   line and the pre-submission checklist. If permissions or outbound requests changed, the
   data-usage answers in the dashboard must change with them.
6. **Update the published privacy policy, in the other repository, and deploy it**, before
   uploading anything. It is at `pages/Privacy.tsx` in
   [PalWorks/Gmail-Labels-As-Tabs](https://github.com/PalWorks/Gmail-Labels-As-Tabs), it
   deploys only on manual dispatch, and CI's last step will fail if it does not name every
   outbound host and permission this build has. That page went four versions stale because
   it lives somewhere else; assume it is stale until you have read it.
7. Upload `extension.zip` to the Chrome Web Store Developer Dashboard.
8. Tag the release in git and push the tag.
9. Dispatch CI on `main` (`gh workflow run ci.yml --ref main`). It is manual-trigger only,
   so nothing runs on the merge itself.

## Roll back a release

- **Code:** revert the offending commits on `main` and cut a new patch release with an
  incremented version (the Chrome Web Store does not allow re-uploading an old version
  number). Never re-use a shipped version string.
- **Store:** if a bad build is live, upload a corrected higher-versioned package. Users
  auto-update; there is no per-user rollback.

## When a guard suite fails

Four suites assert things about the repository rather than about a function. Read the
failure message before changing the test: each one names the file and line, and the fix is
almost always in the code or the document it points at.

| Failure | Usual fix |
|---|---|
| `htmlSinks` | Wrap the value in `escapeHtml`. Do not add user data to its allowlist |
| `contrast` colour literal | Move the value into a CSS token |
| `repoConsistency` claim | Correct the document; if the code genuinely changed, relax the claim and say so in an ADR |
| `repoConsistency` path | Fix the link, or the file moved and the doc did not follow |
| `repoConsistency` CONTEXT_MAP | Add the new module to the source map |
| `repoConsistency` dead CSS | Delete the rule |
| `repoConsistency` undisclosed host | The service worker names an outbound host that SECURITY.md, the privacy page or STORE_LISTING does not. Disclose it, or remove the host |
| `repoConsistency` test count | Live documents disagree on the total. Set them all to what `npm test` prints |
| `repoConsistency` retired site link | Something links to the Pages site deleted in v1.5.0. Use `https://palworks.github.io/Gmail-Labels-As-Tabs/` |
| `repoConsistency` `website/` exists | The duplicate marketing site came back. It belongs in the other repository |
| `repoConsistency` workflow trigger | A `push:` or `pull_request:` trigger reappeared. Actions here are manual only |
| `repoConsistency` theme boot position | An extension page loads `themeBoot.js` late or not at all, or the options page markup lost `class="theme-light"`. The script must be the first thing inside `<body>`; anywhere later and the page has already painted |
| CI: `dist/icons` undeclared | `copy-assets` swept up a file the manifest does not name. Two promo tiles shipped to users that way |
| CI: published privacy policy | The live page no longer describes this code. Fix the page in the other repository and dispatch its deploy |
| `rulesProperty` | The escaping is wrong for one of the generator's four output languages. The failure prints the seed case |
| `repoConsistency` Gmail class | A module outside `src/utils/selectors.ts` hardcoded one of Gmail's obfuscated names. Find the element by role or attribute instead, as `labelMenu.ts` does, or put the selector in the registry with a reason |

## When the drift canary fails

The canary watches the structure Gmail must keep for the "Show as Tabs" item to
work. It runs daily as a systemd user timer and escalates on the **second**
consecutive failure. See [scripts/canary/README.md](scripts/canary/README.md).

```
scripts/canary/install-canary.sh --status     # when it last ran, and what it said
tail -40 scripts/canary/canary.log            # the last few runs in full
NODE_PATH=$(npm root -g) node scripts/canary/gmail-drift-canary.mjs   # run it now
```

| Check | What Gmail changed | What to do |
|---|---|---|
| C1 | Label rows no longer expose a name through `data-label-name`, `data-tooltip` or a `#label/` href | Add a fourth reader in `resolveLabelName`. Until then the item does not appear, which is correct behaviour, not a bug |
| C2 | Clicking a label's trigger no longer opens exactly one `[role="menu"]` | Check whether Gmail was merely slow first: the log prints how long it took. If the structure really changed, the feature disables itself and users see Gmail unchanged |
| C3 | The menu no longer holds an ordinary `[role="menuitem"]` | There is nothing to clone. Do not substitute a hand-built item: it will look foreign and will drift |
| C4 | A clone no longer renders like the item it came from | Gmail styles items by something other than the class. Investigate before shipping anything |
| OURS | Our item is missing although C1 to C4 all passed | This one is ours, not Gmail's. Start at `installLabelMenuItem()` in `content.ts` |

Two verdicts are not failures. **SKIPPED** means the canary could not reach a
signed-in Gmail and learned nothing. A **note** that Gmail took longer to open
the menu than the extension waits means our item was correctly absent.

## Troubleshooting (production symptoms)

| Symptom | Likely cause | Where to look |
|---------|--------------|---------------|
| Tab bar does not appear | Injection anchor not found or Gmail layout change | [src/content.ts](src/content.ts), [src/utils/selectors.ts](src/utils/selectors.ts) |
| Unread counts missing or wrong | Waterfall source failing or false-positive filtering | [src/modules/unread.ts](src/modules/unread.ts), [src/xhrInterceptor.ts](src/xhrInterceptor.ts) |
| Theme not propagating across accounts | `storage.local` change listener not firing | [src/content.ts](src/content.ts), [src/utils/storage.ts](src/utils/storage.ts) |
| Rules missing for a tab | Tab has no resolvable Gmail label (hash tab) | [src/modules/rules.ts](src/modules/rules.ts) |
| Build ships console output | esbuild `drop` not applied | [build.js](build.js) |
| "Show as Tabs" missing from a label menu | Gmail did not open a menu within the wait, or gave nothing to clone | The options page says which, under Gmail integration. Then [src/modules/labelMenu.ts](src/modules/labelMenu.ts) |

## CI

**Nothing runs automatically.** [.github/workflows/ci.yml](.github/workflows/) is
`workflow_dispatch` only, so a push and a merge run nothing; dispatch it yourself:

```
gh workflow run ci.yml --ref main -f ref_note="why this run"
```

It runs the suite twice (parallel, then serially to catch order and timing flakes), lints,
typechecks the worker, builds, and then checks the artefact: no `console.log` in
`dist/js`, version parity, no `@ts-ignore`, the required files present, no file in
`dist/icons` the manifest does not declare, and the zip under 5MB. Its last step fetches
the **published privacy policy** and fails if it no longer describes this code.

The marketing site is a different repository and also deploys by hand:

```
gh workflow run deploy.yml --repo PalWorks/Gmail-Labels-As-Tabs --ref main
```

A change to the privacy policy is not live, and must not be described as live, until that
has run.
