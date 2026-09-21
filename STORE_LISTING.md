# Chrome Web Store listing

Everything the CWS Dashboard asks for, in the order the dashboard asks for it. Copy each
block verbatim. Character counts are the store's limits, and the counts shown are what the
text below actually uses.

**Version this listing describes:** 1.5.0
**Item ID:** `jemjnjlplglfoiipcjhoacneigdgfmde`
**Last updated:** 2026-09-21

---

## 1. Store listing tab

### Item name (45 characters max)

```
Gmail Labels and Search Queries as Tabs
```

39 characters. Matches `manifest.json`, so the listing and the installed extension agree.

### Short description (132 characters max)

```
Turn Gmail labels and saved searches into a tab bar. One click per view, unread counts, colors, and automation rules.
```

117 characters. The lead words are the two search phrases people actually type: "Gmail
labels" and "tabs".

### Detailed description

```
Gmail hides your labels in a sidebar you have to scan every time. This extension puts them
across the top of Gmail as tabs, so the views you use all day are one click away.

Add any label as a tab. Add any Gmail search as a tab too, so "invoices from last quarter"
or "unread from my manager" becomes a permanent button rather than a query you retype.

WHAT YOU GET

• Tabs for labels and saved searches, in a bar above your inbox
• Live unread counts on each tab, read from Gmail itself
• Custom tab colors from an accessible palette, so the important views stand out
• Drag to reorder; your order syncs across every Chrome you sign into
• Multi-account support: each Gmail account keeps its own tabs, colors and rules
• Light, dark and System themes that follow Gmail's own theme, not just your OS
• Automation rules with one-click starter templates: clean up Promotions after 30 days,
  archive newsletters after 14, mark Social read after 7
• Export and import your whole configuration as a JSON file
• Full keyboard navigation and screen-reader labels throughout

AUTOMATION THAT RUNS UNDER YOUR OWN ACCOUNT

The cleanup rules never touch us. The extension
generates a Google Apps Script that you paste into your own account and schedule yourself.
You can read every line before you run it, and you can stop it whenever you like. Emails
are moved to Trash, where Gmail keeps them for 30 days. Nothing is permanently deleted.

PRIVACY

No analytics. No telemetry. No tracking pixels. No remote config. Your tabs, labels and
settings stay in your browser's own storage, synced by Chrome through your Google account
the same way your bookmarks are.

The extension makes no background network requests at all. There is exactly one outbound
request, and only when you ask for it: pressing Send Feedback on the Support page sends
your message, your optional reply address, and (if you leave the box ticked) the extension
version, your browser build, and how many tabs, rules and accounts you have. Never your
label names, tab names, contacts or mail.

One page opens after you have already left: uninstalling opens a short feedback form at
tally.so, so we can learn why. The link carries no email address, no settings and no
identifier, nothing is sent from the extension, and closing the tab answers nothing.

We ask for three permissions and use each for one thing: storage to save your tabs,
downloads to let you export a backup file, and management so the uninstall button in
Settings can remove the extension cleanly.

WHO IT IS FOR

Anyone whose Gmail has more than a handful of labels: support inboxes, freelancers juggling
clients, anyone running several Gmail accounts in one browser, and people who live in
saved searches.

OPEN SOURCE

The full source is public and auditable, with 601 automated tests covering storage,
rendering, accessibility and the automation script generator.

Website: https://palworks.github.io/Gmail-Labels-As-Tabs/
Support: support@palworks.ai
```

### Category

**Primary:** Workflow & Planning
**Secondary (if prompted):** Productivity

### Language

English (United States)

---

## 2. Search terms and SEO

The store indexes the name, the short description and the detailed description. It does not
index a keyword field, so the terms below are placed inside the copy above rather than
listed separately.

**Table S1: Target search terms and where each one is covered**

| Term | Where it appears |
|---|---|
| gmail labels as tabs | Name, short description, first line |
| gmail tabs extension | Short description, detailed description |
| gmail label manager | "Add any label as a tab" paragraph |
| gmail saved search | "Add any Gmail search as a tab too" |
| gmail unread count | Feature bullet |
| gmail multiple accounts | Feature bullet, WHO IT IS FOR |
| gmail dark mode tabs | Feature bullet |
| gmail inbox cleanup / auto archive | AUTOMATION section |
| gmail productivity | WHO IT IS FOR |

Writing notes that matter for ranking and conversion: the first 132 characters are what
people see in search results, so they carry the two head terms; the first paragraph of the
detailed description states the problem before the solution, which is what reviewers and
readers both scan for; and the privacy section is explicit because "does this read my
email" is the objection that loses installs in this category.

---

## 3. Privacy tab

### Single purpose (required)

```
This extension adds a tab bar to Gmail that lets the user open their own Gmail labels and
saved searches in one click, and configure optional cleanup rules for those labels.
```

### Permission justifications

Each justification below explains what the permission does for the user, which is what the
reviewer is checking.

**`storage`**

```
Stores the user's tab configuration: which labels and searches are tabs, their order, their
colors, their automation rules, and the theme preference. Stored per Gmail account in
chrome.storage.sync so the same tabs appear on every Chrome the user signs into. No
browsing data, message content or contacts are stored.
```

**`downloads`**

```
Used only by the "Export Config" button in Settings, which saves the user's own tab and
rule configuration as a JSON file so they can back it up or move it to another profile. The
extension never downloads anything the user did not click to export.
```

**`management`**

```
Used only by the "Uninstall Extension" button in Settings, which calls
chrome.management.uninstallSelf() so the user can remove the extension from within its own
options page. The extension does not read, enable or disable any other extension.
```

**Host permission `https://mail.google.com/*`**

```
The extension's entire function is a tab bar inside Gmail, so it must run on Gmail's own
pages to inject that bar, read the user's label list, and read unread counts from Gmail's
Atom feed and its own network responses. It requests no other host.
```

**Remote code**

```
No. All code is bundled in the extension package. Nothing is fetched or evaluated at
runtime.
```

### Data usage disclosures

Tick exactly these, and no others.

**Table S2: What to declare**

| Data type | Collected? | What to say |
|---|---|---|
| Personally identifiable information | **Yes** | Only if the user types an email address into the feedback form, so we can reply |
| Health information | No | |
| Financial and payment information | No | |
| Authentication information | No | |
| Personal communications | No | Message content is never read, stored or transmitted |
| Location | No | |
| Web history | No | |
| User activity | No | No analytics, no clickstream, no telemetry |
| Website content | No | The extension reads Gmail's DOM to find labels and counts, but nothing leaves the browser |

Certifications to tick:

- I do not sell or transfer user data to third parties, outside of the approved use cases
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- I do not use or transfer user data to determine creditworthiness or for lending purposes

**Important:** these answers changed in 1.4.0, when the feedback form shipped. Earlier
versions transmitted nothing at all. They are unchanged in 1.5.0, which adds no permission
and no new outbound request.
The in-product feedback form is the reason "Personally identifiable information" is now
Yes. If the form is ever removed, the answer goes back to No.

The uninstall URL (`tally.so`, ADR-014) does not change any answer above. Chrome navigates
to it after removal and the extension attaches nothing to it, so no user data is collected
or transferred by us. It is listed here because a reviewer will see
`chrome.runtime.setUninstallURL` in the service worker and is entitled to an explanation
without having to ask.

### Privacy policy URL

```
https://palworks.github.io/Gmail-Labels-As-Tabs/#/privacy
```

This page was rewritten for 1.5.0 and is live. It states the storage model, both outbound
paths in full (the feedback relay and the uninstall form), all four permissions, the Apps
Script boundary, and separately that the marketing site itself runs Google Analytics and
Microsoft Clarity while the extension runs neither.

#### Why this URL, and not the other one

Two GitHub Pages sites answered for this product until 2026-09-21. The website was split
out of the extension repository into `PalWorks/Gmail-Labels-As-Tabs` on 2026-03-03, but the
`website/` folder left behind kept deploying a second copy at
`palworks.github.io/Gmail-Labels-Queries-As-Tabs`. Two privacy policies existed and drifted
apart: the listing named one, the extension's own help button linked to the other, and the
policy that was correct was on the copy nobody pointed at.

The duplicate is gone. `website/` and its deploy workflow were deleted from this repository
and Pages was disabled on it, so exactly one privacy policy exists. Guards in
`test/repoConsistency.test.ts` fail the build if anything here names the retired site, if
the help link stops matching a real route, or if a `website/` folder reappears.

---

## 4. Contact and links

| Field | Value |
|---|---|
| Homepage URL | `https://palworks.github.io/Gmail-Labels-As-Tabs/` |
| Support URL | `https://palworks.github.io/Gmail-Labels-As-Tabs/#/contact` |
| Support email | `support@palworks.ai` |

The site has four routes (`/`, `/privacy`, `/terms`, `/changelog`) and no contact page, so
the Support URL is the homepage. An earlier draft of this file gave
`.../#/#contact`, which is not a route and resolves to the homepage anyway with a
malformed fragment. Add a `/contact` route before pointing at one.

---

## 5. Graphic assets

All generated at the exact sizes the store requires. Files are in
[store-assets/](store-assets/).

**Table S3: Asset inventory**

| Asset | Size | File | Required? |
|---|---|---|---|
| Small promo tile | 440x280 | `store-assets/promo-small-440x280.png` | Yes, for the store listing |
| Marquee promo tile | 1400x560 | `store-assets/promo-marquee-1400x560.png` | Only for featured placement, but worth having |
| Screenshot 1 | 1280x800 | `store-assets/screenshot-1-tabs-in-gmail.png` | At least one required, five allowed |
| Screenshot 2 | 1280x800 | `store-assets/screenshot-2-colors.png` | |
| Screenshot 3 | 1280x800 | `store-assets/screenshot-3-automation.png` | |
| Screenshot 4 | 1280x800 | `store-assets/screenshot-4-dark-mode.png` | |
| Screenshot 5 | 1280x800 | `store-assets/screenshot-5-privacy.png` | |

Screenshot captions, in upload order:

1. Your labels and saved searches, as tabs across Gmail
2. Color-code the views you care about
3. One-click cleanup rules that run in your own account
4. Light, dark, and following Gmail's own theme
5. The whole privacy policy, in plain words, inside the extension

---

## 6. Release notes for 1.5.0

```
Important fix for automation rules: a label whose name contains a space, such as "Old
Stuff", was being searched as two separate words, so a rule could act on mail that was
never in that label. Labels are now matched exactly, each run is capped, and every
conversation is re-checked against the label before anything happens to it. If you use
automation rules, regenerate your script from the Rules page.

Fixed: settings no longer get lost when you change them in two places at once. Editing
tabs in Gmail while the options page is open used to be able to overwrite one change with
the other; every change is now applied in order. The options page also updates itself
immediately when you change something in a Gmail tab.

Fixed: unread counts no longer read as zero after a dropped request. A failed check keeps
the last known count and retries with a growing delay instead of showing nothing.

Fixed: the tab bar picks the right theme on a slow connection, where Gmail's own styling
can arrive after the extension has already drawn.

Accessibility: two remaining colors now meet WCAG AA contrast.

Privacy: the privacy page now spells out exactly what the uninstall feedback form is and
what it does not carry.
```

Regenerating the Apps Script is worth calling out in the listing text as well as here: an
existing script on someone's account keeps the old, unquoted query until they replace it.

---

## 7. Pre-submission checklist

Verified on 2026-09-21 against `main` at the 1.5.0 release commit.

- [x] `npm run package` produces `extension.zip` from a clean `main`
- [x] `manifest.json` and `package.json` both read 1.5.0 (CI checks parity)
- [x] Privacy policy page rewritten for 1.5.0: storage model, both outbound paths, all four
      permissions, the Apps Script boundary, and the site's own analytics stated separately
- [x] Privacy policy URL now points at the site this repository deploys, not the stale one.
      Guarded by `test/repoConsistency.test.ts`
- [x] Public changelog updated through 1.5.0
- [x] Screenshots regenerated against the shipping build; all five are 1280x800 and contain
      only demo data (Inbox, Clients, Invoices, Newsletters)
- [x] Feedback relay reachable: `/health` returns `{"ok":true}`
- [x] Permissions unchanged: storage, downloads, management, `https://mail.google.com/*`
- [x] The uninstall URL is set, is a bare form link, and carries no identifying parameter
      (asserted in `test/background.test.ts`; disclosure asserted in
      `test/repoConsistency.test.ts`)
- [x] Data usage answers reviewed: unchanged from 1.4.0, PII stays Yes because of the
      feedback form

Still to do by hand:

- [ ] Load `extension.zip` in a clean Chrome profile and click through once
- [ ] Upload, paste the 1.5.0 release notes from section 6, and submit

A note for next time: the website deploys **manually** now, in both repositories. A change
to the privacy policy is not live, and must not be described as live, until
`gh workflow run deploy.yml --repo PalWorks/Gmail-Labels-As-Tabs --ref main` has run.
