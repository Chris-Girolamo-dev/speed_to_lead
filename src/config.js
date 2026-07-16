const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

const ROOT = path.join(__dirname, '..');

// Load environment variables from various possible .env locations
const envPaths = [
  path.join(process.cwd(), '.env.local'),
  path.join(process.cwd(), '.env'),
  path.join(ROOT, '.env.local'),
  path.join(ROOT, '.env')
];
envPaths.forEach(function (p) {
  if (fs.existsSync(p)) {
    dotenv.config({ path: p, override: true });
  }
});

const DEFAULTS = {
  client: { brandName: '', website: '', repName: '', timezone: 'America/New_York' },
  businessHours: {
    startHour: 8,
    cutoffHour: 17,
    smsQuietEndHour: 21,
    smsQuietResumeHour: 8,
    workDays: [1, 2, 3, 4, 5]
  },
  intake: { fieldMap: {} },
  cors: { allowedOrigins: [] },
  security: {
    honeypotField: 'company_website',
    rateLimit: { windowMs: 600000, max: 10 },
    maxFieldLength: 500,
    maxExtraFields: 20
  },
  queue: { file: 'data/queue.json', maxLateMs: 86400000 },
  messages: {}
};

function deepMerge(base, override) {
  const out = Object.assign({}, base);
  for (const key of Object.keys(override || {})) {
    const b = base ? base[key] : undefined;
    const o = override[key];
    if (b && o && typeof b === 'object' && typeof o === 'object' && !Array.isArray(b) && !Array.isArray(o)) {
      out[key] = deepMerge(b, o);
    } else {
      out[key] = o;
    }
  }
  return out;
}

function loadClientConfig() {
  const configPath = path.join(ROOT, 'client.config.json');
  if (!fs.existsSync(configPath)) {
    console.error(`FATAL: client.config.json not found at ${configPath}`);
    process.exit(1);
  }
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (err) {
    console.error(`FATAL: client.config.json is not valid JSON: ${err.message}`);
    process.exit(1);
  }
  return deepMerge(DEFAULTS, raw);
}

const clientConfig = loadClientConfig();

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

const env = {
  PORT: parseInt(process.env.PORT, 10) || 3000,
  FOLLOW_UP_DELAY_MS: parseInt(process.env.FOLLOW_UP_DELAY_MS, 10) || 180000,
  TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID || '',
  TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN || '',
  TWILIO_FROM_NUMBER: process.env.TWILIO_FROM_NUMBER || '',
  SMTP_HOST: process.env.SMTP_HOST || '',
  SMTP_PORT: parseInt(process.env.SMTP_PORT, 10) || 587,
  SMTP_USER: process.env.SMTP_USER || '',
  SMTP_PASS: process.env.SMTP_PASS || '',
  SMTP_FROM_EMAIL: process.env.SMTP_FROM_EMAIL || '',
  ADMIN_EMAIL: (process.env.ADMIN_EMAIL || '').split(',').map(s => s.trim()).filter(Boolean),
  ADMIN_PHONE: (process.env.ADMIN_PHONE || '').split(',').map(s => s.trim()).filter(Boolean),
  INTAKE_TOKEN: process.env.INTAKE_TOKEN || '',
  QUEUE_FILE: process.env.QUEUE_FILE || '',
  LEADS_FILE: process.env.LEADS_FILE || '',
  // Test hook: fixes the clock used for business-hours logic. Ignored in production.
  TEST_FIXED_NOW: !IS_PRODUCTION && process.env.TEST_FIXED_NOW
    ? parseInt(process.env.TEST_FIXED_NOW, 10)
    : null
};

// Known template placeholders: lead fields + client identity + computed extras
const KNOWN_PLACEHOLDERS = [
  'firstName', 'lastName', 'fullName', 'company', 'phone', 'email',
  'extras', 'brandName', 'website', 'repName'
];

function collectTemplateStrings(node, prefix, out) {
  for (const key of Object.keys(node || {})) {
    const val = node[key];
    const label = prefix ? `${prefix}.${key}` : key;
    if (typeof val === 'string') out.push({ label, value: val });
    else if (val && typeof val === 'object') collectTemplateStrings(val, label, out);
  }
  return out;
}

// Every message key the runtime renders. A missing one would otherwise
// send the literal string "undefined" to a real lead or silently kill
// every follow-up, so absence is a config error caught at boot.
const REQUIRED_MESSAGE_KEYS = [
  'adminSms', 'adminEmailSubject', 'adminEmailBody',
  'leadSms.inHours', 'leadSms.afterHours',
  'leadEmailSubject',
  'leadEmailBody.inHours', 'leadEmailBody.afterHours'
];

function getPath(obj, dottedPath) {
  return dottedPath.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

function validate() {
  const problems = [];
  const warnings = [];
  // In production a bad config refuses to boot; in dev it warns so
  // simulation-mode experiments stay easy.
  const report = msg => (IS_PRODUCTION ? problems : warnings).push(msg);

  const serialized = JSON.stringify(clientConfig);
  if (serialized.includes('SET_ME')) {
    report('client.config.json still contains SET_ME placeholder values');
  }

  for (const key of REQUIRED_MESSAGE_KEYS) {
    if (typeof getPath(clientConfig.messages, key) !== 'string') {
      report(`Missing required message template: messages.${key}`);
    }
  }

  const bh = clientConfig.businessHours;
  const hourFields = ['startHour', 'cutoffHour', 'smsQuietEndHour', 'smsQuietResumeHour'];
  for (const f of hourFields) {
    if (!Number.isInteger(bh[f]) || bh[f] < 0 || bh[f] > 23) {
      report(`businessHours.${f} must be an integer 0-23 (got ${JSON.stringify(bh[f])})`);
    }
  }
  if (Number.isInteger(bh.startHour) && Number.isInteger(bh.cutoffHour) && bh.startHour >= bh.cutoffHour) {
    report(`businessHours.startHour (${bh.startHour}) must be before cutoffHour (${bh.cutoffHour})`);
  }
  if (Number.isInteger(bh.smsQuietResumeHour) && Number.isInteger(bh.smsQuietEndHour) && bh.smsQuietResumeHour >= bh.smsQuietEndHour) {
    report(`businessHours.smsQuietResumeHour (${bh.smsQuietResumeHour}) must be a morning hour before smsQuietEndHour (${bh.smsQuietEndHour}); otherwise every SMS would be held`);
  }

  const rl = clientConfig.security.rateLimit || {};
  if (!(rl.windowMs > 0) || !(rl.max > 0)) {
    report(`security.rateLimit.windowMs and .max must be positive numbers (got ${JSON.stringify(rl)})`);
  }

  if (IS_PRODUCTION && !env.INTAKE_TOKEN) {
    problems.push('INTAKE_TOKEN is required in production (server-to-server intake auth)');
  }

  // Warn on placeholder typos in message templates
  const templates = collectTemplateStrings(clientConfig.messages, 'messages', []);
  for (const t of templates) {
    const found = t.value.match(/\{\{\s*(\w+)\s*\}\}/g) || [];
    for (const raw of found) {
      const name = raw.replace(/[{}\s]/g, '');
      if (!KNOWN_PLACEHOLDERS.includes(name)) {
        warnings.push(`Unknown placeholder {{${name}}} in ${t.label} (known: ${KNOWN_PLACEHOLDERS.join(', ')})`);
      }
    }
  }

  try {
    new Intl.DateTimeFormat('en-US', { timeZone: clientConfig.client.timezone });
  } catch (err) {
    problems.push(`Invalid timezone "${clientConfig.client.timezone}" in client.config.json`);
  }

  return { problems, warnings };
}

function printSummary() {
  const { problems, warnings } = validate();

  console.log('============================================');
  console.log(` Speed-to-Lead: ${clientConfig.client.brandName || '(unnamed client)'}`);
  console.log('============================================');

  const twilioOk = env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_FROM_NUMBER;
  const smtpOk = env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS;
  console.log(twilioOk ? '[ok] Twilio SMS configured' : '[!!] Twilio not configured. SMS will be SIMULATED in console logs.');
  console.log(smtpOk ? '[ok] SMTP email configured' : '[!!] SMTP not configured. Email will be SIMULATED in console logs.');
  console.log(env.ADMIN_PHONE.length ? `[ok] Admin SMS targets: ${env.ADMIN_PHONE.join(', ')}` : '[!!] No ADMIN_PHONE set');
  console.log(env.ADMIN_EMAIL.length ? `[ok] Admin email targets: ${env.ADMIN_EMAIL.join(', ')}` : '[!!] No ADMIN_EMAIL set');
  console.log(env.INTAKE_TOKEN ? '[ok] Intake token set' : '[!!] No INTAKE_TOKEN. All intake requests will be accepted (dev mode only).');
  const origins = clientConfig.cors.allowedOrigins;
  console.log(origins.length ? `[ok] CORS origins: ${origins.join(', ')}` : '[--] No CORS origins configured (browser-based intake disabled)');
  console.log(`[--] Follow-up delay: ${env.FOLLOW_UP_DELAY_MS / 1000}s`);
  console.log(`[--] Timezone: ${clientConfig.client.timezone}, business hours ${clientConfig.businessHours.startHour}:00-${clientConfig.businessHours.cutoffHour}:00`);
  if (env.TEST_FIXED_NOW) {
    console.log(`[!!] TEST_FIXED_NOW active: business-hours clock fixed to ${new Date(env.TEST_FIXED_NOW).toISOString()}`);
  }

  for (const w of warnings) console.log(`[warn] ${w}`);

  if (problems.length) {
    for (const p of problems) console.error(`[FATAL] ${p}`);
    console.error('Refusing to start. Fix the above and restart.');
    process.exit(1);
  }
  console.log('============================================');
}

module.exports = { config: clientConfig, env, ROOT, IS_PRODUCTION, validate, printSummary, KNOWN_PLACEHOLDERS };
