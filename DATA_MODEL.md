# DATA_MODEL.md

Storage schema and data shapes for **Gmail Labels and Search Queries as Tabs**. The
source of truth is [src/utils/storage.ts](src/utils/storage.ts); this file explains it.

Last updated: 2026-09-23 (v1.7.1)

## Storage areas

The extension uses two Chrome storage areas deliberately, plus one browser-local cache:

| Area | Holds | Why |
|------|-------|-----|
| `chrome.storage.sync` | Per-account settings, keyed `account_<email>` | Syncs a user's tabs and rules across their signed-in Chrome instances |
| `chrome.storage.local` | Global theme, key `globalTheme` | Browser-wide, per-window appearance; deliberately not device-synced so all accounts in one window match |
| `chrome.storage.local` | Last theme Gmail was seen in, key `detectedGmailTheme` | The options page and the toolbar menu have no Gmail DOM to sample, so they read what the content script saw. Only ever written from a real reading, never from a guess |
| `chrome.storage.local` | A pending first-run tour, key `pendingOnboarding` | Set on install, read and cleared by the first Gmail tab to finish initialising |
| `chrome.storage.local` | Whether the Gmail integrations are working, key `integrationHealth` | The options page has no Gmail DOM to test against, and the drift canary only ever sees one account in one A/B bucket. A Gmail tab records its verdict here; the options page shows it. Written only when the verdict changes, and never transmitted |
| `localStorage` (extension origin) | The theme this browser last painted, key `glt.resolvedTheme` | The only storage a page can read **without yielding**. See below |

There is no server and no other persistence. Exported config is a JSON blob the user
downloads via the `downloads` permission.

### Why a `localStorage` cache exists at all

Every `chrome.storage` read is asynchronous, so an extension page has a window between
"HTML parsed" and "storage answered" in which it must paint something. Until v1.6.2 it
painted its stylesheet's default, which for the options page is a dark theme: the page
opened black, drew its elements, then turned light. A user reported it as a flash, and it
was, but the flash was the only symptom: every final state was correct.

`localStorage` is synchronous, so [src/themeBoot.ts](src/themeBoot.ts) can read it and
stamp the theme before any content is parsed. It holds a resolved `light` or `dark`, never
`system`, and it is written by every extension page that settles on a theme
([src/modules/themeMirror.ts](src/modules/themeMirror.ts)).

Three properties worth knowing:

- **It is a cache, not a source of truth.** `chrome.storage.local` still decides, a few
  milliseconds later, and overwrites it.
- **It is per-profile and never synced**, which is correct: it describes what this browser
  last painted, not what the user prefers.
- **The Gmail content script cannot write it.** Gmail is a different origin. Change the
  theme from the in-Gmail modal and the next options page load may open in the old theme
  for one frame before correcting. A stale cache costs a frame; it never costs a wrong
  final state.

### Why integration health is stored at all

The label-menu item depends on structure Gmail owns and changes, and Gmail runs
experiments: a layout present for us can be absent for a slice of users. Nothing run
locally will ever show that, so the extension records whether its last attempt worked and
the options page shows it, with a button that copies a short diagnostic string.

Three properties hold it in place:

- **Nothing is transmitted.** Not on a schedule, not on a trigger. The user copies a string
  and decides where it goes. The listing's "nothing leaves the browser" is worth more than
  the convenience of an automatic report.
- **It is written only on change.** The menu decides its fate on every open, which is far
  too often to touch storage. A repeat of the stored verdict is dropped in
  [src/modules/health.ts](src/modules/health.ts) before any chrome call.
- **It carries nothing identifying.** No address, no label names, no tab titles. See
  [test/health.test.ts](test/health.test.ts), which asserts it.

```ts
integrationHealth = {
  labelMenu: {
    status: 'active' | 'unavailable' | 'not-attempted',
    reason?: 'no-account' | 'no-label-name' | 'no-menu' | 'no-model' | 'clone-mismatch',
    at: number   // epoch ms
  }
}
```

## Types

### Tab

```ts
interface Tab {
  id: string;                 // stable unique id
  title: string;              // display name shown on the tab
  type: 'label' | 'hash';     // navigation kind
  value: string;              // label name (type 'label') or raw hash (type 'hash')
  color?: TabColor;           // optional palette token; absent = default styling
}

type TabColor =
  | 'red' | 'orange' | 'yellow' | 'green'
  | 'teal' | 'blue' | 'purple' | 'pink';
```

`color` stores a named palette **token**, never a raw hex value, so the rendered
color is owned by CSS and stays theme-safe and accessible in light and dark. It is
always decorative (never the sole indicator of a tab). Absent means default styling.
On import, an unknown token is stripped (falls back to default) rather than rejected.
See [src/utils/colors.ts](src/utils/colors.ts).

### Rule

```ts
type RuleAction = 'trash' | 'archive' | 'markRead' | 'moveToLabel';

interface Rule {
  tabId: string;              // links to Tab.id
  action: RuleAction;
  daysOld: number;            // apply to messages older than this many days
  enabled: boolean;
  targetLabel?: string;       // required only when action is 'moveToLabel'
}
```

### Settings (per account)

```ts
interface Settings {
  tabs: Tab[];
  rules: Rule[];
  labels?: LegacyTabLabel[];  // legacy, retained only for migration
  theme: Theme;               // retained for migration seeding, see note below
  showUnreadCount: boolean;
  rev?: number;               // optimistic-concurrency token, see below
}

type Theme = 'system' | 'light' | 'dark';
```

### Default settings

New accounts start with two `hash` tabs (Inbox `#inbox`, Sent `#sent`), no rules,
`showUnreadCount: true`, `theme: 'light'` and `rev: 0`.

### rev

`rev` is bumped by one on every successful write. It is absent in anything written before
v1.5.0, which reads as `0`, so no migration is needed.

Nothing outside the write path may set it. `applyOp` strips `rev` from a merge patch,
because callers routinely pass back a whole `Settings` object they read earlier and that
object carries a stale value.

Two things use it:

- the local write path, to notice that the stored value changed between reading and writing;
- the options page, to tell its own write apart from one made in a Gmail tab when
  `chrome.storage.onChanged` fires, so it does not redraw for its own changes.

## Writing: ops, not objects

A change is described as data rather than applied to an object and saved:

```ts
type SettingsOp =
  | { kind: 'merge'; patch: Partial<Settings> }
  | { kind: 'addTab'; tab: Tab }
  | { kind: 'removeTab'; tabId: string }
  | { kind: 'updateTab'; tabId: string; updates: Partial<Tab> }
  | { kind: 'reorderTabs'; order: string[] }
  | { kind: 'setPrefs'; prefs: Partial<Pick<Settings, 'theme' | 'showUnreadCount'>> }
  | { kind: 'addRule'; rule: Rule }
  | { kind: 'upsertRule'; rule: Rule }
  | { kind: 'updateRule'; tabId: string; updates: Partial<Rule> }
  | { kind: 'removeRule'; tabId: string }
  | { kind: 'applyTemplate'; tab: Tab; rule: Rule };
```

`applyOp(current, op)` is pure: it never mutates its input, never touches a chrome API, and
returns the *same reference* when the op changes nothing so the caller can skip a write.
An op it does not recognise throws rather than returning `undefined`, because
`{ ...undefined }` would write an empty object over the account.

Two rules govern new ops:

1. **Serializable.** An op crosses `chrome.runtime.sendMessage` into the service worker, so
   it must be plain data. Generate ids in the caller, not in the reducer.
2. **Idempotent.** If the worker applies an op and its reply is lost, the caller falls back
   and applies the same op again. Applying it twice must be indistinguishable from once.
   This is why `addTab` dedupes on id as well as value.

`reorderTabs` carries ids rather than tab objects on purpose. Callers build the order from
what they have rendered, which can be minutes out of date; ordering by id reorders what
actually exists and appends anything the caller never saw, instead of writing a stale array
over the top. See ADR-013.

## Theme storage note

Theme is browser-wide and lives in `chrome.storage.local` under `globalTheme`. The
per-account `Settings.theme` field is retained only so that the one-time migration can
seed the global value from a user's previous per-account choice. Read and write the
global theme through `getGlobalTheme()` and `setGlobalTheme()`, never by reading
`Settings.theme` directly. Default when unset is `light`.

That default is load-bearing elsewhere: it is why a page with no cached theme opens light
rather than asking the operating system. Light is what the extension is set to when
nothing is stored, so it is an answer rather than a guess. See ADR-020.

## Migrations

Implemented in [src/utils/storage.ts](src/utils/storage.ts):

- `migrateLegacySettingsIfNeeded(accountId)`: promotes very old top-level `tabs` / `labels`
  keys into an `account_<email>` record on first detection.
- `migrateThemeToGlobalIfNeeded(accountId)`: seeds `globalTheme` once. Priority order is
  an existing global value (no-op), then a legacy sync `theme` key (consumed and removed),
  then the account's own `Settings.theme`, else the `light` default.

## Export / import

[src/utils/importExport.ts](src/utils/importExport.ts) serializes tabs, rules, and the
theme into a portable JSON structure and restores them. Imported strings are user data and
must be validated and HTML-escaped on render. See [SECURITY.md](SECURITY.md).

## Storage limits

`chrome.storage.sync` caps at roughly 100 KB total, about 8 KB per item, 512 items, and 120
write operations per minute. One account is one item, so the 8 KB per-item ceiling is the
binding one: tabs and rules are small text records and realistic configurations stay well
under it, but keep new per-account fields compact.

The write-operations ceiling is why rule fields that accept free text coalesce their writes,
and why `applyOp` returns its input unchanged for a no-op so nothing is written at all.

## What concurrency control does not cover

`chrome.storage.sync` replicates through Chrome Sync, which resolves conflicts per key as
last-writer-wins and offers no hook for us. Serializing writes removes every race *within a
browser profile*; two devices editing the same account while offline will still lose one
side's edit on reconvergence. Shrinking that blast radius would mean one key per tab, which
trades a data-loss risk for a write-quota risk. Not done. See ADR-013.
