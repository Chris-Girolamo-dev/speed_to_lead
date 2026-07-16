// End-to-end smoke test. No test framework, no network beyond localhost.
//
//   npm run smoke
//
// Part 1 unit-checks the pure modules in-process.
// Part 2 spawns the real server in simulation mode with a 5s follow-up
// delay and drives the full intake flow against it.

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const PORT = 3999;
const BASE = `http://localhost:${PORT}`;
const TOKEN = 'smoketest-secret';
const QUEUE_FILE = 'data/smoke-queue.json';
const LEADS_FILE = 'data/smoke-leads.jsonl';

let passed = 0;
let failed = 0;
function check(name, ok, detail) {
  if (ok) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.log(`  FAIL  ${name}${detail ? ' :: ' + detail : ''}`);
  }
}

// ---------- Part 1: pure module checks ----------
console.log('\n--- Unit checks ---');

const templates = require('../src/templates');
check(
  'templates.render interpolates and blanks unknowns',
  templates.render('Hi {{firstName}} {{nope}}!', { firstName: 'Jo' }) === 'Hi Jo !'
);

const phone = require('../src/phone');
check('phone normalize 10-digit', phone.normalize('(555) 010-0001') === '+15550100001');
check('phone normalize 11-digit', phone.normalize('1 555 010 0001') === '+15550100001');
check('phone normalize keeps E.164', phone.normalize('+447911123456') === '+447911123456');
check('phone looksValid rejects junk', !phone.looksValid('+1abc'));

const fieldMap = require('../src/fieldMap');
const clientConfig = JSON.parse(fs.readFileSync(path.join(ROOT, 'client.config.json'), 'utf8'));

// Webflow-style nested payload with a single full-name field
const webflowish = {
  name: 'Form Submission',
  payload: {
    data: {
      'your-name': 'Jane Van Der Berg',
      'your-email': 'jane@biotech.example',
      Budget: '$50k+'
    }
  }
};
const norm = fieldMap.normalize(webflowish, clientConfig.intake, clientConfig.security);
check('fieldMap maps nested your-email', norm.lead.email === 'jane@biotech.example');
check('fieldMap splits fullName', norm.lead.firstName === 'Jane' && norm.lead.lastName === 'Van Der Berg');
check('fieldMap collects extras', norm.extras['payload.data.Budget'] === '$50k+');

const spamNorm = fieldMap.normalize(
  { email: 'bot@spam.example', company_website: 'http://spam.example' },
  clientConfig.intake,
  clientConfig.security
);
check('fieldMap flags honeypot as spam', spamNorm.isSpam === true);

const schedule = require('../src/schedule');
const bh = clientConfig.businessHours;
const TZ = 'America/New_York';
const DELAY = 5000;
// 2026-07-15 is a Wednesday. EDT = UTC-4.
const at10am = Date.UTC(2026, 6, 15, 14, 0); // 10:00 EDT
const at6pm = Date.UTC(2026, 6, 15, 22, 0);  // 18:00 EDT
const at11pm = Date.UTC(2026, 6, 16, 3, 0);  // 23:00 EDT
const atSunday = Date.UTC(2026, 6, 12, 14, 0); // Sunday 10:00 EDT

const p10 = schedule.plan(at10am, bh, TZ, DELAY);
check('10am weekday -> inHours, normal delay', p10.variant === 'inHours' && p10.smsDelayMs === DELAY && !p10.smsHeld);
const p18 = schedule.plan(at6pm, bh, TZ, DELAY);
check('6pm weekday -> afterHours, normal delay', p18.variant === 'afterHours' && p18.smsDelayMs === DELAY && !p18.smsHeld);
const p23 = schedule.plan(at11pm, bh, TZ, DELAY);
check(
  '11pm -> afterHours, SMS held ~9h to 8am',
  p23.variant === 'afterHours' && p23.smsHeld && Math.abs(p23.smsDelayMs - 9 * 3600000) < 60000,
  `smsDelayMs=${p23.smsDelayMs}`
);
check('Sunday -> afterHours variant', schedule.plan(atSunday, bh, TZ, DELAY).variant === 'afterHours');

// ---------- Part 2: live server flow ----------
console.log('\n--- Live server flow (simulation mode) ---');

for (const f of [QUEUE_FILE, LEADS_FILE]) {
  const p = path.join(ROOT, f);
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

const childEnv = { ...process.env };
// Force simulation mode even if a real .env exists
for (const key of Object.keys(childEnv)) {
  if (key.startsWith('TWILIO_') || key.startsWith('SMTP_') || key.startsWith('ADMIN_')) delete childEnv[key];
}
Object.assign(childEnv, {
  PORT: String(PORT),
  FOLLOW_UP_DELAY_MS: '5000',
  INTAKE_TOKEN: TOKEN,
  ADMIN_PHONE: '+15550109999',
  ADMIN_EMAIL: 'admin@test.example',
  QUEUE_FILE,
  LEADS_FILE,
  TEST_FIXED_NOW: String(Date.UTC(2026, 6, 15, 14, 0)), // Wednesday 10am ET -> inHours
  NODE_ENV: 'development'
});

const child = spawn(process.execPath, [path.join(ROOT, 'src', 'server.js')], { env: childEnv });
let logBuffer = '';
child.stdout.on('data', d => { logBuffer += d.toString(); });
child.stderr.on('data', d => { logBuffer += d.toString(); });

function waitForLog(pattern, timeoutMs) {
  const started = Date.now();
  return new Promise(resolve => {
    (function poll() {
      if (pattern.test(logBuffer)) return resolve(true);
      if (Date.now() - started > timeoutMs) return resolve(false);
      setTimeout(poll, 150);
    })();
  });
}

function post(payload, opts = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (!opts.noToken) headers['X-STL-Token'] = TOKEN;
  return fetch(`${BASE}/api/leads`, { method: 'POST', headers, body: JSON.stringify(payload) })
    .then(res => res.status);
}

async function main() {
  const booted = await waitForLog(/running on port/, 10000);
  check('server boots in simulation mode', booted);
  if (!booted) throw new Error('Server did not boot');

  const health = await fetch(`${BASE}/healthz`).then(r => r.json());
  check('/healthz responds ok', health.status === 'ok' && health.twilio === false && health.smtp === false);

  // Valid lead: instant admin alert + 5s follow-ups (inHours via TEST_FIXED_NOW)
  const status = await post({
    firstName: 'Smoke', lastName: 'Test', company: 'Testco',
    phone: '5550100001', email: 'smoke@test.example'
  });
  check('valid lead accepted (200)', status === 200);
  check('admin SMS alert fired instantly', await waitForLog(/SMS admin alert/, 3000));
  check('admin email alert fired instantly', await waitForLog(/Email admin alert/, 3000));
  check('SMS follow-up (inHours) arrived ~5s', await waitForLog(/SMS lead follow-up \(inHours\)/, 9000));
  check('email follow-up (inHours) arrived ~5s', await waitForLog(/Email lead follow-up \(inHours\)/, 9000));
  check('lead logged to JSONL', fs.existsSync(path.join(ROOT, LEADS_FILE)));

  // Honeypot
  const spamStatus = await post({ email: 'bot@spam.example', company_website: 'http://spam.example' });
  check('honeypot returns fake 200', spamStatus === 200);
  check('honeypot logged as spam', await waitForLog(/\[SPAM\]/, 3000));

  // No contact channel
  check('no email/phone rejected (400)', (await post({ firstName: 'Nobody' })) === 400);

  // Auth
  check('missing token rejected (401)', (await post({ email: 'x@y.example' }, { noToken: true })) === 401);

  // Raw webhook-style payload through the live server
  const rawStatus = await post({ payload: { data: { 'your-name': 'Raw Hook', 'your-email': 'raw@hook.example' } } });
  check('nested webhook payload accepted (200)', rawStatus === 200);

  // Rate limit: hammer until 429 (limit is 10 per window; several used above)
  let got429 = false;
  for (let i = 0; i < 12; i++) {
    if ((await post({ email: `burst${i}@x.example` })) === 429) { got429 = true; break; }
  }
  check('rate limiter returns 429 under burst', got429);

  child.kill();
  console.log(`\n--- Result: ${passed} passed, ${failed} failed ---`);
  process.exit(failed ? 1 : 0);
}

main().catch(err => {
  console.error(`\nSmoke test crashed: ${err.message}`);
  console.error(logBuffer.slice(-2000));
  child.kill();
  process.exit(1);
});
