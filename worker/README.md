# Feedback worker

Relays the extension's in-product feedback form to email via Resend.

The extension cannot call Resend directly: a published CRX is a zip anyone can unpack, so
an API key inside it is a public key. This Worker holds the key instead, and is the only
server of ours the *running* extension contacts (see ADR-012 in
[DECISIONS.md](../DECISIONS.md)). The others are `mail.google.com` and, only if a user
turns on website icons for sender icons, Google's favicon service (see
[SECURITY.md](../SECURITY.md)).

One other host appears in the extension, and it is worth not confusing with this one: the
uninstall URL (ADR-014). Chrome opens it after the extension has already been removed, so
no code of ours runs and nothing is sent; it is a navigation, not a request.

Nor is it the website's contact form. That form, at `/contact/` on the marketing site
(which the extension's Help button opens), posts to a different Worker,
`gmail-tabs-contact.palworks.ai`, kept in the website repository's own `worker/` with its
own Resend key and KV. Nothing here deploys or configures it.

## What it does

`POST /feedback` with JSON:

```json
{
  "category": "bug|feature|question|other",
  "message": "…",
  "replyTo": "optional@example.com",
  "diagnostics": { "version": "1.3.0", "browser": "Chrome/153", "tabs": 6 }
}
```

It validates, rate limits per network, sends one email, and stores no message content.
`GET /health` returns `{ ok: true }`.

Protections: JSON only, 16KB body cap, 4000-character message cap, plausible-email check,
honeypot field (`website`) answered with a silent 200, and a generic error on provider
failure so no account detail leaks to the caller. Errors are always `{ "error": "..." }`,
which the extension shows as is.

Rate limits, cheapest first:

1. Cloudflare's `BURST` binding: about 3 a minute per network, per data centre. If the
   binding is missing or fails, the KV counters below still hold.
2. 5 messages per network per hour, a KV counter (`429`).
3. 300 messages a day for everyone together, a KV counter (`503`).

What it writes: only those counters. A network's counter is named by an HMAC-SHA256 of its
IP under the `IP_HASH_SECRET` secret, never the IP itself, and every key expires within
26 hours. The email carries the message, the category, the optional reply address and the
diagnostics the user left ticked; no IP and no country.

The Resend call times out after 8 seconds and answers `504`, inside the extension's own
12-second timeout, so a hung provider reads as "took too long" rather than a dead form.

## Setup

```bash
npm install
wrangler kv namespace create FEEDBACK_RATE_LIMIT   # then uncomment the binding in wrangler.toml
wrangler secret put RESEND_API_KEY                 # sending-only key from the Resend dashboard
openssl rand -base64 48 | wrangler secret put IP_HASH_SECRET
npm test && npm run typecheck                      # logic tests, plain Node; Resend is mocked
npm run deploy
```

`FEEDBACK_FROM` and `FEEDBACK_TO` live in `wrangler.toml` as plain vars; the API key and
`IP_HASH_SECRET` are secrets. The sending domain must be verified in Resend.

`IP_HASH_SECRET` must be set before this version is deployed: the Worker fails closed
without it, answering every `POST /feedback` with a `500` rather than falling back to the
raw IP. Rotating it only resets the per-network counters.

## Deployed instance

`https://gmail-tabs-feedback.sunmooncal.workers.dev`, Cloudflare account
`96ec2a31…` (Palaniappan.tn@gmail.com), served on workers.dev with preview URLs off.
KV namespace `FEEDBACK_RATE_LIMIT` = `447448e1…`. The Resend key is a sending-only key
scoped to the `palworks.ai` domain, stored as the `RESEND_API_KEY` secret and never in
this repo. Rate-limit binding `BURST`, namespace `2002` (the website's contact worker uses
`2001` on the same account).

## Pointing the extension at it

`FEEDBACK_ENDPOINT` in [../src/modules/feedback.ts](../src/modules/feedback.ts) holds the
deployed URL. Change it there and rebuild the extension if the Worker moves.
