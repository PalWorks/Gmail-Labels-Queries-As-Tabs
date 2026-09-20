# V2 Implementation Plan

Active-build scope (narrowed 2026-07-09 by product owner): **Custom tab colors** and the
**Automation rule template library**. The **Firefox port is deferred** (spike + port moved
to a later milestone). After both features land: check -> master audit -> Chrome Web Store
publish.

Created: 2026-07-08 · Narrowed: 2026-07-09
Status legend: [ ] pending, [~] in progress, [x] done + audited.

## Verification gate (run at the end of every phase)

Same gate as v1 (see [AGENTS.md](../AGENTS.md)):

- `npx tsc --noEmit` -> 0 errors
- `npx jest` -> all suites pass
- `npx jest --coverage` -> meets thresholds
- `npm run lint` -> 0 errors
- `npm run build` -> succeeds (esbuild `drop: ['console']` strips logs in prod)
- manifest and package versions match

## Phase status tracker

| Phase | Title | Status |
|-------|-------|--------|
| 1 | Custom tab colors | [ ] |
| 2 | Automation rule template library (one-click starter presets) | [ ] |
| 3 | Docs, changelog, version bump | [ ] |
| 4 | Check + master audit | [ ] |
| 5 | Chrome Web Store publish prep | [ ] |

---

## Phase 1: Custom tab colors

Goal: let a user assign an optional color to any tab; render it theme-safely and
accessibly on both the in-Gmail bar and the options page.

- Data: add optional `color?: string` (palette token, not raw hex) to `Tab` in
  [storage.ts](../src/utils/storage.ts). Absent = default. Backward compatible, no migration.
- Palette: new leaf util [src/utils/colors.ts](../src/utils/colors.ts) — `TabColor` token
  union, `TAB_COLORS`, `TAB_COLOR_LABELS`, `isValidTabColor()`.
- Shared picker: [src/modules/colorPicker.ts](../src/modules/colorPicker.ts) — accessible
  swatch control (radiogroup) reused by the edit modal and the options list popover.
- In-Gmail render: [tabs.ts](../src/modules/tabs.ts) adds a `tab-color-<token>` class;
  accent via left border + dot + tinted active bg in [toolbar.css](../src/ui/toolbar.css).
- Editing surfaces (both, per product owner): edit modal
  [editModal.ts](../src/modules/modals/editModal.ts) and options list rows via
  [tabListRenderer.ts](../src/utils/tabListRenderer.ts) + [tabManager.ts](../src/modules/tabManager.ts).
- Persistence: include `color` in export; validate against palette on import
  ([importExport.ts](../src/utils/importExport.ts)); invalid color falls back to default.
- A11y: color is decorative, never the sole indicator; labels/aria intact; swatches named.

## Phase 2: Automation rule template library (one-click starter presets)

Goal: a gallery of common cleanup templates; one click creates the matching label tab
(if missing) AND its enabled rule.

- Self-contained module [src/modules/ruleTemplates.ts](../src/modules/ruleTemplates.ts):
  single `RULE_TEMPLATES_ENABLED` feature flag, `RuleTemplate[]` definitions, and
  `applyRuleTemplate(accountId, template)` that loads settings, ensures the label tab,
  upserts the enabled rule, and saves once (atomic). Toggling the flag OFF removes the UI
  with no other code changes.
- Options UI: a templates gallery in the Rules section
  ([options.html](../src/options.html) / [options.ts](../src/options.ts) /
  [options.css](../src/options.css)), rendered only when the flag is on. Apply -> refresh
  tab list + rules list + feedback.

## Phase 3: Docs, changelog, version bump

- Update [README.md](../README.md), [CHANGELOG.md](../CHANGELOG.md),
  [DATA_MODEL.md](../DATA_MODEL.md) (`Tab.color`), [DECISIONS.md](../DECISIONS.md) (ADRs:
  palette-token colors; feature-flagged template library).
- Bump `manifest.json` + `package.json` together to v1.3.0.

## Phase 4: Check + master audit

Cross-feature cohesiveness, no unguarded state, no XSS via innerHTML, no unbounded timers,
lean-bundle check, full verification gate green.

## Phase 5: Chrome Web Store publish prep

Produce `extension.zip` via `npm run package`; confirm manifest/version; hand off to
product owner for upload (outward-facing — confirm before any submission).
