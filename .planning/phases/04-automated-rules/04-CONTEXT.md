# Phase 4: Automated Tab Rules - Context

**Gathered:** 2026-02-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Add an Options page (admin panel) and automated tab rules system to the extension. The Options page is a standalone Chrome extension page (in addition to the existing Gmail-injected settings modal, which remains untouched). The rules system generates a Google Apps Script that users copy-paste into script.google.com to automate email actions on a schedule. Zero permission changes, zero OAuth, privacy-first preserved.

</domain>

<decisions>
## Implementation Decisions

### Options Page Architecture
- Full standalone options.html page accessible via chrome.action or right-click → Options
- Left navigation pane + right content pane layout (two-column)
- Navigation menu items: Settings, Automation Rules, User Guide, Privacy, Get in Touch, Logs / History
- The existing settings modal inside the Gmail inbox **stays exactly as-is** — not replaced
- The Options page Settings section mirrors the Gmail modal settings for convenience
- Dark theme consistent with extension branding (#1a1a2e background, #16213e cards, #0f3460 blue accent, amber/gold highlights)

### Automation Rules
- Per-tab rules only (not global rules targeting arbitrary labels)
- Supported actions: Trash, Archive, Mark as Read, Move to Label
- **Always trash** — never permanent delete. Even "delete" actions use moveToTrash()
- Each rule has: tab name, action dropdown, "After X days" number input, enable/disable toggle
- If action = "Move to Label": additional text input for target label name
- No dry run mode
- **Single unified "Generate Script" button** at the bottom — produces one comprehensive Apps Script handling all enabled rules
- NOT per-row script generation (would require multiple Apps Script projects — poor UX)
- Any rule change → user clicks Regenerate → re-pastes into existing Apps Script project

### Script Generation
- Generated script is valid Google Apps Script (GmailApp service)
- Script contains all enabled rules as a data array
- Maps actions to GmailApp methods: trash→moveToTrash(), archive→moveToArchive(), markRead→markRead(), moveToLabel→addLabel()+removeLabel()
- Each rule maps to a Gmail search query: `label:{labelName} older_than:{X}d`
- Includes error handling per rule (one failure doesn't stop others)
- Includes Google Sheet logging: script appends a row to a user-specified Sheet after each run

### User Guide Section
- Simple bulleted/numbered list format (not heavy wizard cards)
- Steps: Copy script → Open script.google.com → Paste & save → Set up trigger
- Clear, spoon-feeding instructions for non-technical users

### Get in Touch Section
- Tally form embed (URL to be provided by user later)

### Logs / History Section
- Extension cannot directly access Apps Script execution data (no OAuth bridge)
- Solution: Generated script includes Google Sheet logging code
- Script appends rows to a user-specified Google Sheet: "{count} emails {action} from {label} — {date}"
- Logs/History page shows link to "Open your Activity Sheet" and instructions
- One extra setup step for user: create blank Google Sheet, paste URL into script

### Claude's Discretion
- Exact CSS/styling details within the dark theme constraints
- Options page internal routing mechanism (hash-based or tab-based)
- Google Sheet logging format and columns
- Error state handling in the UI
- Loading states and transitions

</decisions>

<specifics>
## Specific Ideas

- Reference screenshot: user wants the options page layout like their "AI Suggested Replies for WhatsApp" extension — left sidebar with icons + nav labels, right side with section content
- The settings section should show the same modal that appears in Gmail inbox interface
- User Guide should be "much more simpler like a bulleted list" — not heavy card-based wizard
- Extension already has a `welcome.html` page — options.html follows the same standalone page pattern
- FEAT-05 from v2 backlog is being promoted to Phase 4

</specifics>

<deferred>
## Deferred Ideas

- Gmail API integration (OAuth-based, opt-in) for direct rule execution — Phase 5+ (long-term)
- DOM manipulation approach for email deletion — rejected, too fragile
- Per-row standalone script generation — rejected in favor of single unified script
- Script sends summary email (alternative to Sheet logging) — deferred, inbox clutter concern
- Apps Script execution monitoring from within extension — would require OAuth to Sheets API

</deferred>

---

*Phase: 04-automated-rules*
*Context gathered: 2026-02-28*
