# CONTEXT_MAP.md

Where knowledge lives in this repository. Use this to decide which file to read for a
given question instead of scanning the whole tree.

Last updated: 2026-09-22 (v1.6.2)

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
| Where is the marketing site and the published privacy policy? | Another repository: [PalWorks/Gmail-Labels-As-Tabs](https://github.com/PalWorks/Gmail-Labels-As-Tabs). See ADR-016 and [SECURITY.md](SECURITY.md) |
| What goes in the Web Store listing, and what is still to do? | [STORE_LISTING.md](STORE_LISTING.md) |
| Where do the store screenshots come from? | [store-assets/README.md](store-assets/README.md) |
| Why is InboxSDK in the bundle if nothing uses it? | [ARCHITECTURE.md](ARCHITECTURE.md) section 10, [AUDIT.md](AUDIT.md) section 7 |
| Why does the color palette look like this? | [test/contrast.test.ts](test/contrast.test.ts) |
| Why can I not put a hex value in a .ts file? | [test/contrast.test.ts](test/contrast.test.ts) |
| Why did my innerHTML change fail CI? | [test/htmlSinks.test.ts](test/htmlSinks.test.ts) |
| Why did my doc edit fail CI? | [test/repoConsistency.test.ts](test/repoConsistency.test.ts) |
| How are concurrent settings writes handled? | [test/settingsOps.test.ts](test/settingsOps.test.ts), ADR-013 |
| Is the generated Apps Script safe for odd label names? | [test/rulesProperty.test.ts](test/rulesProperty.test.ts) |
| V1.5 hardening plan and what was deliberately not done | [.planning/V1.5-HARDENING-PLAN.md](.planning/V1.5-HARDENING-PLAN.md) |
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
| Onboarding copy and the miniature's data | [src/modules/onboarding/wizardContent.ts](src/modules/onboarding/wizardContent.ts) |
| The onboarding wizard: narration plus a working miniature | [src/modules/onboarding/wizardView.ts](src/modules/onboarding/wizardView.ts) |
| The tour as a modal over Gmail | [src/modules/onboarding/onboardingModal.ts](src/modules/onboarding/onboardingModal.ts) |
| The tour as a standalone page, for a browser with no Gmail open | [src/welcome.ts](src/welcome.ts) |
| The toolbar icon's menu | [src/popup.ts](src/popup.ts) |
| Message names shared between surfaces, so a name drags no implementation | [src/modules/messages.ts](src/modules/messages.ts) |
| Typed storage access + migrations + global theme | [src/utils/storage.ts](src/utils/storage.ts) |
| Export / import serialization | [src/utils/importExport.ts](src/utils/importExport.ts) |
| Gmail DOM selectors | [src/utils/selectors.ts](src/utils/selectors.ts) |
| Shared module state + accessors | [src/modules/state.ts](src/modules/state.ts) |
| Detecting that this content script was orphaned by an extension update | [src/modules/extensionContext.ts](src/modules/extensionContext.ts) |
| The "reload Gmail" notice every modal shows once orphaned | [src/modules/modals/contextNotice.ts](src/modules/modals/contextNotice.ts) |
| Tab bar rendering, dropdowns, keyboard/aria | [src/modules/tabs.ts](src/modules/tabs.ts) |
| Unread count waterfall (feed, XHR, DOM) | [src/modules/unread.ts](src/modules/unread.ts) |
| Apps Script generation from rules | [src/modules/rules.ts](src/modules/rules.ts) |
| Shared add-tab parsing + managed list behavior | [src/modules/tabManager.ts](src/modules/tabManager.ts) |
| Drag-and-drop reordering | [src/modules/dragdrop.ts](src/modules/dragdrop.ts) |
| Theme resolution: Gmail's own theme, not the OS | [src/modules/theme.ts](src/modules/theme.ts) |
| Why an extension page opens in the right colour on its first frame | [src/modules/themeMirror.ts](src/modules/themeMirror.ts) |
| The script that stamps that theme before any content is parsed | [src/themeBoot.ts](src/themeBoot.ts) |
| Tab color palette tokens and validation | [src/utils/colors.ts](src/utils/colors.ts) |
| Shared accessible color swatch picker | [src/modules/colorPicker.ts](src/modules/colorPicker.ts) |
| One-click automation rule presets (feature-flagged) | [src/modules/ruleTemplates.ts](src/modules/ruleTemplates.ts) |
| In-product feedback: validation, diagnostics, submit | [src/modules/feedback.ts](src/modules/feedback.ts) |
| Shared tab list rendering + HTML escaping | [src/utils/tabListRenderer.ts](src/utils/tabListRenderer.ts) |
| Modal dialogs: barrel export | [src/modules/modals/index.ts](src/modules/modals/index.ts) |
| Modal: in-Gmail settings overlay | [src/modules/modals/settingsModal.ts](src/modules/modals/settingsModal.ts) |
| Modal: edit a tab's title, value and colour | [src/modules/modals/editModal.ts](src/modules/modals/editModal.ts) |
| Modal: confirm removing a tab | [src/modules/modals/deleteModal.ts](src/modules/modals/deleteModal.ts) |
| Modal: pin the current Gmail view as a tab | [src/modules/modals/pinModal.ts](src/modules/modals/pinModal.ts) |
| Modal: import a config file | [src/modules/modals/importModal.ts](src/modules/modals/importModal.ts) |
| Modal: uninstall confirmation | [src/modules/modals/uninstallModal.ts](src/modules/modals/uninstallModal.ts) |
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
| CI, manual dispatch only | [.github/workflows/](.github/workflows/) |
| Chrome i18n strings | [_locales/en/messages.json](_locales/en/messages.json) |

## Tests map

Each source module has a mirrored spec under [test/](test/) (for example
[src/modules/tabs.ts](src/modules/tabs.ts) is covered by
[test/tabs.test.ts](test/tabs.test.ts)). See [TESTING.md](TESTING.md).
