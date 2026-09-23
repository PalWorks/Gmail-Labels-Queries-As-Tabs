# Gmail Labels & Queries as Tabs — Complete Repository Analysis

Last updated: 2026-09-23 (v1.7.1)

## 1. High-Level Overview

**Domain:** Browser Productivity Extension (Chrome Web Store)
**Purpose:** Injects a user-configurable tab bar directly into the Gmail web interface, allowing users to create one-click shortcuts to Gmail labels, search queries, and custom hash views.

**Primary Use Case:** Power Gmail users who rely on labels and saved searches can navigate between views without digging through the sidebar. Tabs are persistent, reorderable via drag-and-drop, and synced across devices via `chrome.storage.sync`.

**Key Differentiators:**
- No background network requests (privacy-first); the only outbound call is the feedback
  message a user chooses to send
- Multi-account support (per-email settings)
- Real-time unread counts via XHR interception of Gmail's internal API
- Full theme support (System / Light / Dark)
- Export/Import for configuration portability

---

## 2. Directory Structure

```
Gmail-Labels-As-Tabs/
├── manifest.json              # Chrome Extension MV3 manifest (entry point for Chrome)
├── package.json               # Node dependencies & scripts
├── tsconfig.json              # TypeScript compiler config (ES2022, strict)
├── build.js                   # esbuild bundler config (7 entry points)
├── jest.config.js             # Test config (ts-jest, jsdom) + coverage thresholds
├── generate_icons.py          # Utility to generate icon sizes from source
│
├── src/                       # ★ ALL EXTENSION SOURCE CODE
│   ├── content.ts             # Orchestrator: injection lifecycle, listeners, wiring (416 lines)
│   ├── background.ts          # Service worker (downloads, install hooks, action click)
│   ├── xhrInterceptor.ts      # MAIN world script (XHR monkey-patch for unread counts)
│   ├── options.ts/.html/.css  # Options page: settings, rules, privacy, feedback
│   ├── welcome.ts/.html/.css  # Onboarding page
│   ├── popup.ts/.html/.css    # The toolbar icon's menu
│   ├── themeBoot.ts           # ★ Stamps the theme before a page paints anything
│   ├── modules/               # ★ Feature modules, one concern each
│   │   ├── tabs.ts            # Tab bar rendering, dropdowns, keyboard and aria
│   │   ├── unread.ts          # Unread waterfall: Atom feed (cached) → XHR → DOM
│   │   ├── dragdrop.ts        # Drag-and-drop reordering, bar and modal
│   │   ├── tabManager.ts      # Shared add-tab parsing + managed list behavior
│   │   ├── rules.ts           # Apps Script generation from rules
│   │   ├── ruleTemplates.ts   # One-click rule presets, behind a feature flag
│   │   ├── colorPicker.ts     # Shared accessible color swatch control
│   │   ├── feedback.ts        # In-product feedback: validation, diagnostics, submit
│   │   ├── theme.ts           # Theme resolution from Gmail's own rendered theme
│   │   ├── themeMirror.ts    # ★ The last painted theme, readable without yielding
│   │   ├── state.ts           # Encapsulated module state behind accessors
│   │   ├── extensionContext.ts # ★ Is this content script still attached to the extension?
│   │   ├── messages.ts        # Message names, in a leaf so they drag no code
│   │   ├── onboarding/        # ★ The tour: one wizard, two hosts
│   │   │   ├── wizardContent.ts   # Copy as data, so none of it can reach innerHTML
│   │   │   ├── wizardView.ts      # Narration + a working miniature of the bar
│   │   │   └── onboardingModal.ts # …as a modal over Gmail
│   │   └── modals/            # One file per dialog (edit, delete, pin, import, …)
│   │       └── contextNotice.ts # The one message a modal shows once orphaned
│   ├── utils/
│   │   ├── storage.ts         # ★ chrome.storage wrapper (multi-account) + migrations
│   │   ├── importExport.ts    # Export / import serialization and validation
│   │   ├── tabListRenderer.ts # Shared tab-row rendering for bar and options
│   │   ├── colors.ts          # Tab color palette tokens and validation
│   │   └── selectors.ts       # Gmail DOM selectors, in one place
│   ├── ui/
│   │   └── toolbar.css        # ★ In-Gmail design system (CSS custom properties)
│   ├── popup.html/.css/.ts    # The toolbar icon's menu (1 KB bundle)
│   ├── icons/                 # Extension icons (16/32/48/128 png)
│
├── test/                      # 35 suites: one per module, plus four repo-wide guards
│   └── helpers/contrast.ts    # WCAG math + CSS token reader for the palette test
│
├── worker/                    # Cloudflare Worker: feedback relay (holds the mail API key)
├── scripts/                   # Manual tooling (rendered-pixel contrast audit)
├── _locales/                  # i18n (internationalization) strings
├── dist/                      # Build output (loaded into Chrome)
└── .github/workflows/         # CI only, manual dispatch (the website is another repo)
```

### Responsibility Summary

| Folder/File | Responsibility |
|---|---|
| `src/content.ts` | Orchestrator: bootstraps the content script, owns the injection lifecycle and storage listeners, delegates everything else to modules |
| `src/modules/` | Feature modules, one concern per file. Nothing here reaches into another module's state; shared state goes through `state.ts` |
| `src/utils/` | Leaf utilities with no module dependencies: storage, import/export, rendering, colors, selectors |
| `src/background.ts` | Service worker: file downloads, install hooks, uninstall URL, and picking which surface the onboarding tour opens on |
| `src/xhrInterceptor.ts` | MAIN world injection: intercepts Gmail's XHR responses to extract real-time unread label counts |
| `src/ui/toolbar.css` | Visual layer for the in-Gmail surface: design system with light/dark theming via custom properties |
| `src/themeBoot.ts` | Loaded synchronously as the first thing inside `<body>` on every extension page, so the page opens in the right colour instead of correcting itself in front of the user. See ADR-020 |
| `worker/` | The one server-side piece: relays user-submitted feedback to email, so no API key ships in the extension |
| _(none)_ | The marketing site is a separate repository: [PalWorks/Gmail-Labels-As-Tabs](https://github.com/PalWorks/Gmail-Labels-As-Tabs) |

---

## 3. Entry Points & Execution Flow

### Architecture Diagram

```
┌──────────────────────────────────────────────────────────┐
│                     CHROME BROWSER                        │
│                                                          │
│  ┌─────────────────┐     ┌────────────────────────────┐  │
│  │  Service Worker  │     │      Gmail Page (DOM)       │  │
│  │  background.ts   │     │                            │  │
│  │                 │     │  ┌─────────────────────┐   │  │
│  │  • onInstall    │────▶│  │  ISOLATED WORLD      │   │  │
│  │  • onClicked    │     │  │  content.ts           │   │  │
│  │  • DOWNLOAD_FILE│◀───│  │                       │   │  │
│  │  • UNINSTALL    │     │  │  • init()             │   │  │
│  └─────────────────┘     │  │  • renderTabs()       │   │  │
│                          │  │  • Settings Modals    │   │  │
│                          │  │  • Drag & Drop        │   │  │
│  ┌─────────────────┐     │  │  • Active Tab         │   │  │
│  │ chrome.storage   │◀──▶│  └──────────┬────────────┘   │  │
│  │ .sync            │     │             │                │  │
│  └─────────────────┘     │  ┌──────────▼────────────┐   │  │
│                          │  │  MAIN WORLD            │   │  │
│                          │  │  xhrInterceptor.ts     │   │  │
│                          │  │                        │   │  │
│                          │  │  • Monkey-patches XHR  │   │  │
│                          │  │  • Parses Gmail JSON   │   │  │
│                          │  │  • CustomEvent dispatch │   │  │
│                          │  └────────────────────────┘   │  │
│                          └────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

### Step-by-Step Execution Flow

1. **Chrome loads the extension** → reads `manifest.json`
2. **Service worker** (`background.ts`) boots:
   - Sets `onInstalled` listener → opens `welcome.html`, sets default labels, reloads Gmail tabs
   - Sets feedback URL for uninstall
   - Listens for `action.onClicked` → sends `TOGGLE_SETTINGS` message to active tab
3. **User opens Gmail** → Chrome injects `content.ts` (ISOLATED world) + `toolbar.css`
4. **`content.ts` → `init()`**:
   - **Immediately** injects `xhrInterceptor.js` into MAIN world (for XHR access)
   - **Starts DOM-based email extraction** (polls `document.title`, `aria-label`)
   - **On the first address found** → calls `finalizeInit(email)`:
     - Migrates legacy settings if needed
     - Loads settings from `chrome.storage.sync`
     - **Applies the theme, then** calls `renderTabs()`. That order is the fix
       from 1.6.1: rendering first left the bar on toolbar.css's own media
       query for a frame, which on a dark desktop is a dark bar over a light
       Gmail
     - Note that `attemptInjection()` can have inserted the bar before any of
       this, so the bar carries no background until a theme class exists. See
       ADR-020
5. **Tab bar injection**: Finds Gmail's `.G-atb` toolbar → inserts tab bar `afterend`
6. **`MutationObserver`** watches for Gmail's DOM changes → re-injects if bar goes missing
7. **Unread counts**: Dual strategy:
   - **Primary:** Gmail Atom feed (`/feed/atom/{label}`) per-tab
   - **Real-time:** XHR interceptor dispatches `gmailTabs:unreadUpdate` custom events
   - **Fallback:** DOM scraping of sidebar `aria-label` attributes
8. **User interactions**: Click→navigate (via `window.location.hash`), dropdown menus, modals (Pin/Edit/Delete/Settings), drag-and-drop reordering

---

## 4. Architectural Patterns

| Pattern | Where | Description |
|---|---|---|
| **Dual-World Injection** | `content.ts` + `xhrInterceptor.ts` | Content script runs in ISOLATED world (can't see Gmail's XHR). Solution: inject a script tag into MAIN world that monkey-patches `XMLHttpRequest` and communicates back via `CustomEvent` |
| **Event-Driven Communication** | Cross-world | MAIN→ISOLATED: `CustomEvent('gmailTabs:unreadUpdate')`. Content↔Background: `chrome.runtime.sendMessage` |
| **Optimistic UI** | Drag-and-drop | UI updates immediately on drop, storage write happens asynchronously |
| **Per-Account Namespacing** | `storage.ts` | Settings keyed by `account_{email}` in `chrome.storage.sync`, enabling multi-account support |
| **CSS Custom Properties** | `toolbar.css` | Full theming via CSS variables with `prefers-color-scheme` media query + force-override classes |
| **Strategy Pattern (implicit)** | Unread counts | Three strategies tried in order: Atom feed → XHR interception → DOM scraping |

---

## 5. Core Modules & Relationships

### `content.ts` — The Orchestrator (416 lines)

Since v1.2.0 this is a thin coordinator, not a monolith. It owns only what must be
owned centrally:

| Responsibility | Key Functions |
|---|---|
| **Initialization** | `init()`, `initializeFromDOM()`, `finalizeInit()`, `installLabelMenuItem()` |
| **Injection lifecycle** | `attemptInjection()`, bounded retries, `MutationObserver` fallback |
| **Account registration** | `ensureAccountRegistered()` so the options page sees the account |
| **Cross-surface listeners** | `chrome.storage.onChanged` (account-scoped), `popstate`, theme watcher |

Everything else lives in `src/modules/`: rendering in `tabs.ts`, counts in `unread.ts`,
reordering in `dragdrop.ts`, dialogs in `modals/`, theme resolution in `theme.ts`.

One lifecycle fact shapes every surface below it: Chrome does **not** reload a page when
it updates the extension running in it. The content script keeps running, its DOM stays
on screen and its buttons stay clickable, while every `chrome.*` call fails. Nothing can
repair that from inside, so the rule is to notice and say so:
[extensionContext.ts](src/modules/extensionContext.ts) detects it and
[modals/contextNotice.ts](src/modules/modals/contextNotice.ts) is the single message
every modal shows when it happens. See ADR-017.

### `storage.ts` — Data Layer and the only write path

Reads are ordinary:

- `getSettings(accountId)` — per-account settings with defaults, arrays and colours
  normalised on the way out, because storage is the trust boundary
- `getAllAccounts()` — enumerates stored account keys
- `migrateLegacySettingsIfNeeded` — one-time migration from the v0 global format

Writes are not. Since v1.5.0 a change is **described, not performed**:

```
caller → SettingsOp ─┬─ service worker → per-account promise chain → applyOp → set
                     └─ (worker unreachable) → local rev-checked retry → applyOp → set
```

`applyOp(current, op)` is pure, total and idempotent, and is the only code that decides
what a change means, so the two paths cannot disagree. `mutateSettings` picks the path.
`addTab`, `removeTab`, `updateTab`, `updateTabOrder`, `savePreferences`, `addRule`,
`upsertRule`, `updateRule` and `removeRule` are thin wrappers that build an op, and each
returns the settings as written, including the new `rev`, so a caller can recognise its own
change when `chrome.storage.onChanged` fires.

Why the service worker rather than a lock: it is a single JavaScript context, so a promise
chain per account serializes every writer in the profile by construction. Web Locks cannot
help, because a content script's lock scope is `mail.google.com` and an extension page's is
`chrome-extension://`. See ADR-013 and [DATA_MODEL.md](DATA_MODEL.md).

### `xhrInterceptor.ts` — Passive Listener (206 lines)

Runs in Gmail's **MAIN world** (same JS context as Gmail):

- Monkey-patches `XMLHttpRequest.prototype.open/send`
- Filters for `/sync/` and `/mail/u/` URLs
- Parses Gmail's anti-hijacking JSON format (`)]}'` prefix)
- Recursively searches response arrays for `[labelId, count]` tuples
- Dispatches results as `CustomEvent` back to the content script

### `background.ts` — Service Worker

Handles privileged Chrome APIs, and is the serialization point for settings:

- `MUTATE_SETTINGS` — applies a `SettingsOp` on a per-account promise chain. This is the
  single writer for everything the user configures.
- `chrome.downloads.download()` for config export
- `chrome.management.uninstallSelf()` for clean uninstall
- `chrome.runtime.onInstalled` for onboarding
- `chrome.action.onClicked` forwards to content script

It sets an **uninstall URL**, pointing at the Tally feedback form, because uninstall is
the one moment the in-product feedback form cannot reach. The link carries no address,
settings or identifier, and its host must appear in SECURITY.md, the in-extension privacy
page and STORE_LISTING.md or `test/repoConsistency.test.ts` fails the build. See ADR-014.

The message listener returns `true` only for the two messages it answers asynchronously.
Returning `true` for anything else holds the sender's channel open forever, so a
promise-form `sendMessage` never settles, which is how a stale worker can hang a caller.

---

## 6. Configuration Management

| What | Where | Format |
|---|---|---|
| Per-account settings | `chrome.storage.sync` | Key: `account_{email}`, Value: `Settings` object |
| Default settings | [storage.ts](file:///home/palani/Documents/Gmail-Labels-As-Tabs/src/utils/storage.ts#L31-L48) | Hardcoded `DEFAULT_SETTINGS` constant |
| Theme | Browser-wide in `chrome.storage.local` under `globalTheme` (default `light`); `Settings.theme` kept only for migration seeding | `'system' \| 'light' \| 'dark'` |
| Uninstall feedback URL | [background.ts](file:///home/palani/Documents/Gmail-Labels-As-Tabs/src/background.ts#L66) | Hardcoded Tally form URL |
| i18n | `_locales/en/` | Chrome i18n message format |

> **No `.env` or secrets** are used by the extension itself. All config is user-controlled via `chrome.storage.sync`.

---

## 7. Dependency Structure

### Internal Module Graph

```
content.ts ──imports──▶ storage.ts
content.ts ──imports──▶ modules/labelMenu.ts ──imports──▶ modules/health.ts
xhrInterceptor.ts ──(standalone, no imports)──
welcome.ts ──(standalone, uses chrome.* APIs)──
```

### External Dependencies

| Package | Purpose | Why |
|---|---|---|
| `esbuild` | Build tool | Fast TypeScript bundling (4 entry points → `dist/js/`) |
| `typescript` | Language | Strict-mode TypeScript compilation |
| `jest` + `ts-jest` + `jest-environment-jsdom` | Testing | Unit tests with JSDOM for browser APIs |
| `eslint` + `prettier` | Code quality | Linting and formatting |
| `@types/chrome` | Type definitions | TypeScript types for Chrome Extension APIs |

> [!NOTE]
> The extension has **zero dependencies of any kind in the shipped bundle**. Every package
> above is a `devDependency`; `dist/js/*.js` is this repository's own code and nothing else.
> The last third-party library in the bundle, `@inboxsdk/core`, was removed after v1.6.2.
> See ADR-021.

---

## 8. Testing Strategy

### Current State

| Layer | Where | What it covers |
|---|---|---|
| Unit suites | `test/*.test.ts`, one per module | 38 suites, 802 tests: storage and migrations, the settings reducer and write path, tab rendering with keyboard and aria, the unread waterfall, XHR parsing, rules and Apps Script generation and escaping, options page, onboarding, modals, drag-and-drop, state accessors, import/export, tab manager, colors, rule templates, feedback |
| Concurrency | [test/settingsOps.test.ts](test/settingsOps.test.ts) | The reducer's purity and idempotency, serialization under ten interleaved writers, every service-worker fallback path, and the stale-reorder reproduction |
| Escaping | [test/rulesProperty.test.ts](test/rulesProperty.test.ts) | 1,000 generated hostile inputs through the Apps Script generator, each evaluated and checked for parse failure, lossy round trip, unquoted labels and canary globals |
| Markup sinks | [test/htmlSinks.test.ts](test/htmlSinks.test.ts) | Walks the AST and fails on any unescaped interpolation into `innerHTML` |
| Palette guard | [test/contrast.test.ts](test/contrast.test.ts) | Reads the CSS tokens and fails if any text color drops below WCAG AA, if a retired low-contrast value returns, if helper text fades with opacity, or if any colour literal appears in a `.ts` or `.html` file |
| Repo consistency | [test/repoConsistency.test.ts](test/repoConsistency.test.ts) | Documentation claims, path references, CONTEXT_MAP coverage, and dead CSS |
| Rendered pixels | [scripts/contrast-audit.mjs](scripts/contrast-audit.mjs) | Manual: measures real composited output in Chrome, which token math cannot see |

### Framework

- **Jest** with `ts-jest` preset and `jsdom` test environment
- Path alias: `@/` → `src/`
- Chrome APIs mocked manually (`global.chrome = {...}`)
- Coverage thresholds enforced in [jest.config.js](jest.config.js): 65% statements, 50% branches, 65% functions, 65% lines

### The gate that is not a test

`npm run lint` is type-aware over `src/` and treats `no-floating-promises` and
`no-misused-promises` as errors. It is part of the testing strategy because it catches
what no unit test here caught: a promise whose rejection nobody holds, which renders as
a control that does nothing and says nothing. Every user-visible bug fixed in 1.5.0 was
one; enabling the rules found twenty-five more. The tests covering the broken
options-page link *passed*, because they mocked the call that was failing. See ADR-017.

### Known gaps

> [!NOTE]
> - No end-to-end or visual regression tests. The contrast script is the only browser-driven
>   check, and it is run by hand.
> - CI runs on manual dispatch only (`gh workflow run ci.yml`), by product-owner decision, so
>   a push does not verify itself.


## 9. Extension Points & Safe Modification Guide

### Adding a New Tab Type (e.g., "category" tabs)
1. Extend `Tab.type` union in [storage.ts](file:///home/palani/Documents/Gmail-Labels-As-Tabs/src/utils/storage.ts#L12) to add new type
2. Add navigation logic in `renderTabs()` click handler ([content.ts#L794-L801](file:///home/palani/Documents/Gmail-Labels-As-Tabs/src/content.ts#L794))
3. Add active-tab matching in `updateActiveTab()` ([content.ts#L1412-L1441](file:///home/palani/Documents/Gmail-Labels-As-Tabs/src/content.ts#L1412))
4. Add unread count logic in `updateUnreadCount()` ([content.ts#L1924](file:///home/palani/Documents/Gmail-Labels-As-Tabs/src/content.ts#L1924))

### Adding a New Theme
1. Add CSS custom property overrides in `toolbar.css` under a new `body.force-{name}` selector
2. Extend `Settings.theme` type in `storage.ts`
3. Add button in `createSettingsModal()` theme selector
4. Give the tab bar its background under that selector too. `.gmail-tabs-bar` is
   transparent by default on purpose: a surface with no theme paints nothing
   rather than guessing. See ADR-020
5. If the new theme resolves to something other than light or dark, extend
   `MirroredTheme` in `themeMirror.ts`, or pages will open in the wrong one

### Adding New Settings
1. Add field to `Settings` interface in `storage.ts`
2. Update `DEFAULT_SETTINGS`
3. Add UI control in `createSettingsModal()` in `content.ts`

### Adding External API Integration
1. Add permission to `manifest.json`
2. Implement in `background.ts` (privileged context)
3. Use `chrome.runtime.sendMessage` bridge from `content.ts`

### Website Changes
The marketing site is not in this repository. It lives in [PalWorks/Gmail-Labels-As-Tabs](https://github.com/PalWorks/Gmail-Labels-As-Tabs) and deploys manually: `gh workflow run deploy.yml --repo PalWorks/Gmail-Labels-As-Tabs --ref main`. A duplicate copy used to sit here as `website/` and served a second, drifting privacy policy; it was deleted in v1.5.0 and Pages disabled on this repository.

---

## 10. Technical Debt & Risk Areas

### 🔴 Critical

| Issue | Impact | Location |
|---|---|---|
| **XHR heuristic fragility** | Gmail's internal JSON format is undocumented and changes without notice | `xhrInterceptor.ts` |
| **Cross-device sync conflicts** | `chrome.storage.sync` replicates through Chrome Sync, which resolves per key as last-writer-wins with no hook for us. Two devices editing one account offline still lose a side. Writes *within* a profile are serialized as of v1.5.0 (ADR-013); this is what is left | `src/utils/storage.ts` |

### 🟡 Moderate

| Issue | Impact | Location |
|---|---|---|
| **Gmail theme detection is heuristic** | Reads painted background colors; a Gmail redesign could defeat it, falling back to the OS preference. Since 1.6.2 that fallback is marked rather than painted, so a wrong guess shows as no background rather than the wrong one, and is committed only once the settle ladder gives up | `src/modules/theme.ts` |
| **The first-frame theme is a cache, and one writer cannot reach it** | `localStorage` is per-origin, so the Gmail content script cannot update it. Change the theme in the in-Gmail modal and the next extension page can open in the previous theme for one frame. Costs a frame, never a final state | `src/modules/themeMirror.ts` |
| **Hardcoded selectors** | `.G-atb`, `.bsU`, `.aeF`, `.wT` are Gmail's obfuscated class names and can change. They are now confined to `src/utils/selectors.ts` by a guard, and the newest Gmail integration (`labelMenu.ts`) uses none of them: it finds elements by ARIA role and clones one to inherit Gmail's own classes. See ADR-022 | `src/utils/selectors.ts` |
| **The label menu depends on structure Gmail owns** | ARIA roles on Gmail's menu and a readable label name. If either goes, the item does not appear and Gmail is untouched, which is the designed behaviour rather than a fault. Watched daily by `scripts/canary/`, and reported per user by the options page's integration row. See ADR-023 | `src/modules/labelMenu.ts` |
| **No error boundary** | If init throws, the bar silently does not appear; failures are logged, not surfaced | `src/content.ts` |

### 🟢 Low

| Issue | Impact |
|---|---|
| The marketing site is a separate repository | Build and deploy are independent, and the privacy policy it serves cannot be kept in step by this build. A CI step fetches the published policy instead |
| Source files are not Prettier-clean | `npm run lint` passes and CI does not check formatting; `npm run format` would touch ~30 files in one unrelated diff |

---

## 11. Build & Development Workflow

```bash
# Install
npm install

# Development (watches TypeScript, rebuilds on change)
npm run watch
# Note: Static assets need manual copy via:
npm run copy-assets

# Production build → dist/
npm run build

# Package for Chrome Web Store
npm run package  # → extension.zip

# Run tests
npm test

# Load in Chrome
# chrome://extensions → Developer Mode → Load Unpacked → select dist/
```

### Build Pipeline (build.js)

```
src/content.ts     ──┐
src/background.ts  ──┤ esbuild (bundle, minify, ES2020)
src/xhrInterceptor.ts──┤──────────────────────────────▶  dist/js/*.js
src/welcome.ts     ──┘
                      
copy-assets: manifest.json, CSS, HTML, icons, _locales  ▶  dist/
```

---

## 90-Second Mental Model

**What is it?** A Chrome MV3 extension that adds a customizable tab bar to Gmail for quick label/search navigation.

**Three execution contexts:**
1. **Service Worker** (`background.ts`) — Handles install, file downloads, and the toolbar icon click
2. **Isolated World** (`content.ts`) — The 2100-line brain that renders tabs, manages settings modals, handles drag-and-drop, and coordinates everything
3. **Main World** (`xhrInterceptor.ts`) — Silently patches Gmail's XHR to sniff unread counts from internal API responses, then fires a `CustomEvent` back to the content script

**Data flow:** Settings live in `chrome.storage.sync` keyed per-email (`account_{email}`). The `storage.ts` module provides a typed CRUD API. Changes trigger real-time re-renders via `chrome.storage.onChanged` listener.

**How tabs work:** Each tab is `{ id, title, type, value }`. Clicking a tab sets `window.location.hash` (e.g., `#label/Work`, `#search/from:boss`). The active tab is highlighted by matching the current hash.

**Unread counts:** Three-strategy waterfall — Atom feed → XHR interception → DOM scraping. The XHR interceptor is the most novel: it monkey-patches `XMLHttpRequest` in Gmail's page context, parses Gmail's proprietary JSON, and ferries `[label, count]` tuples back via `CustomEvent`.

**Where to start contributing:** Read `storage.ts` first (the data layer, 518 lines), then `content.ts`'s `init()` flow, which is short and delegates to `src/modules/`. Each module has a mirrored test file, so the test is usually the fastest way to understand one.
