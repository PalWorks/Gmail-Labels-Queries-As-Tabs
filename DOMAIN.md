# DOMAIN.md

Business logic, terminology, and rules for **Gmail Labels and Search Queries as Tabs**.
Understanding these concepts is required for correct changes.

Last updated: 2026-11-26T09:09:48+00:00 (v1.9.0)

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
- **Resolved theme.** What `system` actually means right now: `light` or `dark`, read from
  **Gmail's own rendered background**, because Gmail's theme is an account setting and a
  dark desktop says nothing about the inbox the bar sits in. The desktop is consulted only
  when Gmail has not painted yet, and an answer that came from the desktop is treated as a
  guess rather than a fact: nothing paints a background until the guess is resolved or
  abandoned. See ADR-019 and ADR-020.
- **Unread count.** The number Gmail itself shows for a tab's target, shown as a badge when
  the account's `showUnreadCount` preference is on. It is Gmail's number, not one the
  extension computes: for the inbox with categories on, that is Primary only.
- **Tab colour.** An optional palette token on a tab, one of twelve. Decorative only, never
  the sole way to tell tabs apart.
- **Rating ask.** One line at the end of the tab bar, after a week and 30 tab clicks on a
  device, asking for a rating on the Chrome Web Store. "Not now" waits 30 days, at most three
  times; "Rate it" and "Don't ask again" end it. See ADR-032.
- **Rule.** A per-tab automation instruction that becomes Google Apps Script. It targets
  a tab's label and applies an action to messages older than a threshold.
- **Rule action.** One of `trash`, `archive`, `markRead`, `moveToLabel`. `moveToLabel`
  additionally carries a `targetLabel`.
- **Sender chip.** The optional mark at the start of an inbox row naming the organisation
  a thread is from: a lettered badge, or the organisation's website icon, and its domain.
  Off by default, per account.
- **Organisation domain.** What a chip names: the registrable part of the sender's host,
  so `alerts@email.mashreq.com` is `mashreq.com` and `billing@icici.bank.in` stays
  `icici.bank.in`, because `bank.in` is a registry and not a company.
- **Mailbox provider.** A domain like `gmail.com` or `outlook.com` that says who hosts an
  address and nothing about who is writing. By default a chip shows the sender's own
  initial for these, not the provider's logo.

## Key domain rules

1. **Labels vs hashes drive everything.** Only `label` tabs, and since 1.8.1 Gmail category
   tabs (`#category/promotions` and the like), can have automation rules, because Apps
   Script searches by label or category, not by arbitrary view hashes. The rules UI and
   generator skip every other tab.
2. **Delete always means Trash.** Generated Apps Script never permanently deletes. The
   `trash` action moves threads to Trash, where Gmail keeps them recoverable for 30 days.
   Three further limits apply because the script runs unattended: the label is quoted in
   the search (an unquoted `label:Old Stuff` is read by Gmail as `label:Old AND Stuff`),
   each rule stops at 200 threads per run, and every thread is re-checked for the exact
   label name before it is touched.
3. **Automation runs under the user's own account.** The extension generates a script the
   user pastes into their own Google Apps Script project and authorizes themselves. The
   extension holds no OAuth tokens and has no server-side access to anyone's Gmail.
4. **A badge shows the number Gmail shows (ADR-030).** The source depends on where Gmail
   shows the view:
   1. A view with a row in Gmail's left sidebar takes that row's count, digit for digit, and
      shows nothing when the row shows nothing. A `MutationObserver` re-reads it whenever
      Gmail changes a count. The count is read as a number, not from English text, so it
      works in every Gmail language.
   2. A user label with no sidebar row (hidden, or under a collapsed parent) falls back to
      Gmail's Atom feed, under the name the feed uses: every `/` and space becomes `-`. It is
      cached for about 30 seconds, at most four requests in flight at once. A failed fetch
      is recorded as a failure rather than as a count of zero: the last known number stays
      on screen and the retry backs off from 5 seconds to a 5 minute ceiling.
   3. Gmail's own XHR responses (MAIN world), filtered against the set of known labels,
      update only views the sidebar does not list. The inbox never takes one: Gmail's sync
      count for it covers every category.
   Searches show no count: Gmail does not count them and there is no feed for a search.
5. **Theme applies to the whole window, not one account.** Changing the theme in any
   account (or the options page or onboarding) propagates to every open Gmail tab in the
   profile via a `chrome.storage.local` change event. An extension page opened afterwards
   paints the last resolved theme on its first frame, from a synchronous cache, because
   correcting the colour in front of the user is a defect rather than a detail.
6. **A label becomes a tab from two places, and they mean the same thing.** The
   settings modal and the options page have always been able to add a label tab.
   Since v1.7.1 so has Gmail's own label menu, through the same `addTab` op and
   the same write path. It adds **that label only**: Gmail's `#label/Parent`
   shows what Gmail shows for that label, and rolling a parent's sublabels into
   one tab would be inventing a Gmail feature rather than augmenting one.
7. **A nested label's tab is named after its leaf, until that is ambiguous.**
   Gmail shows `Banking/ADCB Bank` as "ADCB Bank" indented under "Banking", and
   the tab bar is horizontal, where width is what runs out. So the leaf is the
   default title and the full path is the fallback when another tab already
   carries that leaf. The stored `value` is always the full label name, because
   that is what navigation needs.
8. **A thread is named after the other side.** A sender chip names the first participant
   who is not the signed-in user, so a thread the user replied to keeps the correspondent's
   organisation. A thread with only the user in it is named after the user, as Gmail's own
   list does.
9. **Nothing about a message leaves the browser unless the user asked for website icons.**
   Sender chips are drawn from what is already on the page. The one request, a website
   icon, is behind a second switch, and sends the organisation domain and nothing else.
10. **A settings change is described, not performed.** Every surface that can edit settings
   sends a `SettingsOp` to the service worker, which applies them one at a time per
   account. Nothing reads settings, edits the object and saves it back; that is what used
   to lose tabs when two surfaces wrote at once. See ADR-013.

## Glossary

- **MAIN world / isolated world.** Two JavaScript execution contexts on a page. Content
  scripts run isolated; the XHR interceptor is injected into the page's MAIN world to see
  Gmail's own network traffic. They communicate via `CustomEvent` on `document`.
- **InboxSDK.** A third-party library formerly bundled to locate Gmail UI anchor points
  and detect the signed-in address. **Removed after v1.6.2.** It never ran in any shipped
  build, because its page world needs the `scripting` permission this extension did not
  declare while the SDK was bundled (it has declared it since 1.7.3, for a different job), and it cost 1,031,092 of the 1,103,251 bytes of the content script. Both jobs were already
  done by code we own. See ADR-021. Sender icons (v1.8.0) were rebuilt from an extension
  that uses it, again without it. See ADR-027.
- **Degraded.** An integration that works only because a fallback held, or whose shipped
  fallback has stopped matching. Recorded in health as `degraded` and reported by the drift
  canary as exit 5: not broken on screen, and the moment to act.
- **SettingsOp.** A description of a change to an account's settings, as plain data, so it
  can be sent to the service worker and applied there. See DATA_MODEL.md.
- **rev.** A counter on an account's stored settings, bumped on every write. Used to detect
  a concurrent change and to tell one's own write apart from someone else's.
- **Hash view.** Gmail encodes the current view in the URL fragment (for example
  `#inbox`, `#label/Work`, `#search/from%3Aboss`). The extension reads and sets this hash
  to navigate. Gmail writes a space as `+` and escapes a literal `+`, so a fragment is
  decoded only by `decodeGmailHashSegment` in `src/utils/gmailHash.ts`.
