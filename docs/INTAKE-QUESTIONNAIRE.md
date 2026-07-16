# Client Intake Questionnaire (Day 0)

Everything needed to deploy your speed-to-lead system. Most clients can complete this in 15 minutes. Items marked **(A2P)** are required by US carriers to register your business for text messaging; registration can take from a day to a few weeks, so returning this quickly directly speeds up your launch.

## 1. Business identity (A2P)

- Legal business name:
- Doing-business-as / brand name (as it should appear in messages):
- Business type: [ ] Corporation / LLC (provide EIN below) [ ] Sole proprietor
- EIN (tax ID) **(A2P, corporations)**:
- Business address:
- Website URL:

## 2. Your website form

- URL of the page with your contact/inquiry form:
- What fields does the form ask for? (or attach a screenshot)
- What happens today when someone submits it? (email notification, CRM entry, etc. This keeps working unchanged; we run alongside it.)
- What platform is the site/form built on, if known? (WordPress, Webflow, HubSpot, Squarespace, custom, ...)
- Do you have Google Tag Manager on the site? [ ] Yes [ ] No [ ] Not sure
- Who (if anyone) can make changes to the website?

## 3. Who gets alerted

For each business-development rep who should be notified the moment a lead comes in:

| Name | Mobile number | Email |
|---|---|---|
|  |  |  |
|  |  |  |

- Which rep's name should sign the follow-up messages to the lead?
- Reply-to email for lead follow-ups (usually that rep's real inbox):

## 4. Hours and timing

- Your timezone:
- Business hours (e.g. 8am to 5pm):
- Days of operation (e.g. Mon-Fri):
- Follow-up delay after submission (default: 3 minutes):

## 5. Message copy approval

Defaults below; edit freely or approve as-is. `{{firstName}}` etc. are filled automatically per lead.

**Text during business hours:**
> Hey {{firstName}}, just got your submission on the {{brandName}} site. I'm on a call with another client right now but I'll call you right after. {{repName}}

**Text after hours / weekends:**
> Hey {{firstName}}, got your submission on the {{brandName}} site. We're wrapped up for today but I'll reach out first thing next business day. {{repName}}

**Email subject:** `Re: Your {{brandName}} inquiry`

**Email (business hours):**
> Hi {{firstName}}, Just got your submission on the {{brandName}} site. I'm on a call with another client right now but I'll call you as soon as I wrap up. Best, {{repName}}

**Email (after hours):**
> Hi {{firstName}}, Got your submission on the {{brandName}} site. We're wrapped up for today, but you're first on my list and I'll reach out first thing next business day. Best, {{repName}}

- Approved as-is? [ ] Yes [ ] With my edits (attached)

## 6. Legal pages (A2P)

- Does your website have a Privacy Policy page? [ ] Yes (URL: ______) [ ] No
- Does it have a Terms of Service page? [ ] Yes (URL: ______) [ ] No
- If no (or if your privacy policy doesn't cover SMS), we supply ready-to-publish pages. Who can publish a page on your domain?
- Contact email to list on those pages:

## 7. Accounts and access

- Do you already have a Twilio account? [ ] Yes [ ] No (we'll create one)
- Email sending: do you use Google Workspace, Microsoft 365, or something else?
- Preferred area code for your dedicated SMS number:
- Roughly how many form submissions do you get per month?
