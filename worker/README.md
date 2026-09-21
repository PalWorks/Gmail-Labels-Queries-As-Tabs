# Feedback worker

Relays the extension's in-product feedback form to email via Resend.

The extension cannot call Resend directly: a published CRX is a zip anyone can unpack, so
an API key inside it is a public key. This Worker holds the key instead, and is the only
origin the extension contacts besides `mail.google.com` (see ADR-012 in
[DECISIONS.md](../DECISIONS.md)).

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

It validates, rate limits per IP, sends one email, and stores nothing. `GET /health`
returns `{ ok: true }`.

Protections: JSON only, 16KB body cap, 4000-character message cap, plausible-email check,
honeypot field (`website`) answered with a silent 200, 5 messages per IP per hour, and a
generic error on provider failure so no account detail leaks to the caller.

## Setup

```bash
npm install
wrangler kv namespace create FEEDBACK_RATE_LIMIT   # then uncomment the binding in wrangler.toml
wrangler secret put RESEND_API_KEY                 # sending-only key from the Resend dashboard
npm run deploy
```

`FEEDBACK_FROM` and `FEEDBACK_TO` live in `wrangler.toml` as plain vars; only the API key is
a secret. The sending domain must be verified in Resend.

## Deployed instance

`https://gmail-tabs-feedback.sunmooncal.workers.dev` — Cloudflare account
`96ec2a31…` (Palaniappan.tn@gmail.com), served on workers.dev with preview URLs off.
KV namespace `FEEDBACK_RATE_LIMIT` = `447448e1…`. The Resend key is a sending-only key
scoped to the `palworks.ai` domain, stored as the `RESEND_API_KEY` secret and never in
this repo.

## Pointing the extension at it

`FEEDBACK_ENDPOINT` in [../src/modules/feedback.ts](../src/modules/feedback.ts) holds the
deployed URL. Change it there and rebuild the extension if the Worker moves.
