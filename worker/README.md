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

## Pointing the extension at it

Set `FEEDBACK_ENDPOINT` in [../src/modules/feedback.ts](../src/modules/feedback.ts) to the
deployed URL, then rebuild the extension.
