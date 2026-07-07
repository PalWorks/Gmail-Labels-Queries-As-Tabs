# DOMAIN.md

Business logic, terminology, and rules for **Gmail Labels and Search Queries as Tabs**.
Understanding these concepts is required for correct changes.

Last updated: 2026-07-07 (v1.2.1)

## The problem it solves

Power Gmail users rely on many labels and saved searches but Gmail offers no fast,
persistent, browser-tab-style switcher for them. This extension injects a horizontal tab
bar into Gmail so each frequently used label, search query, or built-in view is one click
away, and it can automate routine cleanup of those labels.

## Core entities and terms

- **Tab.** A user-pinned entry in the injected bar. It has a display `title` and a
  navigation target. Tabs are ordered and reorderable.
- **Tab type.** Either `label` or `hash`.
  - `label`: navigates to `#label/<encoded label name>`. Represents a real Gmail label.
  - `hash`: navigates to a raw Gmail hash such as `#inbox`, `#sent`, or a search hash
    like `#search/...`. Covers built-in views and saved search queries.
- **Account.** A Gmail account identified by its email address. Every account in the
  browser profile keeps its own tab set, rules, and unread preference. Settings are keyed
  as `account_<email>` in `chrome.storage.sync`.
- **Global theme.** A single browser-wide appearance preference (`system`, `light`, or
  `dark`) shared by every account in the profile. Default is `light`. Stored in
  `chrome.storage.local` under `globalTheme`. It is intentionally not device-synced.
- **Unread count.** The number of unread messages for a tab's target, shown as a badge
  when the account's `showUnreadCount` preference is on.
- **Rule.** A per-tab automation instruction that becomes Google Apps Script. It targets
  a tab's label and applies an action to messages older than a threshold.
- **Rule action.** One of `trash`, `archive`, `markRead`, `moveToLabel`. `moveToLabel`
  additionally carries a `targetLabel`.

## Key domain rules

1. **Labels vs hashes drive everything.** Only `label` tabs can have automation rules,
   because Apps Script operates on Gmail labels, not on arbitrary view hashes. The rules
   UI and generator skip tabs that have no resolvable Gmail label.
2. **Delete always means Trash.** Generated Apps Script never permanently deletes. The
   `trash` action moves threads to Trash, where Gmail keeps them recoverable for 30 days.
3. **Automation runs under the user's own account.** The extension generates a script the
   user pastes into their own Google Apps Script project and authorizes themselves. The
   extension holds no OAuth tokens and has no server-side access to anyone's Gmail.
4. **Unread counting is a best-effort waterfall.** The extension tries three sources in
   order and uses the first that yields a trustworthy number:
   1. Gmail Atom feed (`/feed/atom/<label>`), cached for about 30 seconds.
   2. Interception of Gmail's own XHR responses (MAIN world), filtered against the set of
      known rendered labels to avoid false positives.
   3. DOM scraping of Gmail's own unread indicators.
5. **Theme applies to the whole window, not one account.** Changing the theme in any
   account (or the options page or onboarding) propagates to every open Gmail tab in the
   profile via a `chrome.storage.local` change event.

## Glossary

- **MAIN world / isolated world.** Two JavaScript execution contexts on a page. Content
  scripts run isolated; the XHR interceptor is injected into the page's MAIN world to see
  Gmail's own network traffic. They communicate via `CustomEvent` on `document`.
- **InboxSDK.** A third-party library used to reliably locate Gmail UI anchor points for
  injection. Bundled into the content script.
- **Hash view.** Gmail encodes the current view in the URL fragment (for example
  `#inbox`, `#label/Work`, `#search/from%3Aboss`). The extension reads and sets this hash
  to navigate.
