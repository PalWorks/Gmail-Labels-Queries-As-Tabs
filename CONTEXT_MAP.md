# CONTEXT_MAP.md

Where knowledge lives in this repository. Use this to decide which file to read for a
given question instead of scanning the whole tree.

Last updated: 2026-09-21 (v1.4.0)

## Documentation index

| Question | Read |
|----------|------|
| What is this and how do I run it? | [README.md](README.md) |
| How is the system designed? | [ARCHITECTURE.md](ARCHITECTURE.md) |
| How should an agent behave here? | [AGENTS.md](AGENTS.md) |
| What do the domain terms mean? | [DOMAIN.md](DOMAIN.md) |
| What is the storage schema? | [DATA_MODEL.md](DATA_MODEL.md) |
| Why is the code shaped this way? | [DECISIONS.md](DECISIONS.md) |
| How do I build, test, release, roll back? | [PLAYBOOK.md](PLAYBOOK.md) |
| How do I test and what are the thresholds? | [TESTING.md](TESTING.md) |
| What are the privacy and security rules? | [SECURITY.md](SECURITY.md) |
| How do I contribute? | [CONTRIBUTING.md](CONTRIBUTING.md) |
| What changed and when? | [CHANGELOG.md](CHANGELOG.md) |
| Deep repository audit and risk areas | [AUDIT.md](AUDIT.md) |
| Why does the color palette look like this? | [test/contrast.test.ts](test/contrast.test.ts) |
| Historical implementation plan | [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) |
| Post-review improvements plan | [.planning/IMPROVEMENTS-PLAN.md](.planning/IMPROVEMENTS-PLAN.md) |

## Source code map

| Concern | File |
|---------|------|
| Content-script entry, injection lifecycle, storage listeners | [src/content.ts](src/content.ts) |
| MAIN-world XHR interception for unread counts | [src/xhrInterceptor.ts](src/xhrInterceptor.ts) |
| Service worker (install, welcome page, uninstall URL) | [src/background.ts](src/background.ts) |
| Options page logic (account selector, theme, rules, import/export) | [src/options.ts](src/options.ts) |
| Onboarding page logic | [src/welcome.ts](src/welcome.ts) |
| Typed storage access + migrations + global theme | [src/utils/storage.ts](src/utils/storage.ts) |
| Export / import serialization | [src/utils/importExport.ts](src/utils/importExport.ts) |
| Gmail DOM selectors | [src/utils/selectors.ts](src/utils/selectors.ts) |
| Shared module state + accessors | [src/modules/state.ts](src/modules/state.ts) |
| Tab bar rendering, dropdowns, keyboard/aria | [src/modules/tabs.ts](src/modules/tabs.ts) |
| Unread count waterfall (feed, XHR, DOM) | [src/modules/unread.ts](src/modules/unread.ts) |
| Apps Script generation from rules | [src/modules/rules.ts](src/modules/rules.ts) |
| Shared add-tab parsing + managed list behavior | [src/modules/tabManager.ts](src/modules/tabManager.ts) |
| Drag-and-drop reordering | [src/modules/dragdrop.ts](src/modules/dragdrop.ts) |
| Theme resolution: Gmail's own theme, not the OS | [src/modules/theme.ts](src/modules/theme.ts) |
| Tab color palette tokens and validation | [src/utils/colors.ts](src/utils/colors.ts) |
| Shared accessible color swatch picker | [src/modules/colorPicker.ts](src/modules/colorPicker.ts) |
| One-click automation rule presets (feature-flagged) | [src/modules/ruleTemplates.ts](src/modules/ruleTemplates.ts) |
| In-product feedback: validation, diagnostics, submit | [src/modules/feedback.ts](src/modules/feedback.ts) |
| Modal dialogs (one file per dialog) | [src/modules/modals/](src/modules/modals/) |
| In-Gmail toolbar + modal styles | [src/ui/toolbar.css](src/ui/toolbar.css) |
| Options page styles | [src/options.css](src/options.css) |
| Onboarding page styles | [src/welcome.css](src/welcome.css) |

## Build and CI map

| Concern | File |
|---------|------|
| esbuild build script (5 entry points) | [build.js](build.js) |
| npm scripts (build, watch, lint, test, package) | [package.json](package.json) |
| Jest config + coverage thresholds | [jest.config.js](jest.config.js) |
| TypeScript config | [tsconfig.json](tsconfig.json) |
| ESLint / Prettier config | [.eslintrc.json](.eslintrc.json), [.prettierrc](.prettierrc) |
| MV3 manifest | [manifest.json](manifest.json) |
| Feedback relay Worker (holds the mail API key) | [worker/](worker/) |
| Rendered-pixel contrast audit (manual) | [scripts/contrast-audit.mjs](scripts/contrast-audit.mjs) |
| CI + website deploy | [.github/workflows/](.github/workflows/) |
| Chrome i18n strings | [_locales/en/messages.json](_locales/en/messages.json) |

## Tests map

Each source module has a mirrored spec under [test/](test/) (for example
[src/modules/tabs.ts](src/modules/tabs.ts) is covered by
[test/tabs.test.ts](test/tabs.test.ts)). See [TESTING.md](TESTING.md).
