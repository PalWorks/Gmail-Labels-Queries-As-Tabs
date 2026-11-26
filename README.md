<p align="center">
  <img src="src/icons/icon128.png" alt="Gmail Labels and Search Queries as Tabs" width="96" />
</p>

<h1 align="center">Gmail Labels and Search Queries as Tabs</h1>

<p align="center">
  <strong>A Chrome extension that injects a configurable tab bar into Gmail for one-click navigation to labels, search queries, and custom views.</strong>
</p>

<p align="center">
  <a href="https://github.com/PalWorks/Gmail-Labels-Queries-As-Tabs/actions/workflows/ci.yml"><img src="https://github.com/PalWorks/Gmail-Labels-Queries-As-Tabs/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://chromewebstore.google.com/detail/gmail-labels-and-search-q/jemjnjlplglfoiipcjhoacneigdgfmde"><img src="https://img.shields.io/badge/chrome%20web%20store-published-4285F4?logo=googlechrome&logoColor=white" alt="Chrome Web Store"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-AGPL--3.0%20%2B%20commercial-blue.svg" alt="License: AGPL-3.0, commercial licence available"></a>
  <img src="https://img.shields.io/badge/manifest-v3-green.svg" alt="Manifest V3">
  <img src="https://img.shields.io/badge/chrome-120%2B-yellow.svg" alt="Chrome 120+">
  <img src="https://img.shields.io/badge/privacy-no%20telemetry-brightgreen.svg" alt="Privacy First">
</p>

<p align="center">
  <a href="https://chromewebstore.google.com/detail/gmail-labels-and-search-q/jemjnjlplglfoiipcjhoacneigdgfmde">Install from Chrome Web Store</a> · 
  <a href="https://palworks.github.io/Gmail-Labels-As-Tabs/">Website</a> · 
  <a href="https://youtu.be/PtjGAnSIG5o">Demo video</a> · 
  <a href="https://github.com/PalWorks/Gmail-Labels-Queries-As-Tabs/issues">Report Bug</a>
</p>

Last updated: 2026-11-26T09:09:48+00:00 (v1.9.0)

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
- [Documentation](#documentation)
- [Contributing](#contributing)
- [Privacy](#privacy)
- [License](#license)
- [Acknowledgements](#acknowledgements)

## Overview

Gmail Labels and Search Queries as Tabs replaces the need to navigate Gmail's sidebar by placing your most used views as persistent, clickable tabs directly below the toolbar. Tabs support labels, search queries, and Gmail hash routes. They are reorderable via drag and drop, show real-time unread counts, and sync across Chrome instances through `chrome.storage.sync`.

**Core Value:** Navigate between Gmail views instantly through a native feeling tab bar with zero configuration friction and zero data leaving your browser.

### Who Is This For?

**Table R1: Audiences**

| Audience | Why |
|----------|-----|
| **Power Gmail users** | Navigate labels and saved searches without the sidebar |
| **Multi-account users** | Independent tab configurations per Gmail account |
| **Privacy-focused users** | Client-side tool with no background network requests. Three things can ever leave the browser and none happens on its own: feedback you choose to send, a one-question page on our website that Chrome opens after you uninstall, and website icons for sender icons if you turn them on |
| **Teams** | Exportable configs let you share tab setups across team members |

## Features

**Table R2: Features**

| Feature | Description |
|---------|-------------|
| **Custom Tabs** | Pin tabs for Gmail labels, search queries (`is:unread from:boss`), or hash views (`#starred`, `#sent`) |
| **"Show as Tabs" in Gmail's own menu** | The three-dot menu beside any label, including sublabels, ends with "Show as Tabs", or "Remove from Tabs" if it already has one. The item hardcodes no Gmail class name: it clones one of Gmail's own menu items, so it inherits Gmail's styling and survives a Gmail rename. It lights up under the pointer like Gmail's own items, using a highlight learned from them at runtime. See ADR-022 and ADR-024 |
| **Sender icons (opt-in)** | A chip at the start of each inbox row naming the sender's organisation (`email.mashreq.com` shows as `mashreq.com`), with a coloured letter, or the organisation's own icon if you also turn on website icons. Mailbox providers such as gmail.com show the sender's initial instead of the provider's logo, unless you choose otherwise. Found by ARIA roles with a fallback behind every step, no InboxSDK, and applied live without a Gmail reload. See ADR-027 |
| **Custom Tab Colors** | Assign one of twelve optional theme-safe palette colors to any tab (accent dot + active underline); editable from the in-Gmail modal and the options page |
| **Rule Starter Templates** | One-click presets that set up a common cleanup tab + enabled rule (feature-flagged) |
| **Drag & Drop** | Reorder tabs with full horizontal and multi-row drag and drop |
| **Real-time Unread Counts** | Each badge copies the count Gmail shows on the same view's row in its own sidebar, follows it as it changes, and works in any Gmail language. A label the sidebar hides falls back to Gmail's Atom feed. See ADR-030 |
| **Theme Support** | Light (default), Dark, and a System theme that follows **Gmail's own theme**, not the desktop's; browser-wide across all accounts. No surface paints a theme it is still guessing at, so nothing flashes on the way in |
| **Multi-Account** | Per-account tab configurations namespaced by email address. Settings opened from Gmail open on that Gmail account |
| **Automation Rules** | Generate Google Apps Script code for automated email cleanup (trash, archive, mark read, move) |
| **Export / Import** | Backup and restore configuration as schema-validated JSON |
| **Cross-Device Sync** | Settings sync across Chrome instances via `chrome.storage.sync` |
| **Options Dashboard** | Full-featured settings page with theme control, tab management, automation rules, user guide, privacy info, and logging |
| **Guided tour** | Six steps that demonstrate the tab bar in a working miniature inside the panel, not screenshots of it. Opens over Gmail so the theme step retints your real bar; falls back to a standalone page when no Gmail tab is open |
| **Toolbar menu** | Configure tabs, Show me around, All settings, Help & support, behind the extension icon |
| **Keyboard Support** | <kbd>Esc</kbd> to close modals and exit move mode |
| **Rating ask** | After a week and 30 tab clicks, one line at the end of the bar asks for a rating, with "Not now" and "Don't ask again". Its state stays on the device. See ADR-032 |
| **Integration health** | Rows on the options page saying whether the Gmail menu item and sender icons are working, or working only because a fallback held, with a button that copies a short diagnostic. Nothing is transmitted; the copying is yours to do |
| **Privacy First** | No background network requests, no telemetry; everything stays local. The one optional request is website icons, which you turn on yourself |
| **Chromium browsers** | Tested in Chrome, Microsoft Edge, Opera and Chromium |

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
│  │  ● Sidebar counts       │  │                         │  │
│  │  ● Atom feed fallback   │  │  Communicates via       │  │
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
│  ● Settings write queue  │     │  ● Import/Export          │
│  ● Uninstall flow        │     │  ● Privacy dashboard     │
└──────────────────────────┘     └─────────────────────────┘
```

### Unread Count Strategy

A badge shows the number Gmail shows (ADR-030):

1. **Gmail's sidebar**: the count on the same view's row in Gmail's left sidebar, copied as it is and re-read by a `MutationObserver` whenever Gmail changes it. Gmail has already applied the inbox type, categories and language, so the badge matches what the user sees
2. **Atom feed**: only for a user label with no sidebar row (hidden, or under a collapsed parent), fetched as `mail.google.com/.../feed/atom/{Parent-Child-Name}`, because the feed names `/` and spaces as `-`
3. **XHR interception**: Gmail's internal sync responses, read in the Main World, applied only to views the sidebar does not list

Searches show no count: Gmail does not count them, and there is no feed for a search.

### Key Architectural Patterns

| Pattern | Where | Purpose |
|---------|-------|---------|
| **Dual-World Injection** | content.ts + xhrInterceptor.ts | Content script cannot see Gmail XHR; a Main World script patches XMLHttpRequest and ferries data back via CustomEvent |
| **Per-Account Namespacing** | storage.ts | Settings keyed by `account_{email}` in chrome.storage.sync |
| **CSS Custom Properties** | toolbar.css | Full theming via CSS variables with `prefers-color-scheme` media query and force-override classes |
| **Optimistic UI** | dragdrop.ts | UI updates immediately on drop; storage write happens asynchronously |
| **Strategy Pattern** | unread.ts | Gmail's own sidebar count first; the Atom feed for labels the sidebar hides |

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
| **Bundler** | esbuild (7 entry points, minified, console-stripped) |
| **Extension Platform** | Chrome Manifest V3 |
| **Route Detection** | Body `MutationObserver` + `popstate` |
| **Storage** | `chrome.storage.sync` (cross-device, per-account namespaced) |
| **Testing** | Jest + ts-jest + jsdom |
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

Per-account settings are stored in `chrome.storage.sync` under the key `account_{email}`:

```typescript
interface Settings {
  tabs: Tab[];
  rules: Rule[];
  theme: 'system' | 'light' | 'dark'; // retained for migration; the live theme is global (see below)
  showUnreadCount: boolean;
  senderIcons: boolean;                // off by default
  senderIconsFavicons: boolean;        // a second opt-in, off by default
  senderIconsDomain: boolean;
  senderIconsMailbox: 'initial' | 'provider';
}

interface Tab {
  id: string;       // UUID
  title: string;    // Display name
  type: 'label' | 'hash';
  value: string;    // Gmail label name or hash route (#category/promotions for a category)
  color?: string;   // A palette token, optional
}

interface Rule {
  tabId: string;                                          // References a Tab.id
  action: 'trash' | 'archive' | 'markRead' | 'moveToLabel';
  daysOld: number;                                        // "older than" threshold in days
  enabled: boolean;
  targetLabel?: string;                                   // Required when action is 'moveToLabel'
}
```

Theme is a **browser-wide** preference (shared by every Gmail account in the profile) stored
separately in `chrome.storage.local` under the `globalTheme` key. Because it uses local storage it
applies to all accounts in the window but does not sync across devices. Changing the theme in any
account, in the Gmail modal, the options page, or onboarding, updates all open Gmail tabs live.

The extension's own pages also keep the last *resolved* theme in `localStorage`, because every
`chrome.storage` read yields and a page has to paint something before it answers. That copy is a
cache for the first frame and nothing else; `chrome.storage.local` still decides. See ADR-020.

The Google Sheet URL used for activity logging is not persisted in settings; it is entered on the
Options page and passed directly to the Apps Script generator.

### Storage Limits

| Limit | Value |
|-------|-------|
| Total sync storage | 102,400 bytes |
| Per-item max | 8,192 bytes |
| Max items | 512 |

### Permissions

| Permission | Purpose |
|------------|---------|
| `storage` | Save tab configurations, rules and preferences |
| `downloads` | Export settings as a JSON file |
| `management` | Enable self-uninstall from the settings page |
| `scripting` | Start the content script in a Gmail tab that was already open, so an install or an update does not require a manual reload (ADR-025) |
| `host_permissions` (mail.google.com) | Inject the tab bar into Gmail's UI |

## Usage

### Adding a Label Tab

1. Open Gmail and click the ⚙️ icon on the tab bar (or open the Options page)
2. Type a Gmail label name (e.g., `Work`, `Personal/Projects`)
3. Click **Add tab**

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

- **Export**: Settings modal or Options page > Export settings > downloads `GmailTabs_<account>_<date>.json`
- **Import**: Settings modal or Options page > Import settings > select JSON file (schema validated before import)

### Automation Rules

1. Open the Options page > Automation Rules
2. Configure per-tab actions (trash, archive, mark read, or move to another label)
3. Set the "older than" threshold in days
4. Click **Generate and copy script**
5. Paste the generated Google Apps Script into [script.google.com](https://script.google.com)
6. Set up a daily trigger for automated execution

## Project Structure

```
Gmail-Labels-As-Tabs/
├── manifest.json                     # Chrome MV3 manifest
├── package.json                      # Dependencies & scripts
├── tsconfig.json                     # TypeScript config (ES2022, strict)
├── build.js                          # esbuild config (7 entry points)
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
│   ├── welcome.ts                    # Standalone tour host (no Gmail tab open)
│   ├── welcome.html / welcome.css    # …and its markup & surround
│   ├── popup.ts / popup.html/.css    # The toolbar icon's menu
│   ├── themeBoot.ts                  # Stamps the theme before a page paints anything
│   │
│   ├── modules/                      # Feature modules (extracted from content.ts)
│   │   ├── state.ts                  # Shared state & DOM selectors
│   │   ├── tabs.ts                   # Tab bar rendering & navigation
│   │   ├── dragdrop.ts               # Drag and drop reordering
│   │   ├── theme.ts                  # Theme management & Gmail dark detection
│   │   ├── themeMirror.ts            # The last painted theme, readable without yielding
│   │   ├── labelMenu.ts              # "Show as Tabs" inside Gmail's own label menu
│   │   ├── senderIcons.ts            # Sender chips in the inbox list (opt-in)
│   │   ├── health.ts                 # Whether the Gmail integrations are working, locally
│   │   ├── unread.ts                 # Unread count (Gmail's sidebar, then the Atom feed)
│   │   ├── ratingNudge.ts            # The rating ask at the end of the tab bar
│   │   ├── rules.ts                  # Automation rules & Apps Script generation
│   │   ├── ruleTemplates.ts          # One-click rule presets
│   │   ├── tabManager.ts, colorPicker.ts, feedback.ts, extensionContext.ts, handover.ts, messages.ts
│   │   ├── onboarding/               # The tour: content, view, and the modal over Gmail
│   │   └── modals/                   # Modal dialogs (9 files, see CONTEXT_MAP.md)
│   │       ├── index.ts              # Barrel export
│   │       ├── pinModal.ts           # Add/pin new tab modal
│   │       ├── editModal.ts          # Edit tab title/value
│   │       ├── deleteModal.ts        # Delete tab confirmation
│   │       ├── importModal.ts        # Import configuration
│   │       ├── settingsModal.ts      # Settings & preferences
│   │       ├── uninstallModal.ts     # Uninstall flow with data export
│   │       ├── contextNotice.ts      # The orphaned notice and the failed-save notice
│   │       └── dialogA11y.ts         # Dialog role, focus trap and focus return
│   │
│   ├── utils/                        # Shared utilities
│   │   ├── storage.ts                # chrome.storage.sync wrapper (CRUD, migration)
│   │   ├── gmailHash.ts              # Decodes a Gmail address fragment; never throws
│   │   ├── importExport.ts           # Import/Export logic with schema validation
│   │   ├── selectors.ts              # DOM selector constants
│   │   ├── domain.ts                 # Sender address to organisation domain
│   │   ├── colors.ts                 # Tab colour palette tokens
│   │   └── tabListRenderer.ts        # Reusable tab list rendering
│   │
│   ├── ui/
│   │   ├── toolbar.css               # Design system (CSS custom properties, theming)
│   │   └── onboarding.css            # The tour
│   │
│   └── icons/                        # Extension icons (16/32/48/128 png)
│
├── test/                             # Test suite (50 files; the main ones below)
│   ├── background.test.ts            # Service worker tests
│   ├── content.test.ts               # Content script tests
│   ├── dragdrop.test.ts              # Drag and drop tests
│   ├── tabs.test.ts                  # Tab rendering tests
│   ├── theme.test.ts                 # Theme management tests
│   ├── unread.test.ts                # Unread count tests
│   ├── ratingNudge.test.ts           # The rating ask
│   ├── gmailHash.test.ts             # Gmail address fragment decoding
│   ├── storage.test.ts               # Storage CRUD tests
│   ├── importExport.test.ts          # Import/Export tests
│   ├── tabListRenderer.test.ts       # Tab list renderer tests
│   ├── state.test.ts                 # State management tests
│   ├── rules.test.ts                 # Automation rules tests
│   ├── options.test.ts               # Options page tests
│   ├── settingsModal.test.ts         # Settings modal tests
│   ├── welcome.test.ts               # Standalone tour host
│   ├── popup.test.ts                 # Toolbar menu
│   ├── onboarding/                   # The shared wizard and its in-Gmail host
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
├── .github/workflows/
│   ├── ci.yml                        # CI pipeline (test, lint, build, verify)
│
├── ARCHITECTURE.md                   # Detailed architecture analysis
├── AUDIT.md                          # Code quality audit (historical)
├── CLAUDE.md                         # Points Claude at AGENTS.md
├── COMMERCIAL-LICENSE.md             # The commercial licence, and how to ask for one
└── LICENSE                           # GNU AGPL 3.0
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

**Table R3: Test suites by area**

| Area | Files | Focus |
|------|-------|-------|
| Storage API | `storage.test.ts` | Full CRUD, migration, multi-account, edge cases |
| XHR Interceptor | `xhrInterceptor.test.ts` | Gmail JSON parsing, CustomEvent dispatch, error handling |
| Unread Counts | `unread.test.ts` | Copying Gmail's sidebar count, the Atom feed fallback and its names, live XHR counts only where the sidebar has no row, a bad network, constant sidebar churn |
| Hash decoding | `gmailHash.test.ts` | `+` before escapes, a stray `%`, and every caller using the one decoder |
| Rating ask | `ratingNudge.test.ts` | When it is due, "Not now" and "Don't ask again", malformed stored state, and other tabs following |
| Drag & Drop | `dragdrop.test.ts` | Horizontal/vertical drag, reorder logic, edge cases |
| Tab Rendering | `tabs.test.ts` | Tab creation, active state, hash navigation |
| Theme | `theme.test.ts` | System/Light/Dark, Gmail dark mode detection, and the window where 'system' is still a guess |
| First-frame theme | `themeMirror.test.ts` | The synchronous cache and the boot stamp that uses it |
| Gmail label menu | `labelMenu.test.ts` | Reading which label was clicked, cloning one of Gmail's items, the toggle, sublabel titles, and every way it gives up |
| Integration health | `health.test.ts` | Recording only on change, one key per component, surviving an orphaned context, and carrying nothing identifying |
| Sender icons | `senderIcons.test.ts`, `domain.test.ts` | Every fallback layer, the badge before any request, website icons only on opt-in, slow and blocked networks, the observer not looping |
| Drift canary tooling | `canaryAccounts.test.ts`, `canaryNotify.test.ts`, `canaryRun.test.ts`, `canaryPropose.test.ts` | Which account is measured and that its address is never printed, Google Chat alerts, escalation streaks and recovery, and what a selector proposal may write, all as real processes against stubs |
| Options Page | `options.test.ts` | Account detection, section navigation, rule UI |
| Import/Export | `importExport.test.ts` | Schema validation, export format, round-trip |
| Modals | `modals/*.test.ts` | Pin, edit, delete, import, uninstall modal logic |
| Background | `background.test.ts` | Install hooks, message handling, downloads |
| Content Script | `content.test.ts` | Initialization, injection, observer setup |
| Rules | `rules.test.ts` | Apps Script generation, rule validation |
| State | `state.test.ts` | Shared state, DOM selector management |
| Tab List Renderer | `tabListRenderer.test.ts` | Reusable rendering logic |
| Welcome | `welcome.test.ts` | Standalone tour host |
| Popup | `popup.test.ts` | Toolbar menu entries and their fallbacks |
| Onboarding | `onboarding/wizardView.test.ts` | The shared wizard: slides, captions, theme chooser |
| Onboarding modal | `onboarding/onboardingModal.test.ts` | The tour over Gmail: scrim, dismissal, orphaned context |
| Settings Modal | `settingsModal.test.ts` | Theme toggling, settings persistence |

**Total: 50 test files, 1149 test cases.**

The test environment uses `jsdom` with manually mocked `chrome.storage.sync`, `chrome.runtime`, and `crypto.randomUUID`.

### Coverage Thresholds

Configured in `jest.config.js`:

| Metric | Threshold |
|--------|-----------|
| Statements | 65% |
| Branches | 50% |
| Functions | 65% |
| Lines | 65% |

## CI/CD

The CI pipeline runs when dispatched by hand (`gh workflow run ci.yml --ref main`), so
Actions minutes are spent deliberately:

```
Dispatch → Install → Type-check → Test + Coverage → Lint → Build → Verify → Artifact
```

### Pipeline Steps

**Table R4: CI pipeline steps**

| Step | What It Does |
|------|-------------|
| **Install** | `npm ci` with npm cache |
| **Test** | `npm test --coverage`, then a second serial run (Jest, 1149 tests across 50 suites) |
| **Lint** | `npm run lint` (ESLint with @typescript-eslint) |
| **Build** | `npm run build` (esbuild, minified, console-stripped) |
| **Console Check** | Asserts zero `console.log` in production bundle |
| **Package** | Creates `extension.zip` and validates it is under the 5MB CWS limit |
| **Version Parity** | Verifies `manifest.json` and `package.json` versions match |
| **@ts-ignore Check** | Ensures zero `@ts-ignore` comments in source |
| **Dist Verification** | Confirms all 17 required files exist in `dist/` |
| **Declared Icons Only** | Fails if `dist/icons/` holds a file the manifest does not name. Two promo tiles, 398 KB, shipped to users this way until v1.5.0 |
| **Published Privacy Policy** | Fetches <https://palworks.github.io/Gmail-Labels-As-Tabs/privacy/> and fails if it omits an outbound host, a declared permission or the site's own analytics, or if the site bundle carries an API key. The policy lives in another repository and deploys by hand, so nothing else keeps it honest |
| **Artifacts** | Uploads `dist/`, `extension.zip`, and coverage report (7-day retention) |

Nothing here runs on a push. The workflow is `workflow_dispatch` only, so dispatch it:
`gh workflow run ci.yml --ref main -f ref_note="why this run"`.

## Deployment

### Chrome Web Store

```bash
# Build the production bundle
npm run build

# Package as a zip for Chrome Web Store upload
npm run package
# Creates extension.zip in the project root
```

Upload `extension.zip` to the [Chrome Developer Dashboard](https://chrome.google.com/webstore/devconsole),
or as a draft through the Chrome Web Store API with `node scripts/cws-upload.mjs` (a dry run
unless given `--confirm`; it never submits for review on its own). The full sequence is in
[PLAYBOOK.md](PLAYBOOK.md).

**Published listing:** [Gmail Labels as Tabs on Chrome Web Store](https://chromewebstore.google.com/detail/gmail-labels-and-search-q/jemjnjlplglfoiipcjhoacneigdgfmde)

### Marketing Website

The marketing site is **not in this repository**. It lives in
[PalWorks/Gmail-Labels-As-Tabs](https://github.com/PalWorks/Gmail-Labels-As-Tabs) and is
published at <https://palworks.github.io/Gmail-Labels-As-Tabs/>, including the privacy
policy the Chrome Web Store listing links to.

It is a Vite and React site prerendered to real HTML at real paths (`/privacy/`, `/terms/`,
`/contact/`, `/changelog/`, `/about/`, and two guides, `/gmail-custom-tabs/` and
`/gmail-search-operators/`), each with its own JSON-LD, plus `llms.txt`, `llms-full.txt`
and a sitemap. Old `#/` links redirect to the real paths. The homepage embeds the
[product video](https://youtu.be/PtjGAnSIG5o). Its `/contact/` form, which the extension's
Help button opens, posts to a Cloudflare Worker in that repository, separate from this
repository's feedback relay in [worker/](worker/).

A `website/` folder used to sit here as well, left over from the March 2026 split, and it
kept deploying a second copy of the site. Two privacy policies drifted apart as a result.
It was deleted in v1.5.0, Pages was disabled on this repository, and
`test/repoConsistency.test.ts` fails the build if a `website/` folder reappears or if
anything here links to the retired address.

That site deploys **manually**: `gh workflow run deploy.yml --repo PalWorks/Gmail-Labels-As-Tabs --ref main`.

## Roadmap

### v1.0: Shipped

- Custom tabs for labels, searches, and hash views
- Drag and drop reordering
- Real-time unread counts (Atom + XHR + DOM)
- System, Light, and Dark themes
- Multi-account support
- Export and Import configuration
- Cross-device sync
- Guided tour, over Gmail or standalone

### v1.1: Shipped

- Standalone options dashboard with sidebar navigation
- Automation rules with Google Apps Script generation
- User guide with step by step setup instructions
- Privacy dashboard
- Activity logging via Google Sheets integration
- Modular architecture (state, tabs, dragdrop, theme, unread, rules, modals)
- CI/CD pipeline with 10 verification steps

### v1.2: Shipped

- Browser-wide theme propagation across all accounts in a window (`chrome.storage.local`)
- Default theme changed to Light for fresh installs
- Settings gear icon replacing the pencil icon
- Rules limited to label-backed tabs; hash-view unread counts fixed
- Export and Import extended to include rules and theme
- XHR interceptor hardening against false-positive counts
- Bounded single-flight injection and cached unread fetches
- Full keyboard and screen-reader accessibility for the tab bar
- WCAG AA text contrast fixes across light and dark themes
- Shared tab-manager module; encapsulated state accessors
- Expanded test suite to 365 tests across 21 suites
- Agent-oriented documentation set (see Documentation)

### v1.3 to v1.6: Shipped

- Tab colours from an accessible, theme-safe palette (1.3)
- Cleanup rule starter templates (1.3)
- "System" theme follows Gmail's own theme, not the operating system (1.3, 1.6.1)
- In-product feedback form, through the feedback relay Worker (1.4)
- A hardening release: serialized settings writes, the import XSS fix, rules that cannot act on the wrong mail (1.5)
- The one-minute tour, over Gmail or standalone, and a toolbar menu (1.6)

Every release from 1.5.0 is in [CHANGELOG.md](CHANGELOG.md) in full.

### v1.7 and v1.8: Shipped in 1.8.1

1.7.0 to 1.8.0 were built and never submitted; 1.8.1 carries all of them, plus the fixes from
the pre-submission audit (category cleanup templates, rules that keep making progress, visible
save failures, a clean handover between two copies of the script).

- "Show as Tabs" in Gmail's own label menu, sublabels included (1.7)
- Gmail integration health on the settings page, and a daily drift canary (1.7)
- An open Gmail tab gets the bar on install or update without a reload (1.7.3)
- Only the open tab is highlighted, not its parent too (1.7.4)
- Sender icons, off by default, with optional website icons (1.8.0)
- Canary alerts in Google Chat, with proposed selector refreshes (1.8.0)

### v1.9: Submitted 2026-11-26, being resubmitted with the audit fixes

Driven by the first user feedback: issue #1 and two messages through the in-product form.

- Unread badges show the number Gmail's own sidebar shows, in any language (ADR-030)
- Settings open on the Gmail account they were opened from
- Twelve tab colours, up from eight
- A rating ask after a week and 30 tab clicks, easy to put away (ADR-032)
- The uninstall page is on our own website, not Tally (ADR-031)
- Everything a full pre-release audit found, fixed: one hash decoder, drag by tab id, unknown colours kept, page events validated, the phone layout, sentence-case labels
- Licensed under AGPL-3.0 plus a commercial licence, from MIT

### Planned

- [ ] Keyboard shortcuts for tab switching (<kbd>Ctrl+1</kbd>, <kbd>Ctrl+2</kbd>, etc.)
- [ ] Tab grouping and categories
- [ ] Custom tab icons
- [ ] Parent and child tabs that mirror nested labels (a sublabel can already be a tab of its own)
- [ ] Firefox extension port (WebExtension APIs)

## Documentation

This repository is documented for both humans and LLM-driven agents. Start with
[CONTEXT_MAP.md](CONTEXT_MAP.md) to find the right file for a question.

**Table R5: Documentation set**

| Document | Purpose |
|----------|---------|
| [AGENTS.md](AGENTS.md) | Agent behavior contract and hard constraints |
| [CLAUDE.md](CLAUDE.md) | Points Claude at AGENTS.md |
| [ARCHITECTURE.md](ARCHITECTURE.md) | System design reference |
| [CONTEXT_MAP.md](CONTEXT_MAP.md) | Where knowledge lives |
| [DOMAIN.md](DOMAIN.md) | Concepts, terminology, and domain rules |
| [DATA_MODEL.md](DATA_MODEL.md) | Storage schema and data shapes |
| [DECISIONS.md](DECISIONS.md) | Architecture Decision Records |
| [TESTING.md](TESTING.md) | Testing philosophy, commands, thresholds |
| [SECURITY.md](SECURITY.md) | Privacy and security policy |
| [PLAYBOOK.md](PLAYBOOK.md) | Build, release, rollback, troubleshooting |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Contribution workflow |
| [CHANGELOG.md](CHANGELOG.md) | Version history |
| [AUDIT.md](AUDIT.md) | Historical repository audit (v1.2.1, with refresh notes to v1.8.1) |
| [STORE_LISTING.md](STORE_LISTING.md) | Chrome Web Store listing text, privacy answers and the release checklist |
| [COMMERCIAL-LICENSE.md](COMMERCIAL-LICENSE.md) | The commercial licence, and how to ask for one |
| [scripts/canary/README.md](scripts/canary/README.md) | The daily Gmail drift canary |

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for the full workflow.
Quick start:

1. **Fork** the repository
2. **Create a branch**: `git checkout -b feat/your-feature`
3. **Make changes** and verify tests pass: `npm test`
4. **Lint your code**: `npm run lint`
5. **Build** to verify: `npm run build`
6. **Submit a PR** targeting `main`

### Development Guidelines

- TypeScript strict mode is enforced; avoid `any` unless absolutely necessary
- All user-facing strings must be HTML escaped (XSS prevention), including ids; `test/htmlSinks.test.ts` enforces this against the AST
- All settings writes go through `mutateSettings`, never read-modify-save; see ADR-013
- No colour literals outside the stylesheets; `test/contrast.test.ts` enforces this
- No background network requests (privacy-first principle). The user-initiated exceptions are the feedback relay and opt-in website icons; see ADR-012 and ADR-027 in DECISIONS.md
- Production builds strip all `console.log` via esbuild's `drop` option
- Keep modules focused with a single responsibility per file
- Format code with Prettier before committing: `npm run format`
- Coverage thresholds are enforced in CI; new code should maintain or improve coverage

### Code Quality Commands

```bash
npm run lint      # ESLint with @typescript-eslint
npm run lint:fix  # Auto-fix lint issues
npm run format    # Prettier formatting
npm test          # Jest (1149 tests across 50 suites)
npm run build     # Verify production build
```

## Privacy

This extension is designed with privacy as a non-negotiable principle:

- **No background requests**: No analytics, no telemetry, no remote config
- **One user-initiated exception**: Pressing Send feedback posts your message, an optional reply address, and diagnostics unless you untick them (version, browser build, and counts of tabs, rules and accounts) to our relay on Cloudflare, which passes it to the email service Resend. Never label names, tab titles, contacts or mail
- **Local storage only**: All data stored in `chrome.storage.sync` (Google's infrastructure, synced via your Google account)
- **No user data collection**: no database, no tracking, no account. The one server we run is the feedback relay in [worker/](worker/), reached only when someone presses Send. It stores no message, only a rate-limit counter named by a keyed hash of the network address, for up to a day
- **Website icons, only if you turn them on**: sender icons are off by default and draw a coloured letter without any request. With **Load website icons** also on, the sender's domain alone (such as `mashreq.com`) is sent to Google's icon service at `t0.gstatic.com`, or `www.google.com` if that cannot be reached, with no referrer, once per domain (ADR-027)
- **One page on uninstall**: removing the extension opens a one-question page on our own website (`palworks.github.io`) so we can learn why. The link carries the extension version and nothing else, and the extension sends nothing itself (ADR-014, ADR-031)
- **Minimal permissions**: Only `storage`, `downloads`, `management` and `scripting`, the last of which injects this extension's own content script into Gmail and nothing else
- **Open source**: Full codebase available for audit

Unread counts are read from Gmail's own sidebar on the page; the Atom feed used for labels the sidebar hides fetches from `mail.google.com` (same origin). The rating ask keeps its state on the device and opens the store page only when you click "Rate it". The only cross-origin requests are the ones listed above, each of which you trigger.

The automation rules feature generates Google Apps Script code that runs entirely under your own Google account. The extension has no access to your Gmail API, no OAuth tokens, and no API keys.

## License

Dual-licensed, from 1.9.0:

- **GNU Affero General Public License 3.0** ([LICENSE](LICENSE)): free to use, change and share,
  provided a modified version you distribute or run as a service is offered as source under the
  same licence.
- **A commercial licence from PalWorks** for use without the AGPL's obligations, such as inside
  a closed-source product. See [COMMERCIAL-LICENSE.md](COMMERCIAL-LICENSE.md) for how to ask.

Installing the extension from the Chrome Web Store is free for everyone and needs neither.
Versions up to 1.8.1 were published under MIT, and copies of those keep it.

## Acknowledgements

- [esbuild](https://esbuild.github.io/) for lightning fast TypeScript bundling
- [Jest](https://jestjs.io/) for the testing framework
- [Chrome Extensions team](https://developer.chrome.com/docs/extensions/) for the Manifest V3 platform

<p align="center">
  <strong>Built with care for Gmail power users</strong><br>
  <a href="https://palworks.github.io/Gmail-Labels-As-Tabs/">Website</a> · 
  <a href="https://chromewebstore.google.com/detail/gmail-labels-and-search-q/jemjnjlplglfoiipcjhoacneigdgfmde">Chrome Web Store</a> · 
  <a href="https://github.com/PalWorks/Gmail-Labels-Queries-As-Tabs/issues">Report Bug</a> · 
  <a href="https://github.com/PalWorks/Gmail-Labels-Queries-As-Tabs/issues">Request Feature</a>
</p>
