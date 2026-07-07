# Gmail Labels & Queries as Tabs — Complete Repository Analysis

## 1. High-Level Overview

**Domain:** Browser Productivity Extension (Chrome Web Store)
**Purpose:** Injects a user-configurable tab bar directly into the Gmail web interface, allowing users to create one-click shortcuts to Gmail labels, search queries, and custom hash views.

**Primary Use Case:** Power Gmail users who rely on labels and saved searches can navigate between views without digging through the sidebar. Tabs are persistent, reorderable via drag-and-drop, and synced across devices via `chrome.storage.sync`.

**Key Differentiators:**
- Zero external network requests (privacy-first)
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
├── build.js                   # esbuild bundler config (4 entry points)
├── jest.config.js             # Test config (ts-jest, jsdom)
├── generate_icons.py          # Utility to generate icon sizes from source
├── README.md                  # User-facing README
├── LICENSE                    # MIT License
│
├── src/                       # ★ ALL EXTENSION SOURCE CODE
│   ├── content.ts             # ★ Main content script (2141 lines — the "brain")
│   ├── background.ts          # Service worker (downloads, install hooks, action click)
│   ├── xhrInterceptor.ts      # MAIN world script (XHR monkey-patch for unread counts)
│   ├── welcome.ts             # Onboarding page logic
│   ├── welcome.html           # Onboarding page markup
│   ├── welcome.css            # Onboarding page styles
│   ├── xhrInterceptor.test.ts # Tests for XHR interception logic
│   ├── utils/
│   │   └── storage.ts         # ★ Chrome Storage API wrapper (multi-account settings)
│   ├── ui/
│   │   └── toolbar.css        # ★ Complete design system (CSS custom properties, theming)
│   ├── icons/                 # Extension icons (16/32/48/128 png)
│   └── experimental/
│       └── LabelMenuIntegration.ts  # Archived/experimental code (not in build)
│
├── test/
│   └── storage.test.ts        # Unit tests for storage utils (legacy API)
│
├── _locales/                  # i18n (internationalization) strings
│
├── dist/                      # Build output (loaded into Chrome)
│
├── website/                   # ★ SEPARATE marketing website (Vite + React)
│   ├── index.html             # HTML entry point
│   ├── index.tsx              # React root
│   ├── App.tsx                # Router (Home, Privacy, Terms, Changelog)
│   ├── vite.config.ts         # Vite config with base path
│   ├── constants.ts           # Website copy content
│   ├── components/            # Navbar, Footer, Button
│   ├── pages/                 # Home, Privacy, Terms, Changelog
│   └── public/                # Static assets (images, og-image)
│
└── .github/workflows/
    └── deploy_website.yml     # GitHub Pages CI/CD for website
```

### Responsibility Summary

| Folder/File | Responsibility |
|---|---|
| `src/content.ts` | **God module.** DOM injection, tab rendering, drag-and-drop, navigation, modals, unread counts, settings UI, theme management |
| `src/background.ts` | Service worker: file downloads, install hooks, uninstall URL, action button forwarding |
| `src/xhrInterceptor.ts` | MAIN world injection: intercepts Gmail's XHR responses to extract real-time unread label counts |
| `src/utils/storage.ts` | Data layer: CRUD operations on `chrome.storage.sync` with multi-account key-namespacing |
| `src/ui/toolbar.css` | Visual layer: complete CSS design system with light/dark theming via custom properties |
| `website/` | Independent React+Vite project for the Chrome Web Store listing page |

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
   - **Parallel path A:** Starts DOM-based email extraction (polls `document.title`, `aria-label`)
   - **Parallel path B:** Loads InboxSDK (non-blocking) for enhanced route detection
   - **Whichever finds email first** → calls `finalizeInit(email)`:
     - Migrates legacy settings if needed
     - Loads settings from `chrome.storage.sync`
     - Calls `renderTabs()` → creates the tab bar DOM
     - Applies theme
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
| **Progressive Enhancement** | `init()` | DOM-based detection runs immediately; InboxSDK loads in parallel as a fallback/enhancement |
| **Per-Account Namespacing** | `storage.ts` | Settings keyed by `account_{email}` in `chrome.storage.sync`, enabling multi-account support |
| **CSS Custom Properties** | `toolbar.css` | Full theming via CSS variables with `prefers-color-scheme` media query + force-override classes |
| **Strategy Pattern (implicit)** | Unread counts | Three strategies tried in order: Atom feed → XHR interception → DOM scraping |

---

## 5. Core Modules & Relationships

### `content.ts` — The Orchestrator (2141 lines)

This is effectively a monolith that handles:

| Responsibility | Key Functions |
|---|---|
| **Initialization** | `init()`, `initializeFromDOM()`, `loadInboxSDK()`, `finalizeInit()` |
| **Tab Bar DOM** | `createTabsBar()`, `renderTabs()`, `attemptInjection()` |
| **Navigation** | `updateActiveTab()`, `handleUrlChange()`, hash-based routing |
| **Unread Counts** | `updateUnreadCount()`, `handleUnreadUpdates()`, `getUnreadCountFromDOM()`, `buildLabelMapFromDOM()` |
| **Drag & Drop** | `handleDragStart/Over/Enter/Leave/Drop/End`, `handleSmartDragOver/Drop` (multi-row aware) |
| **Modals** | `showPinModal()`, `showEditModal()`, `showDeleteModal()`, `createSettingsModal()`, `showImportModal()`, `showUninstallModal()` |
| **Export/Import** | `exportSettings()`, `exportAllAccounts()`, `showImportModal()` |
| **Theming** | `applyTheme()` |

### `storage.ts` — Data Layer (247 lines)

Provides a typed CRUD API over `chrome.storage.sync`:

- `getSettings(accountId)` — Reads per-account settings with defaults
- `saveSettings(accountId, partial)` — Merge-saves settings
- `addTab / removeTab / updateTab / updateTabOrder` — Tab mutations
- `migrateLegacySettingsIfNeeded` — One-time migration from v0 global format
- `getAllAccounts()` — Enumerates all stored account keys

### `xhrInterceptor.ts` — Passive Listener (177 lines)

Runs in Gmail's **MAIN world** (same JS context as Gmail):

- Monkey-patches `XMLHttpRequest.prototype.open/send`
- Filters for `/sync/` and `/mail/u/` URLs
- Parses Gmail's anti-hijacking JSON format (`)]}'` prefix)
- Recursively searches response arrays for `[labelId, count]` tuples
- Dispatches results as `CustomEvent` back to the content script

### `background.ts` — Service Worker (111 lines)

Handles privileged Chrome APIs:
- `chrome.downloads.download()` for config export
- `chrome.management.uninstallSelf()` for clean uninstall
- `chrome.runtime.onInstalled` for onboarding
- `chrome.action.onClicked` forwards to content script

---

## 6. Configuration Management

| What | Where | Format |
|---|---|---|
| Per-account settings | `chrome.storage.sync` | Key: `account_{email}`, Value: `Settings` object |
| Default settings | [storage.ts](file:///home/palani/Documents/Gmail-Labels-As-Tabs/src/utils/storage.ts#L31-L48) | Hardcoded `DEFAULT_SETTINGS` constant |
| Theme | Browser-wide in `chrome.storage.local` under `globalTheme` (default `light`); `Settings.theme` kept only for migration seeding | `'system' \| 'light' \| 'dark'` |
| InboxSDK App ID | [content.ts](file:///home/palani/Documents/Gmail-Labels-As-Tabs/src/content.ts#L13) | Hardcoded constant `APP_ID` |
| Uninstall feedback URL | [background.ts](file:///home/palani/Documents/Gmail-Labels-As-Tabs/src/background.ts#L66) | Hardcoded Tally form URL |
| i18n | `_locales/en/` | Chrome i18n message format |
| Website env | `website/.env.local` | Vite environment variables |

> **No `.env` or secrets** are used by the extension itself. All config is user-controlled via `chrome.storage.sync`.

---

## 7. Dependency Structure

### Internal Module Graph

```
content.ts ──imports──▶ storage.ts
content.ts ──imports──▶ @inboxsdk/core
background.ts ──imports──▶ @inboxsdk/core/background.js
xhrInterceptor.ts ──(standalone, no imports)──
welcome.ts ──(standalone, uses chrome.* APIs)──
```

### External Dependencies

| Package | Purpose | Why |
|---|---|---|
| `@inboxsdk/core` | Gmail SDK for route detection and user identity | Provides `Router.handleAllRoutes` and `User.getEmailAddress` as enhancement (non-critical) |
| `esbuild` | Build tool | Fast TypeScript bundling (4 entry points → `dist/js/`) |
| `typescript` | Language | Strict-mode TypeScript compilation |
| `jest` + `ts-jest` + `jest-environment-jsdom` | Testing | Unit tests with JSDOM for browser APIs |
| `eslint` + `prettier` | Code quality | Linting and formatting |
| `@types/chrome` | Type definitions | TypeScript types for Chrome Extension APIs |

> [!NOTE]
> The extension has **zero runtime dependencies** — `@inboxsdk/core` is bundled at build time via esbuild.

---

## 8. Testing Strategy

### Current State

| File | Coverage | What It Tests |
|---|---|---|
| [storage.test.ts](file:///home/palani/Documents/Gmail-Labels-As-Tabs/test/storage.test.ts) | Storage CRUD | `addLabel`, `removeLabel`, `getSettings` — **uses legacy API names** (stale) |
| [xhrInterceptor.test.ts](file:///home/palani/Documents/Gmail-Labels-As-Tabs/src/xhrInterceptor.test.ts) | XHR parsing | Simulates Gmail sync response, verifies `CustomEvent` dispatch with correct label/count pairs |

### Framework

- **Jest** with `ts-jest` preset and `jsdom` test environment
- Path alias: `@/` → `src/`
- Chrome APIs mocked manually (`global.chrome = {...}`)

### Coverage Gaps

> [!WARNING]
> - **`content.ts`** (2141 lines, ~80% of logic) has **zero test coverage**
> - `storage.test.ts` imports `addLabel`/`removeLabel` which no longer exist (API changed to `addTab`/`removeTab`) — **tests are broken/stale**
> - No integration tests, E2E tests, or visual regression tests
> - No CI test runner configured

---

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

### Adding New Settings
1. Add field to `Settings` interface in `storage.ts`
2. Update `DEFAULT_SETTINGS`
3. Add UI control in `createSettingsModal()` in `content.ts`

### Adding External API Integration
1. Add permission to `manifest.json`
2. Implement in `background.ts` (privileged context)
3. Use `chrome.runtime.sendMessage` bridge from `content.ts`

### Website Changes
The `website/` directory is completely independent. Edit React components in `website/pages/` and `website/components/`. Deploy via `git push` (GitHub Actions).

---

## 10. Technical Debt & Risk Areas

### 🔴 Critical

| Issue | Impact | Location |
|---|---|---|
| **Giant monolith** | `content.ts` is 2141 lines handling UI, logic, data, and modals | `src/content.ts` |
| **Stale tests** | `storage.test.ts` imports functions that no longer exist (`addLabel`/`removeLabel`) | `test/storage.test.ts` |
| **XHR heuristic fragility** | Gmail's internal JSON format is undocumented and changes without notice | `xhrInterceptor.ts` |

### 🟡 Moderate

| Issue | Impact | Location |
|---|---|---|
| **No separation of concerns** | Rendering, business logic, event handling, and DOM manipulation all in one file | `content.ts` |
| **`@ts-ignore` usage** | 3 instances suppress type checking for XHR monkey-patching | `xhrInterceptor.ts`, `content.ts` |
| **InboxSDK coupling** | SDK is used for 2 features (email detection, route listening) but adds ~200KB to bundle | `content.ts` |
| **Hardcoded selectors** | `.G-atb`, `.bsU`, `.aeF`, `.wT` etc. are Gmail's obfuscated class names that can change | `content.ts` |
| **No error boundary** | If `content.ts` throws during init, the entire extension silently breaks | `content.ts` |
| **Duplicated drag logic** | Tab bar and settings modal have nearly identical drag-and-drop implementations | `content.ts` |

### 🟢 Low

| Issue | Impact |
|---|---|
| Website is a separate `package.json` (not a monorepo workspace) | Build/deploy are independent |
| No automated linting in CI | Only local `npm run lint` |
| `experimental/` folder exists but is orphaned | Not referenced in build config |

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
post-build: copies @inboxsdk/core/pageWorld.js           ▶  dist/pageWorld.js
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

**Where to start contributing:** Read `storage.ts` first (cleanest module, 247 lines). Then understand `content.ts`'s `init()` flow. The biggest ROI refactoring would be breaking `content.ts` into `tabs/`, `modals/`, `dragdrop/`, and `unread/` modules.
