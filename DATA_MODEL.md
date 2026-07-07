# DATA_MODEL.md

Storage schema and data shapes for **Gmail Labels and Search Queries as Tabs**. The
source of truth is [src/utils/storage.ts](src/utils/storage.ts); this file explains it.

Last updated: 2026-07-07 (v1.2.1)

## Storage areas

The extension uses two Chrome storage areas deliberately:

| Area | Holds | Why |
|------|-------|-----|
| `chrome.storage.sync` | Per-account settings, keyed `account_<email>` | Syncs a user's tabs and rules across their signed-in Chrome instances |
| `chrome.storage.local` | Global theme, key `globalTheme` | Browser-wide, per-window appearance; deliberately not device-synced so all accounts in one window match |

There is no server and no other persistence. Exported config is a JSON blob the user
downloads via the `downloads` permission.

## Types

### Tab

```ts
interface Tab {
  id: string;                 // stable unique id
  title: string;              // display name shown on the tab
  type: 'label' | 'hash';     // navigation kind
  value: string;              // label name (type 'label') or raw hash (type 'hash')
}
```

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
}

type Theme = 'system' | 'light' | 'dark';
```

### Default settings

New accounts start with two `hash` tabs (Inbox `#inbox`, Sent `#sent`), no rules,
`showUnreadCount: true`, and `theme: 'light'`.

## Theme storage note

Theme is browser-wide and lives in `chrome.storage.local` under `globalTheme`. The
per-account `Settings.theme` field is retained only so that the one-time migration can
seed the global value from a user's previous per-account choice. Read and write the
global theme through `getGlobalTheme()` and `setGlobalTheme()`, never by reading
`Settings.theme` directly. Default when unset is `light`.

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

`chrome.storage.sync` caps at roughly 100 KB total and about 8 KB per item. Tabs and rules
are small text records, so realistic configurations stay well under these limits. Keep new
per-account fields compact.
