# PLAYBOOK.md

Operational procedures for **Gmail Labels and Search Queries as Tabs**. Step-by-step
recipes for building, testing, releasing, rolling back, and troubleshooting.

Last updated: 2026-07-07 (v1.2.1)

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
6. Upload `extension.zip` to the Chrome Web Store Developer Dashboard.
7. Tag the release in git and push the tag.
8. Dispatch CI on `main` (`gh workflow run ci.yml --ref main`). It is manual-trigger only,
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
| `rulesProperty` | The escaping is wrong for one of the generator's four output languages. The failure prints the seed case |

## Troubleshooting (production symptoms)

| Symptom | Likely cause | Where to look |
|---------|--------------|---------------|
| Tab bar does not appear | Injection anchor not found or Gmail layout change | [src/content.ts](src/content.ts), [src/utils/selectors.ts](src/utils/selectors.ts) |
| Unread counts missing or wrong | Waterfall source failing or false-positive filtering | [src/modules/unread.ts](src/modules/unread.ts), [src/xhrInterceptor.ts](src/xhrInterceptor.ts) |
| Theme not propagating across accounts | `storage.local` change listener not firing | [src/content.ts](src/content.ts), [src/utils/storage.ts](src/utils/storage.ts) |
| Rules missing for a tab | Tab has no resolvable Gmail label (hash tab) | [src/modules/rules.ts](src/modules/rules.ts) |
| Build ships console output | esbuild `drop` not applied | [build.js](build.js) |

## CI

Pushes and PRs run [.github/workflows/ci.yml](.github/workflows/): test, build, verify no
`console.log` in `dist/js`, upload artifact. The website deploys via `deploy_website.yml`.
