<p align="center">
  <img src="src/icons/icon128.png" alt="Gmail Labels & Queries as Tabs" width="96" />
</p>

<h1 align="center">Gmail Labels & Queries as Tabs</h1>

<p align="center">
  <strong>A Chrome extension that injects a user-configurable tab bar into Gmail — navigate labels, searches, and views with one click.</strong>
</p>

<p align="center">
  <a href="https://github.com/PalWorks/Gmail-Labels-Queries-As-Tabs/actions/workflows/ci.yml"><img src="https://github.com/PalWorks/Gmail-Labels-Queries-As-Tabs/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License: MIT"></a>
  <img src="https://img.shields.io/badge/manifest-v3-green.svg" alt="Manifest V3">
  <img src="https://img.shields.io/badge/chrome-120%2B-yellow.svg" alt="Chrome 120+">
  <img src="https://img.shields.io/badge/privacy-zero%20external%20requests-brightgreen.svg" alt="Privacy First">
</p>

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Demo](#demo)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Development](#development)
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

---

## Overview

Gmail Labels & Queries as Tabs replaces the need to dig through Gmail's sidebar by placing your most-used views — labels, search queries, and hash routes — as persistent tabs directly below the toolbar. Tabs are reorderable via drag-and-drop, support real-time unread counts, and sync across all your Chrome instances.

**Core Value:** Instantly switch between Gmail views via a clean, native-feeling tab bar — with zero configuration friction and zero data leaving your browser.

### Who Is This For?

- **Power Gmail users** who rely on labels and saved searches to organize email
- **Multi-account users** who want per-account tab configurations
- **Privacy-conscious users** who want a purely client-side tool with no external network requests

---

## Features

| Feature | Description |
|---------|-------------|
| **Custom Tabs** | Add tabs for Gmail labels, search queries (`is:unread`), or hash views (`#starred`, `#sent`) |
| **Drag & Drop** | Reorder tabs intuitively with full drag-and-drop support (horizontal and vertical) |
| **Real-time Unread Counts** | Live unread badges via Atom feed + XHR interception + DOM scraping fallback |
| **Theme Support** | System / Light / Dark themes with Gmail dark mode detection |
| **Multi-Account** | Independent tab configurations per Gmail account |
| **Export / Import** | Backup and restore your configuration as JSON with schema validation |
| **Cross-Device Sync** | Settings sync across Chrome instances via `chrome.storage.sync` |
| **Welcome Page** | Guided onboarding experience for first-time users |
| **Keyboard Support** | Press <kbd>Esc</kbd> to close modals and exit move mode |
| **Privacy First** | Zero external network requests — everything stays in your browser |

---

## Demo

<p align="center">
  <em>The tab bar integrates seamlessly below Gmail's toolbar, matching both light and dark themes.</em>
</p>

1. **Inbox View** — Tabs appear below the Gmail toolbar with unread badges
2. **Settings Modal** — Add, remove, and reorder tabs; set themes; export/import config
3. **Drag & Drop** — Reorder tabs with smooth visual feedback

---

## Architecture

The extension operates across three Chrome execution contexts:

```
┌─────────────────────────────────────────────────────────┐
│                    Gmail Web Page                        │
│                                                         │
│  ┌───────────────────────┐  ┌────────────────────────┐  │
│  │   Content Script       │  │   XHR Interceptor      │  │
│  │   (Isolated World)     │  │   (Main World)         │  │
│  │                        │  │                        │  │
│  │  ● Tab bar rendering   │  │  ● Monkey-patches XHR  │  │
│  │  ● Settings modal      │  │  ● Parses Gmail API    │  │
│  │  ● Theme management    │  │  ● Extracts unread     │  │
│  │  ● Drag & drop         │  │    counts              │  │
│  │  ● Atom feed counts    │  │                        │  │
│  │  ● DOM scraping        │  │  Communicates via      │  │
│  │                        │◄─┤  window.postMessage    │  │
│  └────────┬───────────────┘  └────────────────────────┘  │
│           │                                              │
└───────────┼──────────────────────────────────────────────┘
            │ chrome.runtime.sendMessage
            ▼
┌─────────────────────────┐
│   Background Service    │
│   Worker (MV3)          │
│                         │
│  ● Extension lifecycle  │
│  ● File downloads       │
│  ● Install/update hooks │
│  ● Action click handler │
└─────────────────────────┘
```

### Unread Count Strategy

Unread counts use a three-tier waterfall for maximum reliability:

1. **Atom Feed** — Fetches `mail.google.com/.../feed/atom/{label}` for accurate counts
2. **XHR Interception** — Intercepts Gmail's internal API calls in the Main World for real-time updates
3. **DOM Scraping** — Parses Gmail sidebar badges as a last resort

### Data Flow

```
User clicks tab → Gmail hash navigation (#inbox, #label/Work, #search/query)
                → URL changes → Gmail re-renders → Content script detects route
                → Updates active tab highlight
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Language** | TypeScript (ES2022, strict mode) |
| **Bundler** | esbuild (4 entry points, minified, console-stripped) |
| **Extension Platform** | Chrome Manifest V3 |
| **Route Detection** | InboxSDK (`@inboxsdk/core`) |
| **Storage** | `chrome.storage.sync` (cross-device, per-account namespaced) |
| **Testing** | Jest + ts-jest + jsdom |
| **CI/CD** | GitHub Actions (test → build → verify → artifact) |
| **Marketing Website** | Vite + React + TypeScript |

---

## Getting Started

### Prerequisites

- **Node.js** ≥ 20
- **npm** ≥ 9
- **Google Chrome** ≥ 120

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
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the `dist/` directory

### Development

```bash
# Watch mode — rebuilds on file changes
npm run watch

# Note: Static file changes (CSS, HTML, icons) require a manual copy
npm run copy-assets

# Run tests
npm test

# Lint
npm run lint
```

After making changes, click the **reload** button on `chrome://extensions` to pick up the new build.

---

## Configuration

All configuration is managed through the in-Gmail settings modal (gear icon on the tab bar). No separate options page is needed.

### Storage Schema

Settings are stored per-account in `chrome.storage.sync` under the key `account_{email}`:

```typescript
interface Settings {
  tabs: Tab[];
  theme: 'system' | 'light' | 'dark';
  showUnreadCount: boolean;
}

interface Tab {
  id: string;       // UUID
  title: string;    // Display name
  type: 'label' | 'hash';
  value: string;    // Gmail label name or hash route
}
```

### Storage Limits

| Limit | Value |
|-------|-------|
| Total sync storage | 102,400 bytes |
| Per-item max | 8,192 bytes |
| Max items | 512 |

---

## Usage

### Adding a Label Tab

1. Open Gmail → click the ⚙️ on the tab bar
2. Type a Gmail label name (e.g., `Work`, `Personal/Projects`)
3. Click **Add**

### Adding a Search Query Tab

1. Open Gmail → run your search (e.g., `is:unread from:boss`)
2. Copy the URL from the address bar
3. Paste into the "Add tab" input → give it a custom title

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

- **Export**: Settings modal → Export → downloads `gmail-tabs-config.json`
- **Import**: Settings modal → Import → select JSON file (schema-validated)

---

## Project Structure

```
Gmail-Labels-As-Tabs/
├── manifest.json                 # Chrome MV3 manifest
├── package.json                  # Dependencies & scripts
├── tsconfig.json                 # TypeScript config (ES2022, strict)
├── build.js                      # esbuild config (4 entry points)
├── jest.config.js                # Test config (ts-jest, jsdom)
│
├── src/                          # Extension source code
│   ├── content.ts                # Main content script (orchestrator)
│   ├── background.ts             # Service worker (lifecycle, downloads)
│   ├── xhrInterceptor.ts         # Main World XHR interceptor
│   ├── xhrInterceptor.test.ts    # Tests for XHR parsing logic
│   ├── welcome.ts                # Onboarding page logic
│   ├── welcome.html              # Onboarding page markup
│   ├── welcome.css               # Onboarding page styles
│   ├── modules/
│   │   ├── state.ts              # Shared state & DOM selectors
│   │   ├── tabs.ts               # Tab bar rendering & navigation
│   │   ├── modals.ts             # Settings & manage modals
│   │   ├── dragdrop.ts           # Drag-and-drop reordering
│   │   ├── unread.ts             # Unread count (feed + XHR + DOM)
│   │   └── theme.ts              # Theme management & Gmail dark detection
│   ├── utils/
│   │   └── storage.ts            # chrome.storage.sync wrapper
│   ├── ui/
│   │   └── toolbar.css           # Design system (CSS custom properties)
│   └── icons/                    # Extension icons (16/32/48/128)
│
├── test/
│   └── storage.test.ts           # Storage utility unit tests
│
├── dist/                         # Built extension (load this in Chrome)
├── website/                      # Marketing site (Vite + React)
├── .github/workflows/ci.yml      # CI pipeline
├── .planning/                    # Project planning docs
│   ├── PROJECT.md                # Core requirements & decisions
│   └── REQUIREMENTS.md           # Detailed requirement tracking
├── ARCHITECTURE.md               # Full architecture analysis
└── AUDIT.md                      # Code quality audit
```

---

## Testing

```bash
# Run all tests
npm test

# Run with coverage
npx jest --coverage

# Run a specific test file
npx jest test/storage.test.ts
```

### Test Coverage

| Area | Tests | Coverage |
|------|-------|----------|
| Storage API (`addTab`, `removeTab`, `updateTab`, etc.) | 12 | Full CRUD + edge cases |
| Legacy migration (`migrateLegacySettingsIfNeeded`) | 4 | Three format generations |
| Import schema validation | 7 | Invalid/valid schemas |
| **Total** | **23** | ✅ All passing |

Tests mock `chrome.storage.sync` and `chrome.runtime` using an in-memory store, with `crypto.randomUUID` polyfilled for the test environment.

---

## CI/CD

The project uses GitHub Actions with the following pipeline:

```yaml
Push/PR to main → Install → Test → Build → Verify → Artifact
```

| Step | Description |
|------|------------|
| **Install** | `npm ci` with npm cache |
| **Test** | `npm test` (Jest, 23 tests) |
| **Build** | `npm run build` (esbuild, minified) |
| **Verify** | Asserts zero `console.log` in production bundle |
| **Artifact** | Uploads `dist/` for 7-day retention |

---

## Deployment

### Chrome Web Store

```bash
# Build the production bundle
npm run build

# Package as a zip for Chrome Web Store upload
npm run package
# → Creates extension.zip in the project root
```

Upload `extension.zip` to the [Chrome Developer Dashboard](https://chrome.google.com/webstore/devconsole).

### Marketing Website

The `website/` directory contains a separate Vite + React project:

```bash
cd website
npm install
npm run dev      # Local development
npm run build    # Production build → website/dist/
```

---

## Roadmap

### v1.0 — ✅ Shipped

- Custom tabs for labels, searches, and hash views
- Drag-and-drop reordering
- Real-time unread counts (Atom + XHR + DOM)
- System / Light / Dark themes
- Multi-account support
- Export / Import configuration
- Cross-device sync
- Welcome onboarding page
- CI/CD pipeline

### v2.0 — Planned

- [ ] Keyboard shortcuts for tab switching (<kbd>Ctrl+1</kbd>, <kbd>Ctrl+2</kbd>, etc.)
- [ ] Tab grouping and categories
- [ ] Custom tab icons and colors
- [ ] Nested label support (parent/child hierarchies)
- [ ] Standalone options page
- [ ] Firefox extension port (WebExtension APIs)

---

## Contributing

Contributions are welcome! Here's how to get started:

1. **Fork** the repository
2. **Create a branch**: `git checkout -b feat/your-feature`
3. **Make changes** and ensure tests pass: `npm test`
4. **Build** to verify: `npm run build`
5. **Submit a PR** targeting `main`

### Development Guidelines

- TypeScript strict mode — no `any` unless absolutely necessary
- All user-facing strings must be HTML-escaped (XSS prevention)
- No external network requests (privacy-first principle)
- Production builds strip all `console.log` via esbuild's `drop` option
- Keep modules focused — one responsibility per file

### Code Quality

```bash
npm run lint      # ESLint
npm test          # Jest (23 tests)
npm run build     # Verify build succeeds
```

---

## Privacy

This extension is designed with privacy as a non-negotiable principle:

- **Zero external requests** — No analytics, no telemetry, no third-party servers
- **Local storage only** — All data stored in `chrome.storage.sync` (Google's infrastructure)
- **No user data collection** — The extension has no server, no database, no tracking
- **Minimal permissions** — Only `storage`, `downloads`, and `management`
- **Open source** — Full codebase available for audit

The Atom feed used for unread counts fetches from `mail.google.com` (same origin) — no cross-origin requests are made.

---

## License

This project is licensed under the **MIT License**. See [LICENSE](LICENSE) for details.

---

## Acknowledgements

- [InboxSDK](https://www.inboxsdk.com/) — Gmail route detection and user identity
- [esbuild](https://esbuild.github.io/) — Lightning-fast TypeScript bundling
- [Jest](https://jestjs.io/) — Testing framework
- Chrome Extensions team — Manifest V3 platform

---

<p align="center">
  <strong>Built with ❤️ for Gmail power users</strong><br>
  <a href="https://palworks.github.io/Gmail-Labels-Queries-As-Tabs">Website</a> · 
  <a href="https://github.com/PalWorks/Gmail-Labels-Queries-As-Tabs/issues">Report Bug</a> · 
  <a href="https://github.com/PalWorks/Gmail-Labels-Queries-As-Tabs/issues">Request Feature</a>
</p>
