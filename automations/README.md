# Make.com Automation (no-code email-only pilot)

`make-speed-to-lead-email.json` is an importable Make.com blueprint that runs the entire email-only speed-to-lead flow with no server to deploy. Ideal for a fast pilot (see the RUNBOOK "Email-only fast path").

**What it does:** a lead hits the webhook → the rep gets an instant alert email → wait 3 minutes → the lead gets a personal follow-up email. Make's Sleep tool maxes at 300s, so the 180s (3-minute) delay runs inside one scenario, no data store needed.

```
Webhook  →  Instant rep alert email  →  Sleep 180s  →  Lead follow-up email
```

This is an alternative to the Node microservice for pilots. When you upgrade a client to the paid SMS tier, move them onto the full service (or add a Twilio module here, below).

## Import it

1. In Make: **Create a new scenario → ... (three dots) → Import Blueprint** → upload `make-speed-to-lead-email.json` (or paste its contents).
2. **Create the webhook.** Click the first module → **Create a webhook** → name it → Save. Make generates a new URL (the blueprint's placeholder hook is intentionally not yours).
3. **Connect the two email modules.** Click each "Send an email" module and pick your email connection under **Connection** (or **Add** one: Google Restricted for Google Workspace, Microsoft SMTP/IMAP OAuth for 365, or Others (SMTP) for anything else). Connections never travel inside a blueprint, so this is always required. Use the **same** connection on both modules.
4. **Set the rep's address.** In module 2 ("Instant rep alert") the "To" field ships as the placeholder `REP_EMAIL@EXAMPLE.COM` — replace it with the real alert inbox. **This is the #1 thing people forget**, and a leftover placeholder means the alert silently goes nowhere. (Module 4's "To" is already mapped to `{{1.email}}`, the lead's own address — leave it.)
5. **Teach the webhook its fields.** Click the webhook → **Redetermine data structure**, then send one sample POST (see Test below) so `firstName / email / etc.` become clickable in the email modules.
6. **Edit the copy** in both email modules. Put the real brand/rep name in the follow-up. No em dashes.
7. **Turn the scenario ON** (bottom toggle → "Immediately as data arrives"), and point your intake at the webhook URL (see `docs/INTAKE-RECIPES.md`).

**Module facts** (from a real working export, in case you rebuild by hand): webhook `gateway:CustomWebHook` v1; email `email:ActionSendEmail` v7 (connection param `account`, type SMTP / Google Restricted / Microsoft SMTP-IMAP OAuth); delay `util:FunctionSleep` v1 with mapper key **`duration`** (seconds as a string, **max 300**, so the 180s / 3-min production delay fits). Zoned to `us2.make.com` — if your org is on another region and import complains, change the `zone` value at the bottom (e.g. `us1.make.com`, `eu1.make.com`).

### Feeding it from Formspree

Formspree wraps the form fields inside a **`submission`** object (with `form` and `keys` as siblings), so the webhook's data structure shows only 3 top-level values (`form`, `submission`, `keys`) and won't let you expand `submission` in the mapping panel. **Type the nested references directly** — Make resolves the dot-path at runtime:

- Module 4 To: `{{1.submission.email}}`
- Module 2 subject/body: `{{1.submission.firstName}}`, `{{1.submission.company}}`, etc.
- Greeting with fallback: `Hi {{ifempty(1.submission.firstName; "there")}},`

If dot-notation ever fails to resolve, use `{{get(1.submission; "email")}}` instead. A direct webhook/curl that posts flat fields uses `{{1.email}}` (no `submission.`); to support both shapes, wrap them: `{{ifempty(1.submission.email; 1.email)}}`.

### Gotchas we hit setting this up live

- **Microsoft 365 "Authenticated SMTP" is often disabled**, which makes the send fail. If a Send Email module errors on auth/SMTP/535: Microsoft 365 Admin Center → Users → the mailbox → Mail → Manage email apps → tick **Authenticated SMTP** → Save (takes a few minutes).
- **Make queues webhook data and processes it oldest-first.** During testing, an old queued sample can run instead of your newest one (so the follow-up goes to a stale address). Flush the queue by clicking **Run once** until it finds nothing, or just turn the scenario ON so it runs live in order.
- **Don't add a "Skip" error handler while testing.** It silently swallows failures and makes a broken send look successful. Delete it so errors surface red; add proper (notifying) error handling only once the happy path works.
- **Deliverability:** the follow-up can land in Gmail's Promotions/Spam. Sending from a domain with SPF/DKIM configured keeps it in the inbox — set those DNS records before a real client relies on it.

## Test it

Send a test payload to the webhook URL (any tool, or curl):

```bash
curl -X POST "<your-webhook-url>" \
  -H "Content-Type: application/json" \
  -d '{"firstName":"Test","lastName":"Lead","company":"Example Co","phone":"5550100001","email":"you@example.com"}'
```

Expect the rep alert immediately and the follow-up to the address in the `email` field ~3 minutes later (drop the Sleep `duration` to `10` while testing so you're not waiting). The field names (`firstName`, `lastName`, `company`, `phone`, `email`) must match what your intake sends; adjust the mappings in the email modules if the client's form uses different keys.

## Optional: time-aware copy (in-hours vs after-hours)

To match the full service's behavior, insert a **Router** before the follow-up email with two routes:

- **Business hours route** (filter, ALL of): `{{parseNumber(formatDate(now; "H"; "America/New_York"))}}` greater-or-equal `8` AND less-than `17` AND `{{parseNumber(formatDate(now; "e"; "America/New_York"))}}` less-or-equal `5`. Copy: "I'm on a call right now but I'll call you right after."
- **After-hours route** (set as the fallback route). Copy: "We're wrapped up for today but I'll reach out first thing next business day."

Swap the timezone to the client's.

## Optional: add SMS

Add a **Twilio → Send a Message** module after the sleep (and one after the webhook for the rep alert). It needs a Twilio connection and an A2P-registered number, which is the paid-tier setup, so keep it off during a free email-only pilot.
