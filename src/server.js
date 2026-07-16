const crypto = require('crypto');
const express = require('express');
const { config, env, printSummary } = require('./config');
const fieldMap = require('./fieldMap');
const phone = require('./phone');
const schedule = require('./schedule');
const messaging = require('./messaging');
const queue = require('./queue');
const leadLog = require('./leadLog');
const { createRateLimiter } = require('./rateLimit');

printSummary();

const app = express();
// Assumes exactly ONE proxy hop (Render/Railway). If a CDN like Cloudflare
// is ever added in front, this count must change or req.ip (and the rate
// limiter keyed on it) becomes spoofable via X-Forwarded-For.
app.set('trust proxy', 1);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// Malformed bodies (bad JSON from a misbehaving webhook) get a JSON 400
// instead of Express's default HTML error page
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed' || err.status === 400 || err.status === 413) {
    return res.status(err.status || 400).json({ error: 'Invalid request body' });
  }
  next(err);
});

// CORS: echo the Origin back only when allowlisted ("*" entry allows all, dev only)
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const allowed = config.cors.allowedOrigins || [];
  if (origin && (allowed.includes(origin) || allowed.includes('*'))) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Vary', 'Origin');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, X-STL-Token');
    res.header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function tokenMatches(provided) {
  if (!provided) return false;
  const a = Buffer.from(String(provided));
  const b = Buffer.from(env.INTAKE_TOKEN);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function isAuthorized(req) {
  // Server-to-server callers (Zapier, webhooks) present the shared token.
  //
  // Browser callers (attach snippet / drop-in form) can't hold a secret,
  // so they are admitted by an allowlisted Origin instead. Be clear-eyed
  // about what that means: Origin is a client-supplied header, so once
  // any origin is allowlisted the endpoint is effectively public, exactly
  // like every hosted form endpoint (Formspree etc.). The rate limiter
  // and honeypot are the real abuse controls on that path. Clients using
  // only webhooks/Zapier should leave cors.allowedOrigins empty, which
  // makes the token strictly required.
  if (env.INTAKE_TOKEN) {
    if (tokenMatches(req.query.token || req.headers['x-stl-token'])) return true;
    const origin = req.headers.origin;
    const allowed = config.cors.allowedOrigins || [];
    return Boolean(origin && (allowed.includes(origin) || allowed.includes('*')));
  }
  // No token configured: dev/simulation mode, accept everything.
  return true;
}

const rateLimit = createRateLimiter(config.security.rateLimit);

app.post('/api/leads', rateLimit, (req, res) => {
  if (!isAuthorized(req)) {
    console.log(`[DENIED] Unauthorized intake attempt from ${req.ip}`);
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { lead, extras, isSpam } = fieldMap.normalize(req.body, config.intake, config.security);

  if (isSpam) {
    // Honeypot tripped: pretend success so the bot learns nothing
    console.log(`[SPAM] Honeypot tripped from ${req.ip}. Submission silently dropped.`);
    return res.status(200).json({ status: 'success', message: 'Intake queued' });
  }

  if (lead.phone) {
    lead.phone = phone.normalize(lead.phone);
    if (!phone.looksValid(lead.phone)) {
      console.log(`[WARN] Phone "${lead.phone}" does not look like E.164 after normalization. SMS follow-up skipped.`);
      delete lead.phone;
    }
  }
  if (lead.email && !EMAIL_PATTERN.test(lead.email)) {
    console.log(`[WARN] Email "${lead.email}" failed validation. Email follow-up skipped.`);
    delete lead.email;
  }

  if (!lead.email && !lead.phone) {
    console.log('[REJECTED] Intake had no usable email or phone.');
    return res.status(400).json({ error: 'A valid email or phone number is required' });
  }

  lead.extras = extras;

  console.log('========================================');
  console.log(`[LEAD] ${new Date().toISOString()}`);
  console.log(`  Name:    ${lead.fullName || '(not provided)'}`);
  console.log(`  Company: ${lead.company || '(not provided)'}`);
  console.log(`  Phone:   ${lead.phone || '(not provided)'}`);
  console.log(`  Email:   ${lead.email || '(not provided)'}`);
  console.log('========================================');

  leadLog.append(lead, extras);

  // 1. Instant admin alerts
  messaging.sendAdminAlerts(lead);

  // 2. Queue time-aware follow-ups to the lead
  const clock = env.TEST_FIXED_NOW || Date.now();
  const planned = schedule.plan(clock, config.businessHours, config.client.timezone, env.FOLLOW_UP_DELAY_MS);
  const now = Date.now();

  if (lead.phone) {
    queue.add({ lead, channel: 'sms', variant: planned.variant, sendAt: now + planned.smsDelayMs });
    console.log(`[QUEUE] SMS follow-up (${planned.variant}) in ${Math.round(planned.smsDelayMs / 1000)}s${planned.smsHeld ? ' (held for quiet hours)' : ''}`);
  }
  if (lead.email) {
    queue.add({ lead, channel: 'email', variant: planned.variant, sendAt: now + planned.emailDelayMs });
    console.log(`[QUEUE] Email follow-up (${planned.variant}) in ${Math.round(planned.emailDelayMs / 1000)}s`);
  }

  return res.status(200).json({ status: 'success', message: 'Intake queued' });
});

app.get('/healthz', (req, res) => {
  res.json({
    status: 'ok',
    queueDepth: queue.depth(),
    twilio: messaging.isTwilioConfigured(),
    smtp: messaging.isSmtpConfigured(),
    uptime: Math.round(process.uptime())
  });
});

app.get('/', (req, res) => {
  res.send('Speed-to-Lead microservice is active and waiting for intakes at POST /api/leads');
});

// Recover any follow-ups that were pending when the process last stopped
queue.init(job => messaging.sendLeadFollowUp(job.lead, job.channel, job.variant));

app.listen(env.PORT, () => {
  console.log(`Speed-to-Lead server running on port ${env.PORT}`);
});

// Render sends SIGTERM on redeploy/restart. Pending jobs are already
// persisted; just stop timers and exit cleanly so recovery handles them.
process.on('SIGTERM', () => {
  console.log('[SHUTDOWN] SIGTERM received. Pending follow-ups are persisted and will recover on next boot.');
  queue.stop();
  process.exit(0);
});
