# Intake Recipes: Getting Leads Into the Service

The service exposes one endpoint and doesn't care who calls it:

```
POST https://<service>.onrender.com/api/leads?token=<INTAKE_TOKEN>
Content-Type: application/json  (form-encoded also accepted)
```

Any payload shape works: `intake.fieldMap` in `client.config.json` normalizes it. Pick the recipe matching the client's stack, **most preferred first** (no website access needed at the top).

> **Locked-down client (no website or form-platform access)?** Use the email-parse path: forward their form's notification email to a parser that POSTs here. Full playbook in `EMAIL-PARSE-SETUP.md`.

## Step 0 for every recipe: capture a sample payload

Before configuring the fieldMap, capture one real submission payload:

1. Deploy the service (simulation mode is fine) or run it locally with a tunnel (`npx localtunnel --port 3000`).
2. Point the client's webhook/zap at it and submit a test on their form.
3. Copy the logged payload from the server output, then write `intake.fieldMap` aliases to match its keys. Nested keys match by leaf name or full dot-path (`payload.data.your-email`).
4. Re-test with `npm run test:lead -- --raw '<sample JSON>'`.

## Recipe A: Zapier (works with practically everything)

Best when the form platform has a Zapier trigger but no native webhook, or when nobody has website access.

1. Zap trigger: the form platform's "New Form Submission" (HubSpot, Typeform, Jotform, Gravity Forms, Unbounce, Facebook Lead Ads, ...).
2. Action: **Webhooks by Zapier -> POST**.
   - URL: `https://<service>.onrender.com/api/leads?token=<INTAKE_TOKEN>`
   - Payload type: JSON
   - Data: map the form fields to simple keys (`firstName`, `lastName`, `company`, `phone`, `email`). Since Zapier lets you rename keys, you can match the default fieldMap exactly and skip custom mapping.
3. Note: Zapier polls on cheaper plans (up to 15 min lag), which erodes the 3-minute promise. Instant triggers (HubSpot, Typeform) are instant on any plan; for polling triggers, prefer a native webhook (below) or upgrade the Zapier plan.

Make.com works identically (HTTP module instead of Webhooks by Zapier) and its free tier is instant for many apps.

## Recipe B: Native form-platform webhooks (fastest, $0)

- **Webflow:** Site settings -> Integrations -> Webhooks -> `form_submission`, or Logic flows. Payload nests under `payload.data` with the form's field labels as keys; the fieldMap matches nested keys automatically.
- **Gravity Forms (WordPress):** Gravity Forms Webhooks add-on -> feed on the form -> POST JSON to the endpoint. Keys are the field labels or `input_N` ids; capture a sample.
- **Typeform:** Connect -> Webhooks. Payload is deeply nested (`form_response.answers[]`), which the flattener only partially handles; prefer Zapier/Make for Typeform, or map what the flattener surfaces after capturing a sample.
- **Jotform:** Settings -> Integrations -> Webhooks. Sends form-encoded; accepted natively.
- **HubSpot forms:** Use a HubSpot workflow with a webhook action (Operations Hub), or Zapier's instant HubSpot trigger on free HubSpot tiers.
- **Contact Form 7 (WordPress):** the "CF7 to Webhook" plugin posts JSON directly.

## Recipe C: JS attach snippet (requires site or GTM access)

When you can add a script to the site (directly or through the client's Google Tag Manager), use `integration-kit/attach-snippet.js`. It mirrors their existing form's submissions without touching their CRM flow. Full instructions in `integration-kit/README.md`.

## Recipe D: Drop-in form (client has no form)

Host `integration-kit/form.html` as a landing page or paste its pieces into their site. Instructions in `integration-kit/README.md`.

## Verifying any recipe

Watch the Render logs (or local console) while submitting a test:

- `[LEAD]` block shows the normalized fields. Anything landing in "extras" that should be canonical means a fieldMap alias is missing.
- `[QUEUE] SMS follow-up (...)` / `[QUEUE] Email follow-up (...)` confirm scheduling.
- `[DENIED]` means the token is missing/wrong. `[REJECTED]` means no usable email or phone after mapping.
