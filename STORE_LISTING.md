# Chrome Web Store listing

Everything the CWS Dashboard asks for, in the order the dashboard asks for it. Copy each
block verbatim. Character counts are the store's limits, and the counts shown are what the
text below actually uses.

**Version this listing describes:** 1.4.0
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

The cleanup rules do not run on our servers, because we do not have any. The extension
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

We ask for three permissions and use each for one thing: storage to save your tabs,
downloads to let you export a backup file, and management so the uninstall button in
Settings can remove the extension cleanly.

WHO IT IS FOR

Anyone whose Gmail has more than a handful of labels: support inboxes, freelancers juggling
clients, anyone running several Gmail accounts in one browser, and people who live in
saved searches.

OPEN SOURCE

The full source is public and auditable, with 479 automated tests covering storage,
rendering, accessibility and the automation script generator.

Website: https://palworks.github.io/Gmail-Labels-As-Tabs
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

**Important:** these answers changed in 1.4.0. Earlier versions transmitted nothing at all.
The in-product feedback form is the reason "Personally identifiable information" is now
Yes. If the form is ever removed, the answer goes back to No.

### Privacy policy URL

```
https://palworks.github.io/Gmail-Labels-As-Tabs/#/privacy
```

Before submitting, confirm that page states the feedback exception in the same words as the
extension's own Privacy tab. A mismatch between the two is a common rejection reason.

---

## 4. Contact and links

| Field | Value |
|---|---|
| Homepage URL | `https://palworks.github.io/Gmail-Labels-As-Tabs` |
| Support URL | `https://palworks.github.io/Gmail-Labels-As-Tabs/#/#contact` |
| Support email | `support@palworks.ai` |

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
5. No analytics, no telemetry, no servers

---

## 6. Release notes for 1.4.0

```
New: send feedback without leaving the extension. The Support & Feedback page now has a
form; diagnostics are opt-in and never include your labels, tab names or mail.

Accessibility: every text color in the options page and the tab bar now meets WCAG AA
contrast in both light and dark themes.

Fixed: System theme now follows Gmail's own theme rather than your operating system, so a
light Gmail on a dark desktop no longer gets a dark tab bar. Your account now appears in
Settings as soon as you open Gmail, even before you change anything. Unread counts recover
from a stalled network instead of freezing.
```

---

## 7. Pre-submission checklist

- [ ] `npm run package` produces `extension.zip` from a clean `main`
- [ ] `manifest.json` and `package.json` both read 1.4.0
- [ ] Privacy policy page updated with the feedback exception before submitting
- [ ] Data usage answers updated (PII: Yes, because of the feedback form)
- [ ] Screenshots contain no real inbox content, sender names or subject lines
- [ ] Feedback relay reachable: `curl https://gmail-tabs-feedback.sunmooncal.workers.dev/health`
- [ ] Test the packaged zip in a clean Chrome profile before uploading
