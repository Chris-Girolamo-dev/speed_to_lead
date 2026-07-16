# Integration Kit

Two ways to feed leads from a website into the Speed-to-Lead service. Most clients should use a **webhook or Zapier instead** (no website access needed at all): see `docs/INTAKE-RECIPES.md`. Use this kit only when you can add code to the client's site.

## Option A: Attach snippet (client already has a form)

`attach-snippet.js` mirrors submissions from the client's **existing** form to the Speed-to-Lead API. Their form keeps working exactly as before: same CRM, same thank-you page, same everything. The snippet listens in the capture phase and fires a non-blocking `fetch` with `keepalive`, so it works even when the form navigates away.

1. Open `attach-snippet.js` and fill in `STL_CONFIG`:
   - `apiEndpoint`: your deployed URL. **Never put the `INTAKE_TOKEN` in this file**: anything here ships to every visitor's browser and is readable via view-source. Browser calls are authorized by the origin allowlist (step 3) instead.
   - `formSelector`: CSS selector for their form
   - `fieldSelectors`: map each canonical field to the matching input's selector. Delete entries their form doesn't have. Single "Name" field? Map it to `fullName`; the server splits it.
2. Add it to the page, either:
   - a `<script src=".../attach-snippet.js"></script>` before `</body>`, or
   - **Google Tag Manager**: new Custom HTML tag, paste the whole file inside `<script>...</script>`, trigger on the form's page. This is often the only option when nobody can edit the site code, and marketing teams usually have GTM access.
3. Add the site's origin (e.g. `https://www.client.com`) to `cors.allowedOrigins` in `client.config.json` and redeploy. This both authorizes the browser call and lets the page read the response. Heads up: because the Origin header can be forged by non-browser callers, allowlisting any origin makes the endpoint about as public as any hosted form endpoint (Formspree etc.); the rate limiter and honeypot are the abuse controls on this path. Webhook/Zapier clients that skip this kit entirely keep the endpoint token-only, which is stricter.
4. Submit a test lead on the real page and watch the server logs.

## Option B: Drop-in form (client has no form)

`form.html` is a complete, neutral, self-contained contact form: styles, honeypot spam trap, validation, and submit logic included.

1. Set `apiEndpoint` in `STL_FORM_CONFIG` (bottom of the file).
2. Rebrand by overriding the `--stl-*` CSS custom properties in `:root` (accent color, fonts, radius). That's the whole theming surface.
3. Copy the `<style>` block, the `<form>` markup, and the `<script>` into the client's page, or host the file as-is as a landing page.
4. Add the hosting origin to `cors.allowedOrigins` in `client.config.json`.

The honeypot field (`company_website`) must match `security.honeypotField` in `client.config.json`. Bots that fill it get a fake success response and are silently dropped.

## Local testing

Start the server (`npm start`, simulation mode is fine), set the endpoint to `http://localhost:3000/api/leads`, add `"*"` to `cors.allowedOrigins` temporarily, and open `form.html` directly in a browser. Remove `"*"` before production.
