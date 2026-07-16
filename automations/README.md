# Make.com Automation (no-code email-only pilot)

`make-speed-to-lead-email.json` is an importable Make.com blueprint that runs the entire email-only speed-to-lead flow with no server to deploy. Ideal for a fast pilot (see the RUNBOOK "Email-only fast path").

**What it does:** a lead hits the webhook → the rep gets an instant alert email → wait 3 minutes → the lead gets a personal follow-up email. Make's Sleep tool maxes at 300s, so the 180s (3-minute) delay runs inside one scenario, no data store needed.

```
Webhook  →  Instant rep alert email  →  Sleep 180s  →  Lead follow-up email
```

This is an alternative to the Node microservice for pilots. When you upgrade a client to the paid SMS tier, move them onto the full service (or add a Twilio module here, below).

## Import it

1. In Make: **Create a new scenario → ... (three dots) → Import Blueprint** → upload `make-speed-to-lead-email.json` (or paste its contents).
2. **Reconnect the two email modules.** Click each "Send an email" module and select your SMTP/email connection (create one if needed: your Google Workspace, SendGrid, Mailgun, etc.). Connections never travel inside a blueprint, so this step is always required.
3. **Set the rep's address** in the first email module's "To" field (replace `REP_EMAIL@EXAMPLE.COM`).
4. **Edit the copy** in both email modules (rep alert + lead follow-up). Put the real brand/rep name in the follow-up. No em dashes.
5. **Grab the webhook URL** from the first module and use it as the intake endpoint (point the client's form webhook, a Zapier/Make feed, or the email-parse path at it, exactly like `docs/INTAKE-RECIPES.md`).
6. **Turn the scenario ON** (schedule = immediately, since the webhook is instant).

If the import complains about the `zone` line, delete `"zone": "us1.make.com"` from the bottom of the JSON and re-import. If a module fails to import on your plan, build that one step by hand (the flow is only four steps).

## Test it

Send a test payload to the webhook URL (any tool, or curl):

```bash
curl -X POST "<your-webhook-url>" \
  -H "Content-Type: application/json" \
  -d '{"firstName":"Test","lastName":"Lead","company":"Example Co","phone":"5550100001","email":"you@example.com"}'
```

Expect the rep alert immediately and the follow-up to your test email ~3 minutes later. The field names (`firstName`, `lastName`, `company`, `phone`, `email`) must match what your intake sends; adjust the mappings in the email modules if the client's form uses different keys.

## Optional: time-aware copy (in-hours vs after-hours)

To match the full service's behavior, insert a **Router** before the follow-up email with two routes:

- **Business hours route** (filter, ALL of): `{{parseNumber(formatDate(now; "H"; "America/New_York"))}}` greater-or-equal `8` AND less-than `17` AND `{{parseNumber(formatDate(now; "e"; "America/New_York"))}}` less-or-equal `5`. Copy: "I'm on a call right now but I'll call you right after."
- **After-hours route** (set as the fallback route). Copy: "We're wrapped up for today but I'll reach out first thing next business day."

Swap the timezone to the client's.

## Optional: add SMS

Add a **Twilio → Send a Message** module after the sleep (and one after the webhook for the rep alert). It needs a Twilio connection and an A2P-registered number, which is the paid-tier setup, so keep it off during a free email-only pilot.
