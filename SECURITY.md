# SECURITY.md

Security and privacy policy for **Gmail Labels and Search Queries as Tabs**.

Last updated: 2026-09-21 (v1.4.0)

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

Any other request to a non `mail.google.com` origin, and any request the user did not
explicitly trigger, is a blocking defect. See [DECISIONS.md](DECISIONS.md) ADR-008 as
amended by ADR-012.

## Permissions and why each is needed

| Permission | Purpose |
|------------|---------|
| `storage` | Persist per-account tabs and rules, and the global theme |
| `downloads` | Let the user export their configuration as a JSON file |
| `management` | Enable self-uninstall from the settings page |
| `host_permissions: https://mail.google.com/*` | Inject the tab bar and read unread state in Gmail |

No `<all_urls>`, no broad host access, no scripting into other sites.

## Threat model and mitigations

- **XSS via user data.** Tab titles, label names, and imported configuration are
  user-controlled. All such strings must be inserted with `textContent` or an escape
  helper, never via raw `innerHTML` interpolation. Imported JSON is validated before use.
- **MAIN-world injection surface.** [src/xhrInterceptor.ts](src/xhrInterceptor.ts) runs in
  Gmail's page context. It only reads responses and posts sanitized results back over a
  `CustomEvent` channel; it must not expose extension internals or accept commands from
  the page. Label and count parsing is validated (bounded integer counts, rejection of
  id/date-looking keys, filtering against the set of known rendered labels).
- **Generated Apps Script safety.** [src/modules/rules.ts](src/modules/rules.ts) emits code
  the user runs under their own Google account. The `trash` action uses Gmail Trash
  (recoverable for 30 days); the generator never performs permanent deletion.
- **No secrets.** The extension holds no API keys, OAuth tokens, or credentials. There is
  nothing server-side to compromise.

## Secrets handling

There are no secrets in this repository. Do not add API keys, tokens, or `.env` values.
`.env` is gitignored as a safety net only.

## Build integrity

The production bundle drops all `console` calls (`drop: ['console']`) and CI verifies no
`console.log` remains in `dist/js`. This avoids leaking internal state at runtime.

## Reporting a vulnerability

Use the support form linked from the extension's options page (Get in Touch section) to
report a security concern privately. Do not open a public issue with exploit details.
