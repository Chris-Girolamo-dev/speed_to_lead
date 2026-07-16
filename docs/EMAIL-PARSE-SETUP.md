# Email-Parse Intake Setup

The intake path for a fully locked-down client: no website access, no form-platform login. Every contact form emails a notification *somewhere* when someone submits. We listen to that email and turn it into a lead. The client's site, form, and CRM never change.

**Use this path when:** the client answered Section 2 of the questionnaire with "I get an email when someone submits" but can't give you site or form-platform access. If they *can* give form-platform access, prefer a native webhook or an instant Zapier trigger (see `INTAKE-RECIPES.md`) — it's one hop shorter.

## The flow

```
Lead submits their form (unchanged)
      │
      ▼
Form tool emails a notification to the client's inbox (unchanged)
      │
      ├─ auto-forward rule  ──►  a dedicated address we watch
      ▼
Zapier / Make: new email → parse Name / Email / Phone
      ▼
POST /api/leads  (with intake token)
      ▼
Our service: instant rep alert + queued lead follow-up
```

## Prerequisites

- The service deployed and healthy (`/healthz` green), with `INTAKE_TOKEN` set.
- **One real example** of the notification email the client receives (questionnaire Section 2 asks for this). You need to see the exact layout once to write the parse rule.
- A Zapier or Make account. Either works; Make's free tier is instant for email and cheaper at low volume.
- A dedicated address to receive forwarded leads, e.g. `leads-clientname@yourdomain.com`, or the auto-generated parser address Zapier/Make gives you (below).

---

## Step 1: Get the notification email to the parser

Prefer **forwarding** over connecting the client's inbox. Forwarding is a 2-minute change on their side, needs zero access from you, and never exposes their mailbox.

Zapier and Make both hand you a **dedicated parser inbox address** (e.g. `abc123@robot.zapier.com` or a Make mailhook address). The client forwards their form notifications to that address. Two ways to set the forward:

### Option A: Client adds an auto-forward rule (cleanest)

Send the client these instructions for their email provider.

**Gmail:**
1. Settings (gear) → See all settings → **Forwarding and POP/IMAP** → **Add a forwarding address** → paste the parser address → Next → Proceed.
2. Gmail sends a confirmation code to that address. Because it's a robot inbox, you (the implementer) retrieve the code from the Zapier/Make task history or the parser inbox and give it to the client to confirm — or use Option B, which sidesteps confirmation.
3. Settings → **Filters and Blocked Addresses** → **Create a new filter**. In "From", put the form tool's sender (e.g. `noreply@webflow.com`, `wordpress@theirdomain.com`, `notifications@hubspot.com`). Create filter → check **Forward it to** [parser address] → Create filter.

Result: only form-notification emails forward to the parser. Regular mail is untouched.

**Outlook / Microsoft 365:**
1. Settings → **Mail** → **Rules** → **Add new rule**.
2. Condition: **From** → the form tool's sender address.
3. Action: **Forward to** → the parser address. Save.

### Option B: Zapier/Make watches the client's inbox directly

If auto-forward confirmation is a hassle, connect the inbox instead: Zapier's Gmail/Outlook trigger "New Email Matching Search" with a search like `from:noreply@webflow.com`. This needs the client to OAuth-connect that inbox to your Zapier — more access than forwarding, so only use it if Option A stalls.

---

## Step 2: Parse the email into fields

### Zapier

1. **Trigger:** "Email Parser by Zapier" (parser inbox) or "Gmail → New Email Matching Search".
2. If using Email Parser: open `parser.zapier.com`, forward the sample email to your mailbox there, then **highlight** the name, email, and phone values in the sample and label them `lead_name`, `lead_email`, `lead_phone`. The parser learns the template from that one example.
3. If using the Gmail trigger: add a **Formatter → Text → Extract Pattern** step (or Extract Email Address / Extract Phone Number, which are built-in) to pull each field from the email body.

### Make

1. **Trigger:** "Email → Watch emails" (mailhook) or IMAP.
2. Add a **Text parser → Match pattern** module with a regex per field, or use the built-in email/phone extractors.

Either way you end up with three variables: name, email, phone.

---

## Step 3: POST to the service

Final action in Zapier ("Webhooks by Zapier → POST") or Make ("HTTP → Make a request"):

- **URL:** `https://<service>.onrender.com/api/leads?token=<INTAKE_TOKEN>`
- **Method:** POST
- **Payload type / Body:** JSON
- **Data:**
  ```json
  {
    "fullName": "{{lead_name}}",
    "email": "{{lead_email}}",
    "phone": "{{lead_phone}}"
  }
  ```

Map first/last separately if the email exposes them; otherwise send `fullName` and the service splits it. Field names here just need to match aliases in `intake.fieldMap` in `client.config.json` — `fullName`, `email`, and `phone` are already covered by the defaults.

---

## Step 4: Verify

1. Submit a real test on the client's actual form.
2. Watch the Render logs for the `[LEAD]` block. Confirm name, email, and phone all mapped (nothing you expected landed in "extras").
3. Confirm the rep alert fired and the follow-up queued.
4. Check the Zapier/Make task history shows the run completing in **seconds**, not minutes (see the speed check below).

## The speed check (do not skip)

This path is only as fast as the notification email plus the trigger. Two things to confirm per client:

- **The form tool sends the notification instantly.** Almost all do. If the client's form batches notifications (rare), this path can't hit the 3-minute promise and you need a native webhook instead.
- **The trigger is instant, not polling.** Zapier's Email Parser and "New Email" triggers are near-instant, but some Zapier plans poll on a 1–15 minute cycle for certain triggers. Make's mailhook is instant. Verify the first live test lands in seconds; if it lags minutes, switch to a mailhook/instant trigger or upgrade the plan.

Tick both boxes during setup. The client never sees this; it's your guarantee protection.

## Troubleshooting

- **Lead never arrives:** check the forward actually fired (client's sent/forwarded log), then the Zapier/Make task history. A missing task = the forward or filter isn't matching; recheck the sender address in the rule.
- **Fields land in "extras" instead of name/email/phone:** the parse labels don't match the fieldMap. Either rename the JSON keys in Step 3 or add the incoming key as an alias in `intake.fieldMap`.
- **`[DENIED]` in logs:** token missing or wrong in the webhook URL.
- **`[REJECTED]` in logs:** the parse produced no usable email or phone; re-check the parser highlights against a fresh sample.
- **Duplicate leads:** the client has both an auto-forward rule *and* a direct inbox watch running. Keep one.
