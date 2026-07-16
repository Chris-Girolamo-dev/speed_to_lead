# Deployment Runbook: New Client in 5 Business Days

Work top to bottom. **A2P registration (Day 1) is the critical path**: carrier approval takes anywhere from a day to 3+ weeks, so it gets submitted first and everything else proceeds in parallel while it's pending.

## Pick the launch tier first

Before Day 1, decide which channel tier this client starts on (questionnaire Section 2 asks their preference). The service runs identically either way; the only difference is whether Twilio credentials are configured.

- **Email-only (instant-on):** launch same day. No A2P, no Twilio, no phone number. The lead gets an instant rep alert email and a delayed personal follow-up email. Use this to onboard fast, start billing, and prove value while A2P for the full tier bakes in the background. Follow the **Email-only fast path** section below instead of the SMS infrastructure steps.
- **SMS + email (flagship):** the full guarantee-grade product. Requires A2P registration (the slow part), so start it Day 1. This is the default and what the booked-calls guarantee rests on.

**Recommended default:** launch email-only on Day 1 *and* submit A2P the same day. Email carries the client from day one; when A2P clears you add the Twilio credentials and SMS lights up as a felt upgrade with zero code change.

## Day 0: Intake

- [ ] Send the client `docs/INTAKE-QUESTIONNAIRE.md` and get it back completed.
- [ ] Get a screenshot or URL of the client's existing contact form (you need its exact field names).
- [ ] Identify the intake path: form platform webhook, Zapier, or JS snippet (see `docs/INTAKE-RECIPES.md`). Capture a sample payload if webhook/Zapier.
- [ ] Confirm the launch tier (email-only vs SMS + email) from questionnaire Section 2.

## Day 1: Compliance pages + A2P registration (critical path)

> **Skipping to email-only?** Jump to the **Email-only fast path** section below. Come back to these SMS steps when you're ready to add the SMS tier (you can start A2P now regardless, since it's the slow part).

- [ ] Confirm the client's site has a Privacy Policy containing the required mobile-information disclaimer. If not, generate pages from `compliance/*.template.html` (find-and-replace the `{{TOKENS}}`) and get them published on the client's domain. Carriers reject A2P campaigns whose privacy policy lacks this wording.
- [ ] **Create the client as a subaccount under your master Twilio account** (Console -> Account -> Subaccounts -> Create). This is the default for the productized service: you provision it in minutes, billing consolidates to you (baked into the client's monthly fee), and you reclaim the number and subaccount if they churn. You hold the master credentials; the client never touches Twilio. (Only create a standalone account the client owns if they specifically require direct ownership/billing.) Upgrade the account (minimum $20 deposit).
- [ ] Buy a **local** phone number with SMS capability (~$1.15/mo) **inside that subaccount**. Match the client's area code if possible.
- [ ] Submit **A2P 10DLC Brand registration** in the Twilio Console (Messaging -> Regulatory Compliance), inside the client's subaccount. This is always per-client: the Brand is the client's legal business (their EIN/address), so it can never be shared across clients even though they live under your one master account. Use "Standard" for corporations (needs EIN from the questionnaire), "Sole Proprietor" for individuals.
- [ ] Submit the **Campaign registration**. Ready-to-paste answers:
  - Use case: "Low volume mixed" or "Customer care"
  - Campaign description: "When a prospective customer submits the contact form on our website requesting information, we send a single text message confirming receipt and coordinating a follow-up call they requested."
  - Sample message 1: paste `messages.leadSms.inHours` from `client.config.json` (with placeholders filled with example values)
  - Sample message 2: paste `messages.leadSms.afterHours` the same way
  - Opt-in description: "Customers provide their phone number voluntarily via our website contact form when requesting a callback."
- [ ] Note: while A2P is pending, SMS to non-verified numbers may be filtered or blocked. Email follow-ups work immediately.

## Day 2: Infrastructure

- [ ] Provision SMTP: Google Workspace app password, SendGrid, or Mailgun. Ideally sending from the BD rep's real domain so replies land in their inbox.
  - Google: smtp.gmail.com / 587 / rep's address / app password (requires 2FA on the account)
  - SendGrid: smtp.sendgrid.net / 587 / user `apikey` / pass = API key; verify the sending domain
- [ ] Copy this template folder to a fresh private GitHub repo named for the client.
- [ ] Generate an intake token: `node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"`

## Day 3: Configure + deploy

- [ ] Fill in every `SET_ME` in `client.config.json`: brand, rep name, timezone, business hours.
- [ ] Build `intake.fieldMap` from the client's actual form field names (Day 0 screenshot / sample payload).
- [ ] Rewrite `messages.*` copy with the client's approved wording from the questionnaire. Keep the casual, human voice. **No em dashes.**
- [ ] Local check: `npm install && npm run smoke` (all checks green).
- [ ] Local check: `npm run test:lead -- --raw '<paste the captured sample payload JSON>'` and confirm the lead normalizes correctly in the logs.
- [ ] Push to GitHub. In Render: New -> Blueprint -> select the repo. **Starter plan** (the free tier sleeps and breaks follow-up timers).
- [ ] Enter all env vars in the Render dashboard (from `.env.example` checklist).
- [ ] Verify `https://<service>.onrender.com/healthz` returns `"status":"ok"` with `twilio:true, smtp:true`.

## Day 4: Connect the form

- [ ] Wire the intake path chosen on Day 0 (`docs/INTAKE-RECIPES.md`): platform webhook, Zapier zap, or GTM/JS snippet.
- [ ] If browser-based (snippet or drop-in form): add the site origin to `cors.allowedOrigins`, commit, redeploy.
- [ ] Submit a test on the client's REAL form and confirm the lead appears in the Render logs with all fields mapped.
- [ ] Confirm the client's own CRM/notification flow still works exactly as before.

## Day 5: Live test + go-live

- [ ] Set `FOLLOW_UP_DELAY_MS=5000` in Render env (service restarts automatically).
- [ ] Submit a test lead with YOUR phone and email via the real form. Verify within seconds:
  - [ ] Admin SMS arrives at every number in `ADMIN_PHONE`
  - [ ] Admin email arrives at every address in `ADMIN_EMAIL`
  - [ ] Your phone gets the follow-up text (~5s), correct time variant
  - [ ] Your inbox gets the follow-up email (~5s)
- [ ] Test after-hours copy: temporarily set `businessHours.cutoffHour` below the current hour, redeploy, submit, confirm the after-hours variant. Revert.
- [ ] Restart-recovery check: submit a lead, restart the service from the Render dashboard before the follow-up fires, confirm it still sends after boot (queue recovery).
- [ ] Set `FOLLOW_UP_DELAY_MS=180000`. Final end-to-end test at full delay.
- [ ] Hand the client: service URL, `/healthz` link, where the lead log lives, and who to contact when they change reps or hours (that's a one-line config change).

## Email-only fast path (same-day launch)

Use this to go live in hours instead of days by skipping everything SMS. The service already runs email-only automatically: with no Twilio credentials set, it sends the email alerts and follow-ups and simply skips SMS. "Email-only" is a configuration state, not different code.

> **Even faster, no server:** for a pilot you can skip deploying the Node service entirely and run the whole email-only flow in Make.com. Import `automations/make-speed-to-lead-email.json` (instructions in `automations/README.md`).

- [ ] Skip all Twilio steps (no subaccount, no number, no A2P). Nothing to wait on.
- [ ] Day 2 SMTP setup still applies: provision email sending from the rep's domain.
- [ ] Configure `client.config.json` as normal (brand, rep, timezone, hours, field map, message copy). The `leadSms` copy can stay as-is; it just won't be used yet.
- [ ] In Render, set the SMTP and `ADMIN_EMAIL` env vars. **Leave all `TWILIO_*` and `ADMIN_PHONE` blank.** `/healthz` will show `twilio:false, smtp:true` — that is the correct email-only state.
- [ ] Connect the intake path (webhook / Zapier / email-parse) exactly as the full tier.
- [ ] Go-live test: set `FOLLOW_UP_DELAY_MS=5000`, submit a lead with your email via the real form, confirm the instant rep alert email and the ~5s follow-up email both arrive. Set it back to `180000`.
- [ ] Client is live. Billing can start now.

**Bolting on SMS later (when you upgrade the client to the flagship tier):**

- [ ] Do the SMS infrastructure from Day 1-2 above now: create the subaccount, buy a number, submit A2P Brand + Campaign. (Ideally you started A2P back at onboarding so it's already approved.)
- [ ] Once A2P is approved, add the `TWILIO_*` and `ADMIN_PHONE` values in Render. The service picks them up on restart. **No code change, no redeploy of logic** — SMS just starts flowing alongside the email that was already working.
- [ ] Run the Day 5 SMS checks to confirm.

## Ongoing / troubleshooting

- **SMS not arriving:** check A2P campaign status in Twilio Console first; then Twilio logs (Monitor -> Messaging). Error 30034 = campaign not approved yet.
- **Email in spam:** set up SPF/DKIM for the sending domain (SendGrid/Mailgun dashboards walk through it).
- **Rep changed / hours changed:** edit `client.config.json`, commit, Render auto-deploys.
- **Optional STOP footer:** if the client wants it, append "Reply STOP to opt out" to `messages.leadSms.*`. Twilio handles STOP replies automatically either way.
