# Chrome Web Store listing

Everything the Chrome Web Store Developer Dashboard asks for, in the order it asks for it,
written to be found and to be quoted. Copy each fenced block verbatim.

**Version this listing describes:** 1.6.2
**Item ID:** `jemjnjlplglfoiipcjhoacneigdgfmde`
**Live listing:** https://chromewebstore.google.com/detail/gmail-labels-and-search-q/jemjnjlplglfoiipcjhoacneigdgfmde
**Last updated:** 2026-09-22

Three audiences read this listing, and the copy below is built for all three at once:

1. **People searching the store.** They see the title and the first 132 characters.
2. **Answer engines** (Google AI Overviews, Bing Copilot, Gemini) that lift a sentence to
   answer a question such as "does this extension read my email". They need short,
   self-contained, literally phrased answers.
3. **Generative engines** (ChatGPT, Perplexity, Claude) that recommend a tool by name when
   asked "best Chrome extension for Gmail labels". They need a consistent entity name,
   checkable numbers, and the same claims repeated on surfaces they can crawl.

Sections 1 to 5 are what you paste. Sections 6, 7 and 8 record why the words are the words,
so a future edit does not quietly undo the placement.

---

## 0. Field limits, at a glance

**Table T1: Fields, limits and what this document supplies**

| Dashboard field | Limit | Source of truth | This doc |
|---|---|---|---|
| Title / item name | 75 characters, ~45 shown before truncation | `manifest.json` `name`, not editable in the dashboard | 1.1 |
| Summary (short description) | 132 characters | Dashboard | 1.3 |
| Description (detailed) | 16,000 characters | Dashboard | 1.4 |
| Category | one primary | Dashboard | 1.5 |
| Language | one | Dashboard | 1.6 |
| Screenshots | 1280x800 or 640x400, 1 required, 5 allowed | Dashboard | 4 |
| Small promo tile | 440x280 | Dashboard | 4 |
| Marquee promo tile | 1400x560, featured placement only | Dashboard | 4 |
| Single purpose | free text | Privacy tab | 2.1 |
| Permission justifications | one per permission, keep each under 1,000 characters | Privacy tab | 2.2 |
| Data usage disclosure | checkboxes plus three certifications | Privacy tab | 2.4 |
| Privacy policy URL | required once data is declared | Privacy tab | 2.5 |

The character counts under each block below are what the text actually uses, counted, not
estimated. The dashboard is the authority on the limits themselves; where a number above
is a limit Google can change without notice, re-check it at upload rather than trusting
this table. [Unverified] The 75 character title limit and the 1,000 character justification
guidance are from Google's published developer documentation as of writing, not from a
dashboard reading taken today.

---

## 1. Store listing tab

### 1.1 Title (item name)

```
Gmail Labels and Search Queries as Tabs
```

39 characters, so nothing truncates. It matches `manifest.json`, which is what the store
displays: **the title is not editable in the dashboard.** Changing it means shipping a new
package and passing review again.

Keep it. It already carries the three terms people type ("gmail", "labels", "tabs") and
the differentiator nobody else has in their title ("search queries"). Renaming a published
item also breaks inbound links that use the old slug and costs whatever ranking history
the name has accumulated.

Alternatives, if the name is ever revisited (each within 45 characters):

| Candidate | Characters | Trade-off |
|---|---|---|
| `Gmail Labels and Search Queries as Tabs` | 39 | Current. Best keyword coverage, no verb |
| `Gmail Tabs: Labels and Saved Searches` | 37 | Leads with the head term, loses "queries" |
| `Tab Bar for Gmail: Labels and Searches` | 38 | Clearest about the form, weakest on search volume |

### 1.2 Subtitle

**There is no subtitle field in the Chrome Web Store.** The summary in 1.3 is what renders
directly under the title in search results and at the top of the detail page, so it does
the subtitle's job and must read as one.

Where a real subtitle is needed, on the website hero and the promo tiles, use:

```
Your labels and saved searches, as tabs above the inbox
```

55 characters. Consistent wording across the store, the site and the tiles is a GEO signal
in itself: it lets a model match the three surfaces to one product.

### 1.3 Summary (short description, 132 characters max)

```
Turn Gmail labels and saved searches into a tab bar above your inbox. Unread counts, colors, cleanup rules. No tracking.
```

120 characters. Structure is deliberate: the head phrase first ("Gmail labels", "tab
bar"), the three features that differentiate next, and the objection-killer last, because
"does it read my mail" is what loses installs in this category.

Alternates, both within the limit, if you want to test:

```
Your Gmail labels and saved searches as one-click tabs above the inbox, with live unread counts, colors and cleanup rules.
```

122 characters. Reads better, drops "No tracking".

```
Gmail labels and searches as tabs above your inbox: one click per view, live unread counts, tab colors, no tracking at all.
```

123 characters. Keeps both, slightly less natural.

### 1.4 Description (detailed, 16,000 characters max)

5,119 characters, counting the bullet glyph as one. Plain text: the store renders no
markdown, and the bullets below are literal `•` characters.

```
Gmail Labels and Search Queries as Tabs puts your Gmail labels and saved searches in a tab bar across the top of Gmail, so every view you use all day is one click away instead of a scan down the sidebar.

Add any label as a tab. Add any Gmail search as a tab too, so "invoices from last quarter" or "is:unread from:boss" becomes a permanent button rather than a query you retype. Gmail's own views work as well, such as #starred and #sent.

WHAT YOU GET

• Tabs for labels, saved searches and Gmail views, in a bar above your inbox
• Live unread counts on every tab, read from Gmail itself
• Tab colors from an accessible palette, so the views that matter stand out
• Drag to reorder, across as many rows as you need
• Your tabs sync to every Chrome you sign into
• Multi-account: each Gmail account keeps its own tabs, colors, order and rules
• Light, Dark and System themes, where System follows Gmail's own theme and not your desktop
• Cleanup rules with one-click starter templates: clear Promotions after 30 days, archive newsletters after 14, mark Social read after 7
• Export and import your whole configuration as a JSON file
• A one-minute guided tour, reopenable any time from the toolbar menu
• Full keyboard navigation and screen reader labels throughout

HOW IT WORKS

The extension runs only on mail.google.com. It reads your label list and your unread counts from the Gmail page you already have open, draws the tab bar under Gmail's toolbar, and saves your setup in Chrome's own storage. There is no account to create, no sign-in, and no server holding your settings.

CLEANUP THAT RUNS IN YOUR OWN ACCOUNT

Cleanup rules never run on our side. The extension writes a Google Apps Script that you paste into your own Google account and schedule yourself. You can read every line before you run it, and you can stop it whenever you like. Mail is moved to Trash, where Gmail keeps it for 30 days. Nothing is deleted permanently.

PRIVACY

No analytics. No telemetry. No tracking pixels. No remote configuration. Your tabs, labels and settings stay in your browser's own storage, synced by Chrome through your Google account the same way your bookmarks are.

Nothing is sent anywhere on its own. There is exactly one outbound request, and only when you ask for it: pressing Send Feedback on the Support page sends your message, your optional reply address, and, if you leave the box ticked, the extension version, your browser build, and how many tabs, rules and accounts you have. Never your label names, tab names, contacts or mail.

One page opens after you have already left: uninstalling opens a short feedback form at tally.so, so we can learn why. The link carries no address, no settings and no identifier, nothing is sent from the extension, and closing the tab answers nothing.

Three permissions, one use each. Storage saves your tabs. Downloads writes the backup file when you press Export. Management lets the Uninstall button inside Settings remove the extension cleanly.

QUESTIONS PEOPLE ASK

Does it read my email?
No. It reads your label names and unread counts from the Gmail page in your browser. Message content is never read, stored or sent anywhere.

Does it work with multiple Gmail accounts?
Yes. Each account, identified by its address, keeps its own tabs, colors, order and rules, and switching accounts switches the bar.

Do my tabs follow me to another computer?
Yes. They sync through Chrome's own sync, the same mechanism as your bookmarks, so signing into Chrome elsewhere brings them with you.

Can I pin a search, not just a label?
Yes. Any Gmail search works, for example is:unread from:boss or has:attachment older_than:30d, and becomes a tab you click like any other.

Does it work with Gmail dark mode?
Yes. Light, Dark and System are all supported, and System follows Gmail's own theme, so a light Gmail on a dark desktop still gets a light tab bar.

Does it slow Gmail down?
No. It draws one small bar on a page you have already loaded, and it fetches nothing of its own.

Is it free?
Yes. Free, no account, no upsell, and open source under the MIT license.

Does it work in Edge, Brave or Firefox?
It is built on Manifest V3 and published for Chrome. Chromium browsers that install from the Chrome Web Store, such as Edge, Brave and Opera, can run it. Firefox and Safari cannot.

How do I get my tabs back if something goes wrong?
Export your configuration to a JSON file from Settings at any time, and import it back into a fresh profile or a new machine.

WHO IT IS FOR

Anyone whose Gmail has more than a handful of labels: support and shared inboxes, freelancers juggling clients, anyone running several Gmail accounts in one browser, and people who live in saved searches.

OPEN SOURCE

The full source is public and auditable, with 721 automated tests covering storage, rendering, accessibility and the cleanup script generator.

Website: https://palworks.github.io/Gmail-Labels-As-Tabs/
Privacy policy: https://palworks.github.io/Gmail-Labels-As-Tabs/#/privacy
Source code: https://github.com/PalWorks/Gmail-Labels-Queries-As-Tabs
Support: support@palworks.ai
```

**One line in that block is not verified by a test or by a run:** "Chromium browsers that
install from the Chrome Web Store, such as Edge, Brave and Opera, can run it." The
extension has never been installed in Edge, Brave or Opera by us. It is a reasonable
statement about Manifest V3 extensions in general and it answers a question models are
asked constantly, which is why it earns its place. If you are not willing to support those
browsers when someone writes in, cut the sentence; do not soften it.

### 1.5 Category

**Primary:** Workflow & Planning

Note the store groups categories: Workflow & Planning sits under the Productivity group,
so "Productivity" is not a second category to select. There is one category field.

### 1.6 Language

English (United States)

---

## 2. Privacy tab

### 2.1 Single purpose

```
This extension adds a tab bar to Gmail that lets the user open their own Gmail labels and
saved searches in one click, and configure optional cleanup rules for those labels.
```

### 2.2 Permission justifications

Each block answers the reviewer's actual question, which is not "what does this permission
do" but "what does this extension do with it".

**`storage`**

```
Stores the user's tab configuration: which labels and searches are tabs, their order,
their colors, their cleanup rules, and the theme preference. Stored per Gmail account in
chrome.storage.sync so the same tabs appear on every Chrome the user signs into. No
browsing data, message content or contacts are stored.
```

**`downloads`**

```
Used only by the "Export Config" button in Settings, which saves the user's own tab and
rule configuration as a JSON file so they can back it up or move it to another profile.
The extension never downloads anything the user did not click to export.
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

### 2.3 Outbound hosts, for the reviewer

Two hosts appear in the source. Naming them here, unprompted, is cheaper than answering a
rejection.

| Host | When it is reached | What it carries |
|---|---|---|
| `gmail-tabs-feedback.sunmooncal.workers.dev` | Only when the user presses Send Feedback | The message, an optional reply address, and optional version and counts |
| `tally.so` | Only after uninstall, opened by Chrome, not by the extension | Nothing. A bare form URL with no identifier |

`https://mail.google.com/*` is the host permission, not an outbound call of our own.

### 2.4 Data usage disclosures

Tick exactly these, and no others.

**Table T5: What to declare**

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
versions transmitted nothing at all. They are unchanged in 1.5.0, 1.6.0, 1.6.1 and 1.6.2,
none of which add a permission or a new outbound path. The in-product feedback form is the reason
"Personally identifiable information" is Yes. If the form is ever removed, the answer goes
back to No.

The uninstall URL (`tally.so`, ADR-014) does not change any answer above. Chrome navigates
to it after removal and the extension attaches nothing to it, so no user data is collected
or transferred by us. It is listed because a reviewer will see
`chrome.runtime.setUninstallURL` in the service worker and is entitled to an explanation
without having to ask.

### 2.5 Privacy policy URL

```
https://palworks.github.io/Gmail-Labels-As-Tabs/#/privacy
```

This page states the storage model, both outbound paths in full, all four permissions, the
Apps Script boundary, and separately that the marketing site itself runs Google Analytics
and Microsoft Clarity while the extension runs neither.

#### Why this URL and not the other one

Two GitHub Pages sites answered for this product until 2026-09-21. The website was split
out into `PalWorks/Gmail-Labels-As-Tabs` on 2026-03-03, but the `website/` folder left
behind kept deploying a second copy at `palworks.github.io/Gmail-Labels-Queries-As-Tabs`.
Two privacy policies existed and drifted: the listing named one, the extension's help
button linked to the other, and the policy that was correct was on the copy nobody pointed
at.

The duplicate is gone. `website/` and its deploy workflow were deleted from this repository
and Pages was disabled on it, so exactly one privacy policy exists. Guards in
`test/repoConsistency.test.ts` fail the build if anything here names the retired site, if
the help link stops matching a real route, or if a `website/` folder reappears.

---

## 3. Contact and links

| Field | Value |
|---|---|
| Homepage URL | `https://palworks.github.io/Gmail-Labels-As-Tabs/` |
| Support URL | `https://palworks.github.io/Gmail-Labels-As-Tabs/#/contact` |
| Support email | `support@palworks.ai` |

The site has five routes: `/`, `/privacy`, `/terms`, `/changelog` and `/contact`. The last
one renders the homepage and scrolls to its contact section, which is why the extension's
own help button already points there. Confirmed present in the deployed bundle on
2026-09-22, not just in the website source.

An earlier draft of this file claimed `/contact` did not exist and pointed the Support URL
at the homepage instead. It does exist. The note is kept because the earlier draft is what
sent somebody looking.

---

## 4. Graphic assets

All generated from the real extension by `scripts/store-assets/build.mjs`. Files are in
[store-assets/](store-assets/).

**Table T6: Asset inventory**

| Asset | Size | File | Required? |
|---|---|---|---|
| Small promo tile | 440x280 | `store-assets/promo-small-440x280.png` | Yes |
| Marquee promo tile | 1400x560 | `store-assets/promo-marquee-1400x560.png` | Featured placement only |
| Screenshot 1 | 1280x800 | `store-assets/screenshot-1-tabs-in-gmail.png` | At least one required |
| Screenshot 2 | 1280x800 | `store-assets/screenshot-2-colors.png` | |
| Screenshot 3 | 1280x800 | `store-assets/screenshot-3-automation.png` | |
| Screenshot 4 | 1280x800 | `store-assets/screenshot-4-dark-mode.png` | |
| Screenshot 5 | 1280x800 | `store-assets/screenshot-5-privacy.png` | |
| Screenshot 6 | 1280x800 | `store-assets/screenshot-6-tour.png` | |

**The store has no caption field for screenshots.** Whatever the image has to say must be
in the image, which is why the generator draws a headline and a subhead onto every one.
Those strings, in upload order, are:

| # | Headline | Subhead |
|---|---|---|
| 1 | Your labels and searches, as tabs | One click per view, with live unread counts. Inbox content blurred for privacy. |
| 2 | Colour-code the views that matter | An accessible palette that stays readable in light and dark. |
| 3 | One-click cleanup rules | Starter templates generate a script that runs in your own Google account. |
| 4 | Light and dark, done properly | System mode follows the Gmail you are looking at, not just your operating system. |
| 5 | No analytics. No telemetry. | Read the whole policy in the extension: what is stored, and the two things that ever leave. |
| 6 | A one-minute tour, over your inbox | Six steps that show the bar working, not a description of it. Reopen it any time. |

All six were re-shot on 2026-09-22, against the build immediately before 1.6.2. Nothing
1.6.2 changed is visible in a still: both of its fixes are about frames that no longer
appear, so a screenshot of the fixed build is identical to these. Two things changed
beyond the version:

- **Screenshot 6 is new**: the tour, open over a real inbox, with the real tab bar visible
  above the panel. It is a capture of the running product, triggered through the same
  message the toolbar menu sends, not a mock-up of the tour.
- **Screenshot 2 was wrong and is fixed.** Its headline promised a colour palette and the
  crop showed the Theme and Add Tab cards instead: the palette opened below the fold, so
  the one asset about colour contained no colour picker. The capture now centres the row
  first and fails loudly if the palette is not inside the frame.

---

## 5. Release notes for 1.6.2

Paste this one. It covers 1.6.1 as well, which was never submitted.

```
Fixed: no more black flash. The tab bar used to appear over Gmail as a dark strip for a
moment before settling into your theme, and the settings page opened black before turning
light. Both were the extension painting a colour before it knew which one you wanted. It
now shows nothing rather than a guess, and the settings page opens in the theme you last
used.

Fixed: "System" means Gmail's theme, not your computer's. If your desktop is dark and your
Gmail is light, the tab bar, the tour, the toolbar menu and the settings page now all
follow Gmail. Your desktop is used only when no Gmail tab has reported a theme yet.

New in this release, if you have not seen it: a one-minute tour that shows what the
extension does instead of describing it. It opens over Gmail, and each step demonstrates
the tab bar right there in the panel. The last step is the theme picker, and your real tab
bar changes behind the panel as you choose. Reopen it any time from the toolbar icon, or
from Settings.

New: a menu behind the toolbar icon, with Configure tabs, Show me around, All settings and
Help & support. Clicking the icon used to do nothing at all unless you were on Gmail.
```

1.6.2 adds no permission, changes no data flow, and adds no outbound request. The one new
thing it stores is a single word, `light` or `dark`, in the browser's own local storage,
so an extension page can open in the right colour on its first frame.

The 1.6.1 notes, kept for the record since that version was never submitted:

```
Fixed: the theme chooser followed your computer instead of Gmail. If your desktop was dark
and your Gmail was light, choosing "System" gave you a dark tour and a dark toolbar menu
over a light inbox. What matters is the inbox the tab bar sits in, so "System" now means
Gmail's own theme everywhere, and falls back to your desktop only when no Gmail tab has
reported one. The same mistake was found and fixed in three other places, including a
dark flash on the tab bar itself while Gmail was still loading.
```

The 1.6.0 notes, still worth pasting if the two ship together:

```
New: a one-minute tour that shows what the extension does instead of describing it. It
opens over Gmail, and each step demonstrates the tab bar right there in the panel: labels
moving up out of the sidebar, a search being saved as a tab, unread counts filling in,
colors, dragging to reorder, and the cleanup script a rule generates. The last step is the
theme picker, and your real tab bar changes behind the panel as you choose.

New: a menu behind the toolbar icon, with Configure tabs, Show me around, All settings, and
Help & support. Clicking the icon used to do nothing at all unless you were on Gmail.

New: you can reopen the tour whenever you like, from that menu or from the Settings page.
It used to appear once, on install, and never again.
```

If 1.5.0's notes have not yet been published to the store, they are in
[CHANGELOG.md](CHANGELOG.md); the automation fix in that release matters to anyone with an
existing Apps Script, because their script keeps the old query until they regenerate it.

---

## 6. SEO: being found inside the store, and by Google

Two different indexes, two different jobs.

**Inside the Chrome Web Store.** The store indexes the title, the summary and the detailed
description. There is no keyword field, so every term has to live in prose. Ranking is also
weighted by installs, ratings and recency of update, which copy cannot fix; what copy can
do is match the query.

**On Google.** The store listing page itself ranks in web search for long-tail queries. The
title tag is the item name, and the meta description is drawn from the summary. This is the
second reason the summary must read as a standalone sentence rather than a feature list.

**Table T2: Target terms and where each is covered**

| Term | Intent | Where it appears now |
|---|---|---|
| gmail labels as tabs | Head, exact product | Title, summary, first sentence |
| gmail tabs extension | Head | Summary, first sentence |
| gmail tab bar | Head | Summary, HOW IT WORKS |
| gmail label manager | Adjacent | "Add any label as a tab" |
| gmail saved search shortcut | Differentiator | Second paragraph, FAQ "Can I pin a search" |
| gmail unread count extension | Feature | Bullet, HOW IT WORKS |
| gmail multiple accounts extension | Feature | Bullet, FAQ, WHO IT IS FOR |
| gmail dark mode extension | Feature | Bullet, FAQ |
| gmail inbox cleanup / auto archive gmail | Adjacent job | CLEANUP section, bullet |
| gmail extension no tracking / privacy | Objection | Summary, PRIVACY section, FAQ |
| gmail productivity extension | Broad | WHO IT IS FOR |

Placement rules that a future edit must not break:

- The first 132 characters carry the two head terms. That string is the summary, the search
  result snippet and the Google meta description at once.
- The first sentence of the description names the product in full, then says what it does.
  Both answer engines and the store snippet take from the top.
- Every feature term appears in at least two places: a bullet, which is scannable, and a
  sentence, which is quotable. A bullet alone is rarely extracted as an answer.

---

## 7. AEO: being the answer

Answer engines lift a sentence, not a page. The QUESTIONS PEOPLE ASK block exists so the
sentence they lift is one we wrote. Three rules make a block extractable: the question is
phrased the way a person types it, the answer opens with Yes or No, and the answer stands
alone without the question above it.

**Table T3: Question to answer map**

| Question a person asks | Answer block that covers it | Opens with |
|---|---|---|
| Does this Gmail extension read my email? | "Does it read my email?" | No |
| Does it work with multiple Gmail accounts? | Same wording | Yes |
| Do settings sync between computers? | "Do my tabs follow me to another computer?" | Yes |
| Can I save a Gmail search as a shortcut? | "Can I pin a search, not just a label?" | Yes |
| Does it support Gmail dark mode? | "Does it work with Gmail dark mode?" | Yes |
| Will it slow Gmail down? | "Does it slow Gmail down?" | No |
| Is it free? | Same wording | Yes |
| Does it work in Edge or Firefox? | "Does it work in Edge, Brave or Firefox?" | Neither, deliberately: the honest answer is conditional |
| How do I back up my tabs? | "How do I get my tabs back if something goes wrong?" | Direct instruction |

The privacy answers are first on purpose. "Does it read my email" is the single most asked
question about any Gmail extension, and an engine that cannot find our answer will
synthesise one from the permission list, which reads far worse than the truth.

The same questions should appear, worded identically, on the website as an FAQ with
`FAQPage` structured data. Identical wording across two surfaces is what lets an engine
treat them as corroborating rather than as two different products.

---

## 8. GEO: being recommended by name

A generative engine asked "what is the best Chrome extension for organising Gmail labels"
answers from what it can find, corroborate and cite. Four things make that possible.

**1. One entity name, everywhere.** "Gmail Labels and Search Queries as Tabs" is the name
in the manifest, the store, the website title, the GitHub repository description and the
first sentence of the description. Both READMEs and the website's structured data used to
say "Gmail Labels & Queries as Tabs" or "Gmail Labels as Tabs"; all three now carry the
full name, with "Gmail Labels as Tabs" kept as an `alternateName` so the short form people
actually type still resolves to the same entity. The repository directory is still
`Gmail-Labels-Queries-As-Tabs`, which is a URL rather than a name and is not worth
breaking inbound links over.

**2. Checkable numbers.** Models reproduce specifics far more readily than adjectives: 721
automated tests, three permissions, one outbound request, 30 days in Trash, five starter
templates, 1,280 by 800 screenshots. Every number in the listing is true and verifiable
from the public repository, which is the point: a number that survives checking gets
repeated.

**3. Corroboration off the store.** A single source is a claim. The same claim on the
store, the website, the GitHub README and a public changelog is a fact, as far as a
retrieval system is concerned.

**Table T4: Surfaces and their state**

Corrected on 2026-09-22 by reading the website repository rather than assuming. An earlier
draft of this table said the site had no `FAQPage` and no `SoftwareApplication` markup. It
had both, and had done for months.

| Surface | State |
|---|---|
| Store listing | Ready. Paste sections 1 to 5 |
| Extension README | Done. Heading now carries the full product name |
| Website homepage | Done. The extension's own tour is embedded under "Take the tour", running the same code, vendored into that repo by its own `sync-wizard.mjs` |
| Website FAQ | Done. Eleven questions, worded identically to section 7, feeding the existing `FAQPage` markup |
| `SoftwareApplication` JSON-LD | Done. Existed already, but named a different product and claimed version 1.0.0. Now the full name, the shipping version, licence, feature list, privacy and support URLs |
| `llms.txt` | Done, at `/Gmail-Labels-As-Tabs/llms.txt`. See the caveat below |
| `robots.txt` | Present, and names the AI crawlers explicitly. See the caveat below |
| Website `/changelog` | Keep publishing per release |
| Third-party mentions (blogs, Reddit, alternative-to directories) | None known. The largest gap, and the slowest to close |

**The caveat on both crawler files.** This is a GitHub Pages *project* site, so they serve
at `/Gmail-Labels-As-Tabs/robots.txt` and `/Gmail-Labels-As-Tabs/llms.txt`. Both
conventions put those files at the origin root, `palworks.github.io/`, which belongs to the
account and does not exist. So they document intent rather than enforce it. That costs
nothing in this direction: a missing `robots.txt` means everything is allowed, and allowed
is what we want. It would matter if we ever needed to *block* a crawler, which would then
require either a custom domain or a root Pages repository.

**4. Machine-readable identity.** What the website now carries, kept here because the
listing and the site have to agree and this file is where that agreement is recorded:

`index.html`, in the `<head>`:

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "Gmail Labels and Search Queries as Tabs",
  "applicationCategory": "BrowserApplication",
  "operatingSystem": "Chrome",
  "url": "https://palworks.github.io/Gmail-Labels-As-Tabs/",
  "downloadUrl": "https://chromewebstore.google.com/detail/gmail-labels-and-search-q/jemjnjlplglfoiipcjhoacneigdgfmde",
  "softwareVersion": "1.6.2",
  "license": "https://opensource.org/licenses/MIT",
  "isAccessibleForFree": true,
  "offers": { "@type": "Offer", "price": "0", "priceCurrency": "USD" },
  "description": "Turn Gmail labels and saved searches into a tab bar above your inbox, with live unread counts, tab colors and cleanup rules that run in your own Google account.",
  "featureList": [
    "Gmail labels as tabs",
    "Saved Gmail searches as tabs",
    "Live unread counts",
    "Per-account configuration",
    "Light, dark and Gmail-matching themes",
    "Cleanup rules as a Google Apps Script",
    "Export and import configuration as JSON"
  ]
}
</script>
```

`llms.txt` at the site root:

```
# Gmail Labels and Search Queries as Tabs

> A Chrome extension (Manifest V3) that puts Gmail labels and saved searches in a tab bar
> above the inbox, with live unread counts, tab colors, per-account configuration and
> optional cleanup rules that run as a Google Apps Script in the user's own account.

- Install: https://chromewebstore.google.com/detail/gmail-labels-and-search-q/jemjnjlplglfoiipcjhoacneigdgfmde
- Source: https://github.com/PalWorks/Gmail-Labels-Queries-As-Tabs
- Privacy: https://palworks.github.io/Gmail-Labels-As-Tabs/#/privacy
- Changelog: https://palworks.github.io/Gmail-Labels-As-Tabs/#/changelog

## Facts

- Free, MIT licensed, no account required.
- Runs only on mail.google.com. Message content is never read, stored or transmitted.
- Permissions: storage, downloads, management, and the host mail.google.com.
- One outbound request, and only on a user action: the feedback form.
- Settings sync through Chrome's own sync, per Gmail account.
```

A note on crawler policy, which is a decision rather than a task: allowing `GPTBot`,
`PerplexityBot`, `ClaudeBot` and `Google-Extended` in the website's `robots.txt` is what
makes the site quotable by those systems. Blocking them protects nothing here, because
every claim on the site is public marketing copy, and costs the citation.

---

## 9. Measuring whether any of this worked

**Table T7: What to watch, and where**

| Signal | Where | Cadence |
|---|---|---|
| Impressions and installs | CWS Developer Dashboard, Stats tab | Weekly for a month after publishing |
| Install conversion rate | Same, impressions against installs | Weekly. A summary rewrite moves this first |
| Queries reaching the listing | Google Search Console, if the website is verified. The store page itself is not yours to instrument | Monthly |
| Named recommendation | Ask ChatGPT, Perplexity, Gemini and Claude "best Chrome extension for Gmail labels as tabs" and record whether the product is named | Monthly, same wording each time so the answers are comparable |
| Uninstall reasons | The tally.so form | As they arrive |

The AI recommendation check is the only honest way to measure GEO today, and it is noisy.
Record the date, the exact prompt and the answer; a trend over five months is worth
something, a single reading is worth nothing.

---

## 10. Pre-submission checklist

Verified on 2026-09-22 against `main` at the 1.6.2 release commit.

- [x] `npm run package` produces the zip from a clean `main`
- [x] `manifest.json` and `package.json` both read 1.6.2 (CI checks parity)
- [x] Privacy policy page covers the storage model, both outbound paths, all four
      permissions, the Apps Script boundary, and the site's own analytics
- [x] Privacy policy URL points at the site this repository deploys, not the retired one.
      Guarded by `test/repoConsistency.test.ts`
- [x] Public changelog updated through 1.6.2
- [x] Permissions unchanged: storage, downloads, management, `https://mail.google.com/*`
- [x] The uninstall URL is a bare form link carrying no identifying parameter (asserted in
      `test/background.test.ts`; its disclosure is asserted in `test/repoConsistency.test.ts`)
- [x] Data usage answers reviewed: unchanged from 1.4.0
- [x] All six screenshots are 1280x800, re-shot for this submission, and contain only demo data
      (Inbox, Clients, Invoices, Newsletters, Unread from team)
- [x] Support URL points at `#/contact`, a route confirmed present in the deployed bundle

Still to do by hand, before submitting:

- [ ] Load the zip in a clean Chrome profile and click through once, including the tour.
      Install with a Gmail tab open, then again with none, to see both onboarding surfaces
- [ ] Paste sections 1.3, 1.4 and 5 into the dashboard, upload all six screenshots, submit

Done since, in the website repository (`PalWorks/Gmail-Labels-As-Tabs`), which nothing in
this build can verify and which deploys manually:

- The product tour is embedded on the homepage, running the extension's own code.
- The FAQ matches section 7 word for word, and feeds the `FAQPage` markup that was already
  there.
- The `SoftwareApplication` markup names the shipping product and version.
- `llms.txt` added; `robots.txt` names the AI crawlers.

Nothing is live until `gh workflow run deploy.yml --repo PalWorks/Gmail-Labels-As-Tabs
--ref main` has run and the page has been checked.

A note for next time: the website deploys **manually**, in both repositories. A change to
the privacy policy is not live, and must not be described as live, until
`gh workflow run deploy.yml --repo PalWorks/Gmail-Labels-As-Tabs --ref main` has run.
