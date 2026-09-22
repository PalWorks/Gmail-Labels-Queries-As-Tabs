# CONTRIBUTING.md

Thanks for contributing to **Gmail Labels and Search Queries as Tabs**. This guide covers
the workflow, standards, and checks.

Last updated: 2026-09-22 (v1.6.0)

## Prerequisites

- Node.js 20 or later and npm.
- Google Chrome for manual testing.
- Read [AGENTS.md](AGENTS.md) for the hard constraints and [PLAYBOOK.md](PLAYBOOK.md) for
  local setup.

## Getting started

```
npm install
npm run build     # outputs dist/
npm run watch     # rebuild on change during development
```

Load `dist/` as an unpacked extension (see [PLAYBOOK.md](PLAYBOOK.md)).

## Branch and commit strategy

- Branch off `main`; do not commit directly to `main`.
- Use Conventional Commits, matching the existing history: `feat:`, `fix:`, `docs:`,
  `chore:`, `refactor:`, `test:`.
- Keep commits scoped and self-contained.

## Coding standards

- TypeScript, ES2022, strict mode. No `@ts-ignore` / `@ts-expect-error`.
- Formatting and linting are enforced:
  ```
  npm run format     # prettier
  npm run lint       # eslint (must be 0 errors)
  npm run lint:fix   # autofix
  ```
- Reuse shared logic: state accessors in [src/modules/state.ts](src/modules/state.ts),
  add-tab and list behavior in [src/modules/tabManager.ts](src/modules/tabManager.ts).
- Escape all user-controlled strings before inserting into the DOM. See
  [SECURITY.md](SECURITY.md).
- Never leave a promise unhandled. For a `chrome.*` call that is genuinely
  fire-and-forget, use `catchChromeError` or `ignoreChromeError` from
  [src/modules/extensionContext.ts](src/modules/extensionContext.ts) rather than a bare
  `void`. A `try`/`catch` around a `chrome.*` call does not help: MV3 rejects, it does
  not throw. See ADR-017 in [DECISIONS.md](DECISIONS.md).

## Tests

- Add or update the mirrored spec under [test/](test/) for any behavior change.
- Keep coverage at or above the thresholds in [jest.config.js](jest.config.js).
- See [TESTING.md](TESTING.md) for conventions.

## PR checklist

Before opening a pull request, confirm the verification gate passes:

- [ ] `npx tsc --noEmit` is clean
- [ ] `npx jest` all suites pass
- [ ] `npx jest --runInBand` passes too; both flakes this suite has had appeared only when
      timing shifted, so one green parallel run proves less than it looks
- [ ] `npx jest --coverage` meets thresholds
- [ ] `npm run lint` has 0 errors (it is type-aware over `src/`, so it is slower than a
      plain lint and it will reject a promise whose rejection nobody handles)
- [ ] `npm run build` succeeds and `dist/js` has no `console.log`
- [ ] `manifest.json` and `package.json` versions match
- [ ] Docs updated ([CHANGELOG.md](CHANGELOG.md) and any affected reference docs)
- [ ] No build artifacts committed (`dist/`, `extension.zip`, `dist.zip`, `coverage/`)

CI does **not** run on your push. It is manual dispatch only, so run it yourself once the
PR is up: `gh workflow run ci.yml --ref <your-branch>`.

## Reporting issues

Use the Support & Feedback page inside the extension for bug reports and feature requests,
or open an issue on
[GitHub](https://github.com/PalWorks/Gmail-Labels-Queries-As-Tabs/issues).
