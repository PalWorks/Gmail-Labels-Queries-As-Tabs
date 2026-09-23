# SECURITY.md

Security and privacy policy for **Gmail Labels and Search Queries as Tabs**.

Last updated: 2026-09-22 (v1.6.2)

## Privacy promise

The extension makes **no background network requests**. It never sends browsing data,
analytics, or telemetry anywhere, and all settings stay in the user's browser storage. For
everything it does on its own, the only origin it touches is `mail.google.com`, using
Gmail's own feed, XHR responses, and DOM to compute unread counts.

One outbound call exists, and only when the user asks for it: pressing **Send Feedback** on
the Support & Feedback page posts the message, an optional reply address, and (if the box
stays ticked) the extension version, browser build and counts of tabs, rules and accounts.
Never label names, tab titles, contacts or mail. It goes to the relay in [worker/](worker/),
which holds the mail provider's API key precisely so the extension does not have to, and
which stores nothing.

One further outbound page exists, and only after you have already left: uninstalling opens
a short feedback form at `tally.so`, hosted by Tally. Chrome opens it in a new tab once the
extension is removed. Nothing is sent from the extension; the URL carries no address, no
settings and no identifier, so the form host learns only that somebody uninstalled, and
only you decide whether to answer it. See ADR-014.

The disclosure is enforced rather than promised: `test/repoConsistency.test.ts` fails the
build if the service worker names an outbound host that is missing from this file, the
in-extension privacy page or [STORE_LISTING.md](STORE_LISTING.md).

Any other request to a non `mail.google.com` origin, and any request the user did not
explicitly trigger, is a blocking defect. See [DECISIONS.md](DECISIONS.md) ADR-008 as
amended by ADR-012.

## Permissions and why each is needed

| Permission | Purpose |
|------------|---------|
| `storage` | Persist per-account tabs and rules, and the global theme |
| _(no permission)_ | The extension's own pages also write one value to `localStorage`: the theme they last painted, so the next page opens in it rather than flashing. It holds the string `light` or `dark` and nothing else, never leaves the browser, and needs no permission because a page may always write its own origin's storage |
| `downloads` | Let the user export their configuration as a JSON file |
| `management` | Enable self-uninstall from the settings page |
| `host_permissions: https://mail.google.com/*` | Inject the tab bar and read unread state in Gmail |

No `<all_urls>`, no broad host access, no scripting into other sites. In particular there is
no `scripting` permission. That is why InboxSDK's page world was never injected and
neither of its two features ever ran in a shipped build; the library was removed after
v1.6.2 and the content script now contains no third-party code at all. See the row in
[ARCHITECTURE.md](ARCHITECTURE.md) section 10.

## Where the published privacy policy lives

The policy the Chrome Web Store listing links to is
<https://palworks.github.io/Gmail-Labels-As-Tabs/#/privacy>, served from
[PalWorks/Gmail-Labels-As-Tabs](https://github.com/PalWorks/Gmail-Labels-As-Tabs), a
separate repository that deploys only on manual dispatch.

That separation has already failed once. A duplicate copy of the site lived in this
repository and deployed too, so two policies existed and drifted apart until the published
one claimed the extension transmits nothing, months after the feedback relay shipped. The
duplicate was deleted in v1.5.0 (ADR-016), and CI now fetches the live page and fails if it
omits any outbound host, any permission the manifest declares, or the analytics the site
itself runs. Treat that page as part of the release, not as marketing.

## Threat model and mitigations

- **XSS via user data.** Tab titles, label names, **tab ids** and imported configuration are
  user-controlled. All such strings must be inserted with `textContent` or `escapeHtml`,
  never via raw `innerHTML` interpolation, and
  [test/htmlSinks.test.ts](test/htmlSinks.test.ts) walks the AST and fails the build
  otherwise. An id is not exempt because it looks like a UUID: until v1.5.0 a tab id from an
  imported backup went unescaped into a `data-tab-id` attribute in the options page, which
  is an extension page with `chrome.*` access. Imported ids outside `[A-Za-z0-9_-]` are now
  replaced with fresh UUIDs at the boundary and the rules referencing them are repointed.
- **MAIN-world injection surface.** [src/xhrInterceptor.ts](src/xhrInterceptor.ts) runs in
  Gmail's page context. It only reads responses and posts sanitized results back over a
  `CustomEvent` channel; it must not expose extension internals or accept commands from
  the page. Label and count parsing is validated (bounded integer counts, rejection of
  id/date-looking keys, filtering against the set of known rendered labels).
- **Generated Apps Script safety.** [src/modules/rules.ts](src/modules/rules.ts) emits code
  the user runs under their own Google account, unattended, with destructive actions. Four
  separate protections, each for something that has gone wrong:

  | Protection | Guards against |
  |---|---|
  | `trash` uses Gmail Trash, recoverable for 30 days; never permanent deletion | Irreversible loss |
  | `escapeForScript` for string literals, `escapeForComment` for block comments, applied per context | A `*/` in a tab title or an account id ending the comment and injecting live top-level code. Both have happened |
  | Every label is quoted in the search | `label:Old Stuff` being read as `label:Old AND Stuff`, trashing mail that was never in the label. An ordinary multi-word label was enough |
  | 200 threads per rule per run, and each thread re-checked for the exact label name before it is touched | A rule matching far more than intended running to completion |

  [test/rulesProperty.test.ts](test/rulesProperty.test.ts) drives 1,000 generated hostile
  inputs through the generator, evaluates each result, and fails on a parse error, a lossy
  round trip, an unquoted label, or any canary global being set.
- **No secrets.** The extension holds no API keys, OAuth tokens, or credentials. There is
  nothing server-side to compromise.

## Secrets handling

There are no secrets in this repository. Do not add API keys, tokens, or `.env` values.
`.env` is gitignored as a safety net only.

## Build integrity

The production bundle drops all `console` calls (`drop: ['console']`) and CI verifies no
`console.log` remains in `dist/js`. This avoids leaking internal state at runtime.

## Reporting a vulnerability

Use the **Support & Feedback** page inside the extension, or write to
<support@palworks.ai>, to report a security concern privately. Do not open a public issue
with exploit details.

## Build integrity: what ships

The package contains only what the manifest declares. Two promo tiles reached users for
four versions because the copy step globbed a directory; CI now fails if `dist/icons` holds
a file `manifest.json` does not name. Anything that is not loaded by a page or named by the
manifest does not belong in the zip: it is bytes every user downloads and a reviewer has to
account for.
