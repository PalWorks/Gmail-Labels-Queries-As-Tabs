# Gmail Labels as Tabs: Repository Audit

> **Version Analyzed:** 1.1.0 (Manifest V3)
> **Stack:** TypeScript, esbuild, Chrome Extension APIs, InboxSDK
> **License:** MIT

## 1. High Level Overview

**Gmail Labels as Tabs** is a Chrome Extension that injects a configurable tab bar directly into Gmail's web interface. Each tab maps to a Gmail label or a built-in view (Inbox, Sent, Drafts, etc.), giving users one-click navigation between their most-used labels. The extension also supports **automation rules** that generate Google Apps Script for email cleanup (trash, archive, mark-read, move-to-label) and **real-time unread count badges** via XHR interception of Gmail's internal API.

**Primary use case:** Power Gmail users who rely heavily on labels and want browser-tab-style navigation without leaving Gmail.

**Domain:** Email productivity tooling, Chrome Extension ecosystem, Gmail DOM integration.

## 2. Directory Structure

```
gmail-labels-as-tabs/
├── .github/workflows/       # CI + website deployment pipelines
│   ├── ci.yml               # Test, build, verify no console.log, upload artifact
│   └── deploy_website.yml   # Build + deploy website/ to GitHub Pages
├── _locales/en/             # Chrome i18n (extension description string)
├── dist/                    # Production build output (gitignored)
├── src/                     # All extension source code
│   ├── background.ts        # Service worker entry point
│   ├── content.ts           # Main content script coordinator
│   ├── xhrInterceptor.ts    # Page-world XHR interceptor for unread counts
│   ├── options.ts           # Options page entry point (standalone HTML page)
│   ├── options.html          # Options page markup
│   ├── options.css           # Options page styles
│   ├── welcome.ts           # Onboarding page logic
│   ├── welcome.html          # Onboarding page markup
│   ├── welcome.css           # Onboarding page styles
│   ├── modules/             # Feature modules (content script domain)
│   │   ├── state.ts         # Shared mutable state singleton + constants
│   │   ├── theme.ts         # Theme detection + CSS class switching
│   │   ├── tabs.ts          # Tab bar rendering, navigation, dropdowns
│   │   ├── unread.ts        # Unread count (Atom feed + DOM scraping + XHR)
│   │   ├── modals.ts        # All modal dialogs (Pin, Edit, Delete, Settings, Import, Uninstall)
│   │   ├── dragdrop.ts      # Drag-and-drop (tab bar + modal list reordering)
│   │   └── rules.ts         # Google Apps Script code generator
│   ├── utils/
│   │   └── storage.ts       # chrome.storage.sync wrapper (multi-account CRUD)
│   ├── ui/
│   │   └── toolbar.css      # Tab bar + modal styles injected into Gmail
│   └── experimental/
│       └── LabelMenuIntegration.ts  # Archived feature (commented out)
├── test/                    # Unit tests
│   ├── rules.test.ts        # Tests for Apps Script generation
│   └── storage.test.ts      # Tests for storage CRUD + migration
├── website/                 # Marketing/landing page (React, separate build)
├── build.js                 # esbuild configuration (5 entry points)
├── manifest.json            # Chrome Extension Manifest V3
├── package.json             # NPM scripts + dev dependencies
├── tsconfig.json            # TypeScript compiler configuration
├── jest.config.js           # Jest test runner configuration
└── generate_icons.py        # Utility script for icon generation
```

### Folder Responsibilities

| Folder | Responsibility |
|---|---|
| `src/modules/` | Feature-sliced modules for the content script. Each handles one concern (tabs, modals, theme, etc.). |
| `src/utils/` | Shared infrastructure. Currently only `storage.ts` for chrome.storage.sync management. |
| `src/ui/` | CSS files injected into Gmail. `toolbar.css` styles the tab bar and all modal overlays. |
| `src/experimental/` | Archived/deferred features. Currently contains a commented-out Label Menu Integration. |
| `test/` | Unit tests using Jest + ts-jest + jsdom. Tests storage CRUD and script generation. |
| `website/` | Independent React app for the public landing page, deployed to GitHub Pages. Has its own `package.json`. |
| `.github/workflows/` | Two pipelines: CI (test + build + verify) and website deployment (GitHub Pages). |

## 3. Entry Points and Execution Flow

The extension has **five esbuild entry points** defined in `build.js`:

| Entry Point | Role | Runs In |
|---|---|---|
| `src/content.ts` | Main coordinator; injects tab bar into Gmail | Content script (isolated world) |
| `src/background.ts` | Service worker; handles downloads, uninstall, install hooks | Background (service worker) |
| `src/xhrInterceptor.ts` | Intercepts Gmail XHR for unread counts | Page world (MAIN world) |
| `src/options.ts` | Options page UI | Standalone HTML page |
| `src/welcome.ts` | Onboarding page | Standalone HTML page |

### Content Script Execution Flow (Primary)

```
Browser loads mail.google.com
        │
        ▼
manifest.json injects content.ts + toolbar.css at document_end
        │
        ▼
content.ts::init()
   ├─── injectPageWorld()            ← Injects xhrInterceptor.js into MAIN world
   ├─── initializeFromDOM()          ← Extracts user email from DOM (polling fallback)
   ├─── loadInboxSDK()              ← Loads InboxSDK for route tracking (non-fatal)
   ├─── attemptInjection()          ← Finds Gmail toolbar, inserts tab bar after it
   ├─── startObserver()             ← MutationObserver to re-inject if Gmail re-renders
   ├─── addEventListener(popstate)  ← Track URL changes for active tab highlighting
   ├─── storage.onChanged           ← Reactive settings reload on any storage change
   ├─── runtime.onMessage           ← Handle TOGGLE_SETTINGS from background click
   └─── gmailTabs:unreadUpdate      ← Custom events from xhrInterceptor
```

### Module Wiring Pattern

Circular dependency between `tabs.ts` and `modals.ts` is resolved via **callback injection**:

```
content.ts
    │
    ├──► setRenderCallback(renderTabs)      → modals.ts gets renderTabs
    ├──► setModalCallbacks({...})           → tabs.ts gets modal openers
    └──► document.addEventListener(rerender) → dragdrop triggers re-render
```

### Background Service Worker Flow

```
background.ts
    ├─── import @inboxsdk/core/background.js  ← Required by InboxSDK
    ├─── onMessage: DOWNLOAD_FILE             ← Exports settings as JSON file
    ├─── onMessage: UNINSTALL_SELF            ← Triggers chrome.management.uninstallSelf
    ├─── action.onClicked                     ← Extension icon click → TOGGLE_SETTINGS
    └─── onInstalled (install)                ← Opens welcome page + reloads Gmail tabs
```

### XHR Interceptor Flow (Page World)

```
xhrInterceptor.ts (injected into Gmail's MAIN world)
    ├─── Monkey-patches XMLHttpRequest.open/send
    ├─── Filters for /sync/ and /mail/u/X/ URLs
    ├─── Parses response (strips anti-hijacking prefix)
    ├─── Recursively finds [labelId, unreadCount] tuples
    └─── Dispatches CustomEvent('gmailTabs:unreadUpdate') → content script
```

## 4. Architectural Patterns

### 4.1 Module-Based Content Script Architecture

The content script uses a **feature-sliced module pattern** rather than classes. Each module in `src/modules/` owns one vertical concern:

- **state.ts:** Global mutable singleton (`AppState`) imported by all modules. Acts as a simple shared state store (no event bus, no immutability).
- **theme.ts:** Pure functions for Gmail dark mode detection and CSS class toggling.
- **tabs.ts:** Imperative DOM construction for the tab bar. Re-renders by clearing `innerHTML` and rebuilding.
- **unread.ts:** Three-strategy unread count resolution (Atom feed > DOM scraping > XHR updates).
- **modals.ts:** Six modal types, all constructed via imperative DOM APIs. The largest module (919 lines).
- **dragdrop.ts:** HTML5 Drag and Drop API handlers for both the tab bar and the settings modal list.
- **rules.ts:** Pure function that generates Google Apps Script source code from user rules. No side effects.

### 4.2 Dual-World Architecture

The extension operates across two JavaScript execution environments:

- **Isolated World (Content Script):** `content.ts` and all modules. Has access to `chrome.*` APIs but cannot access Gmail's JavaScript globals.
- **MAIN World (Page Script):** `xhrInterceptor.ts`. Can intercept Gmail's XHR calls but has no `chrome.*` access. Communication flows one-way via `CustomEvent` dispatched on `document`.

### 4.3 Multi-Account Storage

Settings are keyed by Gmail email address (`account_{email}`), enabling per-account tab configurations. Legacy global storage is migrated on first detection of a new account.

### 4.4 Reactive Settings

Storage changes trigger a listener in `content.ts` that reloads settings and re-renders the tab bar. This enables the Options page (a separate context) to update the Gmail UI in real time.

## 5. Core Modules and Relationships

```
                    ┌──────────────────────┐
                    │     content.ts       │
                    │   (Coordinator)      │
                    └─────────┬────────────┘
          ┌───────────┬───────┼──────────┬─────────────┐
          ▼           ▼       ▼          ▼             ▼
    ┌──────────┐ ┌────────┐ ┌────────┐ ┌───────────┐ ┌──────────┐
    │ tabs.ts  │ │modals │ │theme  │ │ unread.ts │ │dragdrop │
    │          │ │.ts     │ │.ts     │ │           │ │.ts       │
    └────┬─────┘ └───┬────┘ └────────┘ └──────┬────┘ └────┬─────┘
         │           │                         │           │
         └───────────┴─────────┬───────────────┘           │
                               ▼                           │
                        ┌─────────────┐                    │
                        │  state.ts   │◄───────────────────┘
                        │ (Singleton) │
                        └──────┬──────┘
                               ▼
                        ┌─────────────┐
                        │ storage.ts  │
                        │ (Persistence│
                        │  Layer)     │
                        └─────────────┘
```

### Module Size and Complexity

| Module | Lines | Complexity Notes |
|---|---|---|
| `modals.ts` | 919 | Largest module. 6 modal types with full DOM construction. Settings modal alone is 335 lines. |
| `content.ts` | 333 | Coordinator with initialization, observer, and event wiring. |
| `storage.ts` | 331 | Multi-account CRUD with legacy migration. Well-structured. |
| `unread.ts` | 323 | Three unread strategies with label normalization and fuzzy matching. |
| `tabs.ts` | 312 | Tab rendering with drag events, dropdowns, and active tab detection. |
| `dragdrop.ts` | 360 | Dual drag-and-drop systems (tab bar + modal list). |
| `options.ts` | 657 | Full options page with routing, theme controls, drag-and-drop, and script generation. |
| `rules.ts` | 233 | Pure code generation. Cleanest module. |
| `xhrInterceptor.ts` | 177 | XHR monkey-patching with heuristic label detection. |
| `theme.ts` | 104 | Multi-strategy dark mode detection. |
| `state.ts` | 32 | Minimal shared state definition. |
| `welcome.ts` | 72 | Onboarding page logic. |

## 6. Configuration Management

### Chrome Storage (`chrome.storage.sync`)

All user settings are persisted via `chrome.storage.sync` with a multi-account key scheme:

```typescript
// Key format
`account_{email}` → {
    tabs: Tab[],           // Array of {id, title, type, value}
    rules: Rule[],         // Array of {tabId, action, daysOld, enabled, targetLabel?}
    theme: 'system'|'light'|'dark',
    showUnreadCount: boolean
}
```

**Defaults:** Two tabs (Inbox, Sent), system theme, unread counts enabled, no rules.

**Migration:** `migrateLegacySettingsIfNeeded()` converts pre-multi-account global keys (`tabs`, `labels`, `theme`) into the account-scoped format. The welcome page theme is also migrated from a global `theme` key.

### Manifest Permissions

| Permission | Used For |
|---|---|
| `storage` | Persisting user settings across sessions |
| `downloads` | Exporting settings as JSON file |
| `management` | Self-uninstall capability |
| `host_permissions: mail.google.com` | Content script injection + Atom feed access |

### Build Configuration

- **esbuild** (`build.js`): Bundles 5 TypeScript entry points into `dist/js/`. Production builds are minified with `console.*` calls dropped.
- **TypeScript** (`tsconfig.json`): ES2022 target, strict mode, Node module resolution.
- **Copy assets** (`package.json`): CSS, HTML, icons, locales, and manifest are copied to `dist/` after bundling.

### Constants and IDs

| Constant | Location | Purpose |
|---|---|---|
| `TABS_BAR_ID` | `state.ts` | DOM ID for the injected tab bar |
| `MODAL_ID` | `state.ts` | DOM ID for modal overlays |
| `TOOLBAR_SELECTORS` | `state.ts` | CSS selectors for Gmail's toolbar (injection target) |
| `APP_ID` | `content.ts` | InboxSDK application identifier |
| `FEEDBACK_URL` | `background.ts` | Tally.so form URL for uninstall feedback |

## 7. Dependency Structure

### Internal Module Dependency Graph

```
content.ts ──► state, theme, unread, tabs, modals, storage
tabs.ts ──► storage, state, unread, dragdrop
modals.ts ──► storage, state, theme, dragdrop
unread.ts ──► storage, state
dragdrop.ts ──► storage, state
rules.ts ──► storage (types only)
options.ts ──► storage, rules
theme.ts ──► (no internal deps)
state.ts ──► storage (types only)
```

### External Dependencies (devDependencies only)

| Library | Version | Purpose |
|---|---|---|
| `@inboxsdk/core` | ^2.2.11 | Gmail SDK for route tracking and email detection. Non-fatal fallback. |
| `esbuild` | ^0.27.0 | Fast TypeScript bundler. Replaces webpack/rollup. |
| `typescript` | ^5.3.3 | TypeScript compiler. |
| `jest` | ^29.7.0 | Test runner. |
| `ts-jest` | ^29.1.2 | TypeScript transformer for Jest. |
| `jest-environment-jsdom` | ^30.2.0 | Browser-like DOM environment for tests. |
| `jsdom` | ^27.2.0 | JSDOM for DOM simulation in tests. |
| `@types/chrome` | ^0.0.260 | Type definitions for Chrome Extension APIs. |
| `eslint` | ^8.57.0 | Linting (configured but no `.eslintrc` found). |
| `prettier` | ^3.2.5 | Code formatting (configured but no `.prettierrc` found). |

**Key architectural note:** All dependencies are `devDependencies`. The production bundle contains only the extension's own code plus InboxSDK's bundled output. There are zero runtime NPM dependencies.

### InboxSDK Usage

InboxSDK is used for two purposes:
1. **Email detection:** `sdk.User.getEmailAddress()` as a reliable fallback when DOM extraction fails.
2. **Route tracking:** `sdk.Router.handleAllRoutes()` to detect Gmail navigation changes.

The extension gracefully degrades if InboxSDK fails to load (non-fatal). DOM-based initialization runs in parallel.

## 8. Testing Strategy

### Framework: Jest + ts-jest + jsdom

```
jest.config.js
├── preset: ts-jest          # Compile TS on the fly
├── testEnvironment: jsdom   # Browser-like DOM
└── moduleNameMapper: @/ → src/  # Path aliases
```

### Test Coverage

| Test File | Lines | What It Tests |
|---|---|---|
| `test/storage.test.ts` | 413 | Multi-account CRUD (addTab, removeTab, updateTab, updateTabOrder), getAllAccounts, legacy migration, import schema validation, Rule CRUD (add, update, remove, duplicate prevention) |
| `test/rules.test.ts` | 218 | Apps Script generation for all 4 action types, Sheet logging, edge cases (no matching tab, disabled rules), special character escaping, script structural validity |
| `src/xhrInterceptor.test.ts` | 169 | XHR interception, Gmail JSON parsing, label validation, custom event dispatch |

### Testing Approach

- **chrome.storage.sync** is fully mocked with an in-memory `Record<string, any>` store.
- **crypto.randomUUID** is polyfilled for the test environment.
- Tests focus on **business logic** (storage operations, script generation) rather than DOM rendering.
- **No integration tests** for content script injection or Gmail DOM interaction.
- **No E2E tests** for the full extension lifecycle.

### CI Pipeline (`ci.yml`)

1. Checkout
2. Node.js 20 setup with npm cache
3. `npm ci` (clean install)
4. `npm test` (Jest)
5. `npm run build` (esbuild + asset copy)
6. Verify zero `console.log` in production bundle
7. Upload `dist/` as artifact (7-day retention)

## 9. Extension Points

### Adding a New Tab Type

Currently supports `'label'` and `'hash'` types. To add a new type (e.g., `'search'`):

1. Add the type to `Tab.type` union in `storage.ts`
2. Handle navigation in `tabs.ts::renderTabs()` click handler
3. Handle active tab detection in `tabs.ts::updateActiveTab()`
4. Handle unread count resolution in `unread.ts` (both `handleUnreadUpdates` and `updateUnreadCount`)
5. Update the Pin Modal in `modals.ts::showPinModal()` for detection UI

### Adding a New Rule Action

Currently supports `'trash' | 'archive' | 'markRead' | 'moveToLabel'`. To add a new action:

1. Add the action to `RuleAction` union in `storage.ts`
2. Add a case in `rules.ts::buildActionSwitch()`
3. Add UI handling in `options.ts::handleRuleChange()` and `renderRulesList()`
4. Add a test case in `test/rules.test.ts`

### Adding a New Modal Dialog

Follow the pattern in `modals.ts`:

1. Create a `showXxxModal()` function with DOM construction
2. Add keyboard dismiss handler (`onKeyDown` with Escape)
3. Add close cleanup function
4. Export from `modals.ts` and wire through `content.ts` if needed by `tabs.ts`

### Adding CSS Themes

The theme system uses CSS classes `force-dark` and `force-light` on `document.body`:

1. Define new theme values in `toolbar.css` under the appropriate class
2. Update `ThemeMode` type in `theme.ts`
3. Update theme button rendering in both `modals.ts` and `options.ts`

## 10. Technical Debt and Risk Areas

### High Priority

| Issue | Location | Impact |
|---|---|---|
| **modals.ts is a 919-line monolith** | `src/modules/modals.ts` | 6 different modal types in one file. Each modal constructs DOM imperatively. Difficult to maintain or test individually. Should be split into individual modal modules. |
| **No unit tests for content script or tab rendering** | `test/` | DOM injection, MutationObserver behavior, and tab rendering are completely untested. Regressions in Gmail DOM changes are caught only manually. |
| **XHR interceptor uses heuristics** | `src/xhrInterceptor.ts` | Gmail's internal protocol format is undocumented and changes without notice. The label-count detection relies on array pattern matching (`[string, number]`) with limited filtering. False positives are possible. |

### Medium Priority

| Issue | Location | Impact |
|---|---|---|
| **options.ts mirrors functionality from modals.ts** | `src/options.ts` (657 lines) | Tab list rendering, drag-and-drop, and import/export logic are duplicated between the options page and the Gmail overlay modals. Changes must be made in two places. |
| **Global mutable state** | `src/modules/state.ts` | The `AppState` singleton is mutated from multiple modules with no access control. Any module can set `currentSettings` to `null`, causing NPEs in other modules. |
| **No ESLint or Prettier config files** | Root directory | `eslint` and `prettier` are listed as devDependencies but no `.eslintrc` or `.prettierrc` configuration files exist. The `npm run lint` command references `eslint src/**/*.ts` but may not work without config. |
| **Gmail DOM selectors are brittle** | `TOOLBAR_SELECTORS`, various querySelector calls | Gmail uses obfuscated class names (`.G-atb`, `.aeF`, `.nH`, `.bsU`, `.aj1`, `.wT`) that can change at any Gmail update. |

### Low Priority

| Issue | Location | Impact |
|---|---|---|
| **@ts-ignore comments** | `src/xhrInterceptor.ts` (lines 48, 51, 59, 77) | XHR prototype patching requires type overrides. Acceptable for this pattern but could be improved with a typed wrapper. |
| **Experimental code is archived in-repo** | `src/experimental/LabelMenuIntegration.ts` | 313 lines of commented-out code with restoration instructions. Better as a Git branch than dead code. |
| **No source maps in production** | `build.js` (`sourcemap: false`) | Debugging production issues requires correlating minified code manually. |

## 11. 90-Second Mental Model

**What is it?** A Chrome extension that adds a tab bar to Gmail for one-click label navigation, with unread badges and email automation rules.

**How does it work?** Three scripts run simultaneously:

1. **Content script** (`content.ts`) coordinates everything. It finds Gmail's toolbar via CSS selectors, injects a tab bar element after it, and uses a MutationObserver to survive Gmail's SPA re-renders. User settings (tabs, theme, rules) are stored per-account in `chrome.storage.sync` and reloaded reactively on any change.

2. **Page world script** (`xhrInterceptor.ts`) monkey-patches `XMLHttpRequest` inside Gmail's own JavaScript context to intercept `/sync/` responses, parse label unread counts from Gmail's obfuscated JSON protocol, and dispatch them back to the content script via `CustomEvent`.

3. **Service worker** (`background.ts`) handles the extension icon click (toggles settings), opens the welcome page on install, and provides `chrome.downloads` API access for settings export.

**Where do I look?**

- **Tab bar UI:** `tabs.ts` (rendering) + `toolbar.css` (styling)
- **All popups/dialogs:** `modals.ts` (the big one)
- **Settings persistence:** `storage.ts` (the API layer)
- **Unread counts:** `unread.ts` (3 strategies) + `xhrInterceptor.ts` (XHR source)
- **Email rules automation:** `rules.ts` (script generator) + `options.ts` (UI)
- **Theme switching:** `theme.ts` (detection logic) + `toolbar.css` (CSS variables)

**How do I build and test?**

```bash
npm install          # Install dev dependencies
npm test             # Run Jest tests (storage + rules)
npm run build        # esbuild bundle + copy assets → dist/
npm run package      # build + zip → extension.zip
```

**Key architectural constraint:** The content script and page world script cannot share variables. They communicate one-way via `CustomEvent` on the `document` object. All `chrome.*` API access must happen in the content script or service worker, never in the page world script.
