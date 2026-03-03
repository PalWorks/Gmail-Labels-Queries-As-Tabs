<p align="center">
  <img src="src/icons/icon128.png" alt="Gmail Labels & Queries as Tabs" width="96" />
</p>

<h1 align="center">Gmail Labels & Queries as Tabs</h1>

<p align="center">
  <strong>A Chrome extension that injects a configurable tab bar into Gmail for one-click navigation to labels, search queries, and custom views.</strong>
</p>

<p align="center">
  <a href="https://github.com/PalWorks/Gmail-Labels-Queries-As-Tabs/actions/workflows/ci.yml"><img src="https://github.com/PalWorks/Gmail-Labels-Queries-As-Tabs/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://chromewebstore.google.com/detail/gmail-labels-and-search-q/jemjnjlplglfoiipcjhoacneigdgfmde"><img src="https://img.shields.io/badge/chrome%20web%20store-published-4285F4?logo=googlechrome&logoColor=white" alt="Chrome Web Store"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License: MIT"></a>
  <img src="https://img.shields.io/badge/manifest-v3-green.svg" alt="Manifest V3">
  <img src="https://img.shields.io/badge/chrome-120%2B-yellow.svg" alt="Chrome 120+">
  <img src="https://img.shields.io/badge/privacy-zero%20external%20requests-brightgreen.svg" alt="Privacy First">
</p>

<p align="center">
  <a href="https://chromewebstore.google.com/detail/gmail-labels-and-search-q/jemjnjlplglfoiipcjhoacneigdgfmde">Install from Chrome Web Store</a> · 
  <a href="https://palworks.github.io/Gmail-Labels-As-Tabs">Website</a> · 
  <a href="https://github.com/PalWorks/Gmail-Labels-Queries-As-Tabs/issues">Report Bug</a>
</p>

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
- [Configuration](#configuration)
- [Usage](#usage)
- [Project Structure](#project-structure)
- [Testing](#testing)
- [CI/CD](#cicd)
- [Deployment](#deployment)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [Privacy](#privacy)
- [License](#license)
- [Acknowledgements](#acknowledgements)

## Overview

Gmail Labels & Queries as Tabs replaces the need to navigate Gmail's sidebar by placing your most used views as persistent, clickable tabs directly below the toolbar. Tabs support labels, search queries, and Gmail hash routes. They are reorderable via drag and drop, show real-time unread counts, and sync across Chrome instances through `chrome.storage.sync`.

**Core Value:** Navigate between Gmail views instantly through a native feeling tab bar with zero configuration friction and zero data leaving your browser.

### Who Is This For?

| Audience | Why |
|----------|-----|
| **Power Gmail users** | Navigate labels and saved searches without the sidebar |
| **Multi-account users** | Independent tab configurations per Gmail account |
| **Privacy-focused users** | Fully client-side tool with zero external network requests |
| **Teams** | Exportable configs let you share tab setups across team members |

## Features

| Feature | Description |
|---------|-------------|
| **Custom Tabs** | Pin tabs for Gmail labels, search queries (`is:unread from:boss`), or hash views (`#starred`, `#sent`) |
| **Drag & Drop** | Reorder tabs with full horizontal and multi-row drag and drop |
| **Real-time Unread Counts** | Live badges via a three-tier strategy: Atom feed, XHR interception, and DOM scraping fallback |
| **Theme Support** | System, Light, and Dark themes with automatic Gmail dark mode detection |
| **Multi-Account** | Per-account tab configurations namespaced by email address |
| **Automation Rules** | Generate Google Apps Script code for automated email cleanup (trash, archive, mark read, move) |
| **Export / Import** | Backup and restore configuration as schema-validated JSON |
| **Cross-Device Sync** | Settings sync across Chrome instances via `chrome.storage.sync` |
| **Options Dashboard** | Full-featured settings page with theme control, tab management, automation rules, user guide, privacy info, and logging |
| **Welcome Onboarding** | Guided setup for first-time users |
| **Keyboard Support** | <kbd>Esc</kbd> to close modals and exit move mode |
| **Privacy First** | Zero external network requests, everything stays local |

## Architecture

The extension operates across three Chrome execution contexts, each with a distinct responsibility:

```
┌──────────────────────────────────────────────────────────┐
│                      Gmail Web Page                       │
│                                                           │
│  ┌────────────────────────┐  ┌─────────────────────────┐  │
│  │   Content Script        │  │   XHR Interceptor       │  │
│  │   (Isolated World)      │  │   (Main World)          │  │
│  │                         │  │                         │  │
│  │  ● Tab bar rendering    │  │  ● Monkey-patches XHR   │  │
│  │  ● Settings modal       │  │  ● Parses Gmail API     │  │
│  │  ● Theme management     │  │  ● Extracts unread      │  │
│  │  ● Drag & drop          │  │    label counts         │  │
│  │  ● Atom feed counts     │  │                         │  │
│  │  ● DOM scraping counts  │  │  Communicates via       │  │
│  │  ● Modals (pin, edit,   │◄─┤  CustomEvent dispatch   │  │
│  │    delete, import)      │  │                         │  │
│  └──────────┬──────────────┘  └─────────────────────────┘  │
│             │                                              │
└─────────────┼──────────────────────────────────────────────┘
              │ chrome.runtime.sendMessage
              ▼
┌──────────────────────────┐     ┌─────────────────────────┐
│   Background Service     │     │   Options Page           │
│   Worker (MV3)           │     │   (options.html)         │
│                          │     │                          │
│  ● Extension lifecycle   │     │  ● Tab management UI     │
│  ● File downloads        │     │  ● Theme preferences     │
│  ● Install/update hooks  │     │  ● Automation rules      │
│  ● Action click handler  │     │  ● Import/Export          │
│  ● Uninstall flow        │     │  ● Privacy dashboard     │
└──────────────────────────┘     └─────────────────────────┘
```

### Unread Count Strategy

Unread counts use a three-tier waterfall for maximum reliability:

1. **Atom Feed**: Fetches `mail.google.com/.../feed/atom/{label}` for accurate per-label counts
2. **XHR Interception**: Intercepts Gmail's internal sync API calls in the Main World for real-time updates
3. **DOM Scraping**: Parses Gmail sidebar badges as a last resort

### Key Architectural Patterns

| Pattern | Where | Purpose |
|---------|-------|---------|
| **Dual-World Injection** | content.ts + xhrInterceptor.ts | Content script cannot see Gmail XHR; a Main World script patches XMLHttpRequest and ferries data back via CustomEvent |
| **Per-Account Namespacing** | storage.ts | Settings keyed by `account_{email}` in chrome.storage.sync |
| **CSS Custom Properties** | toolbar.css | Full theming via CSS variables with `prefers-color-scheme` media query and force-override classes |
| **Optimistic UI** | dragdrop.ts | UI updates immediately on drop; storage write happens asynchronously |
| **Progressive Enhancement** | content.ts init() | DOM-based detection runs immediately; InboxSDK loads in parallel for enhanced route detection |
| **Strategy Pattern** | unread.ts | Three unread count strategies attempted in waterfall order |

### Data Flow

```
User clicks tab  →  window.location.hash changes (#inbox, #label/Work, #search/query)
                 →  Gmail re-renders
                 →  Content script detects route change
                 →  Updates active tab highlight
```

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Language** | TypeScript (ES2022, strict mode) |
| **Bundler** | esbuild (5 entry points, minified, console-stripped) |
| **Extension Platform** | Chrome Manifest V3 |
| **Route Detection** | InboxSDK (`@inboxsdk/core`) |
| **Storage** | `chrome.storage.sync` (cross-device, per-account namespaced) |
| **Testing** | Jest + ts-jest + jsdom (20 test files, 290+ test cases) |
| **Linting** | ESLint + @typescript-eslint |
| **Formatting** | Prettier (single quotes, 4-space indent, 120 char width) |
| **CI/CD** | GitHub Actions (test, lint, build, verify, artifact) |
| **Marketing Website** | Vite + React + TypeScript (separate project) |

## Getting Started

### Prerequisites

- **Node.js** >= 20
- **npm** >= 9
- **Google Chrome** >= 120

### Installation

```bash
# Clone the repository
git clone https://github.com/PalWorks/Gmail-Labels-Queries-As-Tabs.git
cd Gmail-Labels-Queries-As-Tabs

# Install dependencies
npm install

# Build the extension
npm run build
```

### Load in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode** (top right toggle)
3. Click **Load unpacked**
4. Select the `dist/` directory

### Development

```bash
# Watch mode: rebuilds TypeScript on file changes
npm run watch

# Copy static assets (CSS, HTML, icons, locales) after changes
npm run copy-assets

# Run the full test suite
npm test

# Lint source and test files
npm run lint

# Auto-fix lint issues
npm run lint:fix

# Format all TypeScript files
npm run format
```

After making changes, click the **reload** button on `chrome://extensions` to load the updated build.

## Configuration

All configuration is managed through two surfaces:

1. **In-Gmail Settings Modal**: Click the gear icon on the tab bar for quick access to tab management, theme switching, and export/import
2. **Options Page**: Right-click the extension icon and select "Options" for the full dashboard with automation rules, user guide, privacy info, and logging

### Storage Schema

Settings are stored per-account in `chrome.storage.sync` under the key `account_{email}`:

```typescript
interface Settings {
  tabs: Tab[];
  theme: 'system' | 'light' | 'dark';
  showUnreadCount: boolean;
  rules: Rule[];
  sheetUrl: string;
}

interface Tab {
  id: string;       // UUID
  title: string;    // Display name
  type: 'label' | 'hash';
  value: string;    // Gmail label name or hash route
}

interface Rule {
  tabId: string;      // References a Tab.id
  action: 'trash' | 'archive' | 'markRead' | 'move';
  targetLabel?: string; // Required when action is 'move'
  olderThanDays: number;
}
```

### Storage Limits

| Limit | Value |
|-------|-------|
| Total sync storage | 102,400 bytes |
| Per-item max | 8,192 bytes |
| Max items | 512 |

### Permissions

| Permission | Purpose |
|------------|---------|
| `storage` | Save tab configurations and rules |
| `downloads` | Export settings as a JSON file |
| `management` | Enable self-uninstall from the settings page |
| `host_permissions` (mail.google.com) | Inject the tab bar into Gmail's UI |

## Usage

### Adding a Label Tab

1. Open Gmail and click the ⚙️ icon on the tab bar (or open the Options page)
2. Type a Gmail label name (e.g., `Work`, `Personal/Projects`)
3. Click **Add**

### Adding a Search Query Tab

1. Run your search in Gmail (e.g., `is:unread from:boss`)
2. Copy the URL from the address bar
3. Paste into the "Add tab" input and provide a custom title

### Adding a Hash View Tab

Type any Gmail hash route directly:

| Hash | View |
|------|------|
| `#inbox` | Inbox |
| `#sent` | Sent Mail |
| `#starred` | Starred |
| `#drafts` | Drafts |
| `#label/Work` | "Work" label |
| `#search/is:unread` | All unread |

### Export / Import

- **Export**: Settings modal or Options page > Export Config > downloads `gmail-tabs-config.json`
- **Import**: Settings modal or Options page > Import Config > select JSON file (schema validated before import)

### Automation Rules

1. Open the Options page > Automation Rules
2. Configure per-tab actions (trash, archive, mark read, or move to another label)
3. Set the "older than" threshold in days
4. Click **Generate & Copy Script**
5. Paste the generated Google Apps Script into [script.google.com](https://script.google.com)
6. Set up a daily trigger for automated execution

## Project Structure

```
Gmail-Labels-As-Tabs/
├── manifest.json                     # Chrome MV3 manifest
├── package.json                      # Dependencies & scripts
├── tsconfig.json                     # TypeScript config (ES2022, strict)
├── build.js                          # esbuild config (5 entry points)
├── jest.config.js                    # Test config (ts-jest, jsdom, coverage thresholds)
├── .eslintrc.json                    # ESLint + @typescript-eslint rules
├── .prettierrc                       # Prettier formatting rules
│
├── src/                              # Extension source code
│   ├── content.ts                    # Main content script (orchestrator)
│   ├── background.ts                 # Service worker (lifecycle, downloads)
│   ├── xhrInterceptor.ts             # Main World XHR interceptor for unread counts
│   ├── options.ts                    # Options page logic
│   ├── options.html                  # Options page markup (6 sections)
│   ├── options.css                   # Options page styles
│   ├── welcome.ts                    # Onboarding page logic
│   ├── welcome.html / welcome.css    # Onboarding page markup & styles
│   │
│   ├── modules/                      # Feature modules (extracted from content.ts)
│   │   ├── state.ts                  # Shared state & DOM selectors
│   │   ├── tabs.ts                   # Tab bar rendering & navigation
│   │   ├── dragdrop.ts               # Drag and drop reordering
│   │   ├── theme.ts                  # Theme management & Gmail dark detection
│   │   ├── unread.ts                 # Unread count (feed + XHR + DOM strategies)
│   │   ├── rules.ts                  # Automation rules & Apps Script generation
│   │   └── modals/                   # Modal dialogs (7 files)
│   │       ├── index.ts              # Barrel export
│   │       ├── pinModal.ts           # Add/pin new tab modal
│   │       ├── editModal.ts          # Edit tab title/value
│   │       ├── deleteModal.ts        # Delete tab confirmation
│   │       ├── importModal.ts        # Import configuration
│   │       ├── settingsModal.ts      # Settings & preferences
│   │       └── uninstallModal.ts     # Uninstall flow with data export
│   │
│   ├── utils/                        # Shared utilities
│   │   ├── storage.ts                # chrome.storage.sync wrapper (CRUD, migration)
│   │   ├── importExport.ts           # Import/Export logic with schema validation
│   │   ├── selectors.ts              # DOM selector constants
│   │   └── tabListRenderer.ts        # Reusable tab list rendering
│   │
│   ├── ui/
│   │   └── toolbar.css               # Design system (CSS custom properties, theming)
│   │
│   └── icons/                        # Extension icons (16/32/48/128 png)
│
├── test/                             # Test suite (20 files)
│   ├── background.test.ts            # Service worker tests
│   ├── content.test.ts               # Content script tests
│   ├── dragdrop.test.ts              # Drag and drop tests
│   ├── tabs.test.ts                  # Tab rendering tests
│   ├── theme.test.ts                 # Theme management tests
│   ├── unread.test.ts                # Unread count tests
│   ├── storage.test.ts               # Storage CRUD tests
│   ├── importExport.test.ts          # Import/Export tests
│   ├── tabListRenderer.test.ts       # Tab list renderer tests
│   ├── state.test.ts                 # State management tests
│   ├── rules.test.ts                 # Automation rules tests
│   ├── options.test.ts               # Options page tests
│   ├── settingsModal.test.ts         # Settings modal tests
│   ├── welcome.test.ts               # Welcome page tests
│   ├── xhrInterceptor.test.ts        # XHR interceptor tests
│   └── modals/                       # Modal-specific tests
│       ├── pinModal.test.ts
│       ├── editModal.test.ts
│       ├── deleteModal.test.ts
│       ├── importModal.test.ts
│       └── uninstallModal.test.ts
│
├── _locales/en/messages.json         # Chrome i18n strings
├── dist/                             # Built extension (load this in Chrome)
├── website/                          # Marketing site (Vite + React, independent project)
├── .github/workflows/
│   ├── ci.yml                        # CI pipeline (test, lint, build, verify)
│   └── deploy_website.yml            # GitHub Pages deployment for website
│
├── ARCHITECTURE.md                   # Detailed architecture analysis
├── AUDIT.md                          # Code quality audit
└── LICENSE                           # MIT License
```

## Testing

```bash
# Run all tests
npm test

# Run with coverage report
npx jest --coverage

# Run a specific test file
npx jest test/storage.test.ts

# Run modal tests only
npx jest test/modals/
```

### Test Suite Summary

| Area | Files | Focus |
|------|-------|-------|
| Storage API | `storage.test.ts` | Full CRUD, migration, multi-account, edge cases |
| XHR Interceptor | `xhrInterceptor.test.ts` | Gmail JSON parsing, CustomEvent dispatch, error handling |
| Unread Counts | `unread.test.ts` | Atom feed, XHR strategy, DOM scraping fallback |
| Drag & Drop | `dragdrop.test.ts` | Horizontal/vertical drag, reorder logic, edge cases |
| Tab Rendering | `tabs.test.ts` | Tab creation, active state, hash navigation |
| Theme | `theme.test.ts` | System/Light/Dark, Gmail dark mode detection |
| Options Page | `options.test.ts` | Account detection, section navigation, rule UI |
| Import/Export | `importExport.test.ts` | Schema validation, export format, round-trip |
| Modals | `modals/*.test.ts` | Pin, edit, delete, import, uninstall modal logic |
| Background | `background.test.ts` | Install hooks, message handling, downloads |
| Content Script | `content.test.ts` | Initialization, injection, observer setup |
| Rules | `rules.test.ts` | Apps Script generation, rule validation |
| State | `state.test.ts` | Shared state, DOM selector management |
| Tab List Renderer | `tabListRenderer.test.ts` | Reusable rendering logic |
| Welcome | `welcome.test.ts` | Onboarding page logic |
| Settings Modal | `settingsModal.test.ts` | Theme toggling, settings persistence |

**Total: 20 test files, 290+ test cases.**

The test environment uses `jsdom` with manually mocked `chrome.storage.sync`, `chrome.runtime`, and `crypto.randomUUID`.

### Coverage Thresholds

Configured in `jest.config.js`:

| Metric | Threshold |
|--------|-----------|
| Statements | 60% |
| Branches | 45% |
| Functions | 60% |
| Lines | 60% |

## CI/CD

The CI pipeline runs on every push and pull request to `main`:

```
Push/PR → Install → Test + Coverage → Lint → Build → Verify → Artifact
```

### Pipeline Steps

| Step | What It Does |
|------|-------------|
| **Install** | `npm ci` with npm cache |
| **Test** | `npm test --coverage` (Jest, 290+ tests) |
| **Lint** | `npm run lint` (ESLint with @typescript-eslint) |
| **Build** | `npm run build` (esbuild, minified, console-stripped) |
| **Console Check** | Asserts zero `console.log` in production bundle |
| **Package** | Creates `extension.zip` and validates it is under the 5MB CWS limit |
| **Version Parity** | Verifies `manifest.json` and `package.json` versions match |
| **@ts-ignore Check** | Ensures zero `@ts-ignore` comments in source |
| **Dist Verification** | Confirms all 11 required files exist in `dist/` |
| **Artifacts** | Uploads `dist/`, `extension.zip`, and coverage report (7-day retention) |

## Deployment

### Chrome Web Store

```bash
# Build the production bundle
npm run build

# Package as a zip for Chrome Web Store upload
npm run package
# Creates extension.zip in the project root
```

Upload `extension.zip` to the [Chrome Developer Dashboard](https://chrome.google.com/webstore/devconsole).

**Published listing:** [Gmail Labels as Tabs on Chrome Web Store](https://chromewebstore.google.com/detail/gmail-labels-and-search-q/jemjnjlplglfoiipcjhoacneigdgfmde)

### Marketing Website

The `website/` directory contains a separate Vite + React project deployed via GitHub Pages:

```bash
cd website
npm install
npm run dev      # Local development
npm run build    # Production build
```

Deployment is automated via `.github/workflows/deploy_website.yml` on push to `main`.

## Roadmap

### v1.0: Shipped

- Custom tabs for labels, searches, and hash views
- Drag and drop reordering
- Real-time unread counts (Atom + XHR + DOM)
- System, Light, and Dark themes
- Multi-account support
- Export and Import configuration
- Cross-device sync
- Welcome onboarding page

### v1.1: Shipped

- Standalone options dashboard with sidebar navigation
- Automation rules with Google Apps Script generation
- User guide with step by step setup instructions
- Privacy dashboard
- Activity logging via Google Sheets integration
- Modular architecture (state, tabs, dragdrop, theme, unread, rules, modals)
- CI/CD pipeline with 10 verification steps

### v2.0: Planned

- [ ] Keyboard shortcuts for tab switching (<kbd>Ctrl+1</kbd>, <kbd>Ctrl+2</kbd>, etc.)
- [ ] Tab grouping and categories
- [ ] Custom tab icons and colors
- [ ] Nested label support (parent/child hierarchies)
- [ ] Firefox extension port (WebExtension APIs)

## Contributing

Contributions are welcome. Here is how to get started:

1. **Fork** the repository
2. **Create a branch**: `git checkout -b feat/your-feature`
3. **Make changes** and verify tests pass: `npm test`
4. **Lint your code**: `npm run lint`
5. **Build** to verify: `npm run build`
6. **Submit a PR** targeting `main`

### Development Guidelines

- TypeScript strict mode is enforced; avoid `any` unless absolutely necessary
- All user-facing strings must be HTML escaped (XSS prevention)
- No external network requests (privacy-first principle)
- Production builds strip all `console.log` via esbuild's `drop` option
- Keep modules focused with a single responsibility per file
- Format code with Prettier before committing: `npm run format`
- Coverage thresholds are enforced in CI; new code should maintain or improve coverage

### Code Quality Commands

```bash
npm run lint      # ESLint with @typescript-eslint
npm run lint:fix  # Auto-fix lint issues
npm run format    # Prettier formatting
npm test          # Jest (290+ tests)
npm run build     # Verify production build
```

## Privacy

This extension is designed with privacy as a non-negotiable principle:

- **Zero external requests**: No analytics, no telemetry, no third-party servers
- **Local storage only**: All data stored in `chrome.storage.sync` (Google's infrastructure, synced via your Google account)
- **No user data collection**: The extension has no server, no database, no tracking
- **Minimal permissions**: Only `storage`, `downloads`, and `management`
- **Open source**: Full codebase available for audit

The Atom feed used for unread counts fetches from `mail.google.com` (same origin). No cross-origin requests are made.

The automation rules feature generates Google Apps Script code that runs entirely under your own Google account. The extension has no access to your Gmail API, no OAuth tokens, and no API keys.

## License

This project is licensed under the **MIT License**. See [LICENSE](LICENSE) for details.

## Acknowledgements

- [InboxSDK](https://www.inboxsdk.com/) for Gmail route detection and user identity
- [esbuild](https://esbuild.github.io/) for lightning fast TypeScript bundling
- [Jest](https://jestjs.io/) for the testing framework
- [Chrome Extensions team](https://developer.chrome.com/docs/extensions/) for the Manifest V3 platform

<p align="center">
  <strong>Built with care for Gmail power users</strong><br>
  <a href="https://palworks.github.io/Gmail-Labels-As-Tabs">Website</a> · 
  <a href="https://chromewebstore.google.com/detail/gmail-labels-and-search-q/jemjnjlplglfoiipcjhoacneigdgfmde">Chrome Web Store</a> · 
  <a href="https://github.com/PalWorks/Gmail-Labels-Queries-As-Tabs/issues">Report Bug</a> · 
  <a href="https://github.com/PalWorks/Gmail-Labels-Queries-As-Tabs/issues">Request Feature</a>
</p>
