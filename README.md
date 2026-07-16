# Speed-to-Lead Template

A productized lead-response service. When a prospect submits the client's website form, the service:

1. **Instantly** texts and emails the client's BD reps with the lead's details.
2. **After 3 minutes** (configurable), sends the lead a personal-feeling text and email from the rep, with copy that adapts to time of day.

Built to be copied per client and deployed for a new client in **5 business days or less**. See `docs/RUNBOOK.md` for the day-by-day playbook.

## Architecture

```
Client's existing form ──> their CRM (untouched, runs as always)
        │
        ├─ webhook / Zapier / attach snippet
        ▼
POST /api/leads ──> instant SMS + email to BD reps (admin alert)
        │
        └─> persistent queue ──(3 min, time-aware)──> SMS + email to the lead
```

- The client's form-to-CRM flow is never modified. This service runs **in parallel**, fed by a webhook, a Zapier zap, or a small JS snippet (see `docs/INTAKE-RECIPES.md`).
- Follow-up copy is time-aware: business hours get "I'm on a call, I'll call you right after"; evenings/weekends get "I'll reach out first thing next business day"; texts due between 9pm and 8am are held until 8am (TCPA quiet window). Emails always go out after the normal delay.
- Queued follow-ups persist to disk (`data/queue.json`) and survive restarts. Failed sends retry once after 60s.
- No Twilio/SMTP credentials? Everything runs in **simulation mode**, printing to console. Perfect for local testing.

## Quickstart (local, simulation mode)

```bash
npm install
npm start            # boots on :3000, SMS/email simulated in console
npm run test:lead    # fires a sample lead at it
npm run smoke        # full automated test suite (27 checks)
```

## Per-client setup

1. Copy this whole folder to a new repo for the client.
2. Fill in `client.config.json` (brand, rep name, timezone, field map, message copy). Values still set to `SET_ME` block production boot.
3. Copy `.env.example` to `.env` (locally) or enter the values in Render's dashboard (production).
4. Deploy: push to GitHub, create a Render Blueprint from `render.yaml`. **Starter plan required** (free tier sleeps and breaks the timers).
5. Connect the client's form: `docs/INTAKE-RECIPES.md`.

## Configuration reference

### client.config.json (safe to commit; content and behavior)

| Key | Purpose |
|---|---|
| `client.brandName` / `repName` / `website` | Used in message copy via `{{brandName}}` etc. |
| `client.timezone` | IANA zone for business-hours logic, e.g. `America/New_York` |
| `businessHours.startHour` / `cutoffHour` | In-hours window (24h). Inside it, leads get the "I'll call you right after" copy |
| `businessHours.smsQuietEndHour` / `smsQuietResumeHour` | Texts due inside 21:00-08:00 are held until 08:00 |
| `businessHours.workDays` | 0=Sun..6=Sat. Non-workdays always use after-hours copy |
| `intake.fieldMap` | Maps the client's form field names to canonical fields (`firstName`, `lastName`, `fullName`, `company`, `phone`, `email`). Aliases match nested webhook paths too. A lone `fullName` is auto-split |
| `cors.allowedOrigins` | Site origins allowed to call the API from a browser. Empty = browser intake off |
| `security.honeypotField` | Hidden form field name; non-empty value = silent spam drop |
| `security.rateLimit` | Sliding window per IP, default 10 requests / 10 min |
| `queue.maxLateMs` | Follow-ups overdue by more than this (default 24h) are dropped on restart rather than sent embarrassingly late |
| `messages.*` | All copy. Lead-facing SMS/email have `inHours` and `afterHours` variants |

Available placeholders: `{{firstName}}`, `{{lastName}}`, `{{fullName}}`, `{{company}}`, `{{phone}}`, `{{email}}`, `{{extras}}`, `{{brandName}}`, `{{website}}`, `{{repName}}`. Typos are flagged at boot.

### .env (secrets and targets; never commit)

| Var | Purpose |
|---|---|
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_FROM_NUMBER` | Twilio SMS credentials and the purchased number |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM_EMAIL` | Outbound email |
| `ADMIN_PHONE` / `ADMIN_EMAIL` | BD rep alert targets. Comma-separate for multiple |
| `FOLLOW_UP_DELAY_MS` | Lead follow-up delay. `180000` = 3 min. Use `5000` during go-live testing |
| `INTAKE_TOKEN` | Shared secret for webhook/Zapier callers (`?token=` or `X-STL-Token`). Required in production |
| `PORT` | Default 3000 (Render sets its own) |

## API

`POST /api/leads` accepts any JSON or form-encoded payload; `intake.fieldMap` normalizes it. A lead is accepted if it yields at least an email **or** a phone. Unmapped fields ride along as "extras" in the admin alert.

Auth: `INTAKE_TOKEN` via `?token=` / `X-STL-Token` header (webhooks/Zapier), or an allowlisted browser Origin (the integration kit). Note the Origin header is client-supplied, so allowlisting any origin makes the endpoint effectively public, like any hosted form endpoint; the rate limiter and honeypot handle abuse on that path. Leave `cors.allowedOrigins` empty for webhook-only clients to keep the endpoint strictly token-gated.

`GET /healthz` returns `{status, queueDepth, twilio, smtp, uptime}` (used by Render health checks).

## Repo map

- `src/` service code, `scripts/` test tools
- `integration-kit/` attach snippet + drop-in form for browser-based intake
- `compliance/` privacy/terms page templates with required A2P 10DLC wording
- `docs/` runbook, intake recipes, client questionnaire
