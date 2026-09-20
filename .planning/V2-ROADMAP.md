# V2 Roadmap

Strategic roadmap for the next milestone, informed by a codebase review, a competitor
teardown (cloudHQ "Gmail Tabs" v1 and v2), and market research.

Created: 2026-07-08

## Scope decisions

- **Active build (v2.0):** Custom tab colors, Firefox port.
- **Next milestone (v2.1, planned, not built yet):** Automation rule template library.
- **Deprioritized by product owner:** Keyboard shortcuts, tab grouping, custom tab icons.
- **Out of model:** Mobile injection and any OAuth/backend features (would break the
  privacy-first, no-backend stance).

## Competitor teardown: cloudHQ "Gmail Tabs"

### v1 (May 2025, 1.0.2.2) to v2 (Nov 2025, 1.0.2.3): maintenance only

Manifest, permissions, hosts, and all 11 locale files are byte-identical except the
version string. The only functional changes in ~7 months:

- Right-click context menu on Gmail label nodes (`contextmenu` listener on `[data-id]`).
- Multilingual folder/label detection (matches `aria-label` against "folder" in 13
  languages); previously English-only.
- Email address validation guard in the page world.
- Removed a stray debug string.

Takeaway: the direct competitor is in low-investment mode. There is room to out-ship them.

### v2 capability profile

- Built almost entirely on **InboxSDK** (2000+ refs) plus jQuery and React 17. Injects
  **native Gmail nav items** and maps tabs to **Gmail search queries** via
  `registerSearchQueryRewriter`. Tabs live in Gmail's left sidebar, natively styled.
- **Not privacy-first.** Contacts `cloudhq.net`, `api.inboxsdk.com` (Streak telemetry and
  error reporting), `people-pa.clients6.google.com` (contact lookup),
  `pubsub.googleapis.com`, and a Cloudflare "website scraper" worker. Harvests Gmail's
  in-page OAuth token to call Google APIs with no declared scopes.
- **Remote config** from cloudHQ lets them change features and paywall copy without a
  store update.
- **Freemium**: about $2.99/month with a 30-day trial; hosted checkout; uninstall pings
  for churn tracking.

## Our position

Strengths:

- Genuinely privacy-first: zero external requests, no OAuth, no backend, no telemetry.
  This is the single biggest differentiator and directly answers the market's top fear.
- Clean modular TypeScript, 365 tests, full documentation.
- Browser-tab metaphor at the top of Gmail, distinct from cloudHQ's sidebar nav items.
- Apps Script automation under the user's own account: a real no-backend capability
  cloudHQ lacks.

Weaknesses and risks:

- We bundle the full InboxSDK (~1 MB) but use only `User.getEmailAddress()` and
  `Router.handleAllRoutes()`. We either exploit more of it or drop it to cut load time.
- The unread waterfall (Atom feed, XHR, DOM) is clever but more fragile than InboxSDK's
  native nav-item unread count.
- Slow load is the top category complaint against injection tools; our lean build is an
  advantage only if we keep it lean.

## Market pain points (opportunities)

| Pain point | Our angle |
|------------|-----------|
| Native Multiple Inboxes caps at 5 sections and blocks the reading pane | Unlimited tabs, reading pane preserved |
| OAuth "read/send/delete all mail" prompts scare users | We require none of that; lead with it |
| Fear of data-stealing Gmail extensions | Only touches mail.google.com, zero network |
| Subscriptions for a lightweight tweak | Free or one-time, generous free tier |
| Slowness on injection tools | Keep the bundle lean |

## Backlog (post v2.1, ranked)

1. Multi-label / OR-query virtual tabs (beat the native 5-section cap).
2. Lean-build decision: exploit InboxSDK search rewriter, or drop InboxSDK to cut ~1 MB.
3. In-product privacy-first positioning (permissions explainer, zero-network badge).
4. Focus mode (hide or dim non-active tabs).
5. Shareable tab presets via export/import (no account).
6. Nested label support (Parent/Child) in dropdowns.
7. Density and dark-mode polish continuation.

See [V2-IMPLEMENTATION-PLAN.md](V2-IMPLEMENTATION-PLAN.md) for the active-build plan.
