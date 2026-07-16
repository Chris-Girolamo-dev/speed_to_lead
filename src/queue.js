// Persistent delayed-dispatch queue.
//
// Jobs live in memory with armed setTimeout timers AND in a JSON file
// (atomic tmp-write + rename) so pending follow-ups survive restarts.
// On boot: future jobs get their timers re-armed; overdue jobs within
// maxLateMs dispatch immediately (staggered 2s apart to avoid a Twilio
// burst); anything older is dropped with a logged skip. A failed send
// is re-queued once at +60s, then dropped with an error log.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { config, env, ROOT } = require('./config');

const RETRY_DELAY_MS = 60000;
const MAX_ATTEMPTS = 2; // initial attempt + one retry
const filePath = env.QUEUE_FILE
  ? path.resolve(ROOT, env.QUEUE_FILE)
  : path.resolve(ROOT, config.queue.file);

let jobs = [];
const timers = new Map(); // job.id -> timeout handle
let dispatchFn = null;    // async (job) => resolves on success, rejects on failure

function persist() {
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const tmp = filePath + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(jobs, null, 2), 'utf8');
    fs.renameSync(tmp, filePath);
  } catch (err) {
    console.error(`[ERROR] Failed to persist queue: ${err.message}`);
  }
}

function removeJob(id) {
  jobs = jobs.filter(j => j.id !== id);
  const t = timers.get(id);
  if (t) clearTimeout(t);
  timers.delete(id);
  persist();
}

function arm(job, delayMs) {
  const t = setTimeout(() => dispatch(job), Math.max(delayMs, 0));
  timers.set(job.id, t);
}

function dispatch(job) {
  // Remove before dispatch so a crash mid-send cannot double-send on reboot.
  // Trade-off: a crash exactly during send loses that one follow-up, which
  // is preferable to a lead receiving the same text twice.
  removeJob(job.id);

  Promise.resolve()
    .then(() => dispatchFn(job))
    .catch(err => {
      const attempts = (job.attempts || 0) + 1;
      if (attempts < MAX_ATTEMPTS) {
        console.error(`[RETRY] ${job.channel} follow-up for ${job.lead.email || job.lead.phone} failed (${err.message}). Retrying in ${RETRY_DELAY_MS / 1000}s.`);
        add({ ...job, attempts, sendAt: Date.now() + RETRY_DELAY_MS });
      } else {
        console.error(`[GIVE-UP] ${job.channel} follow-up for ${job.lead.email || job.lead.phone} failed after retry: ${err.message}`);
      }
    });
}

/**
 * @param {object} job { id?, lead, channel: 'sms'|'email', variant, sendAt, attempts? }
 */
function add(job) {
  if (!job.id) job.id = crypto.randomUUID();
  if (!job.attempts) job.attempts = 0;
  jobs.push(job);
  persist();
  arm(job, job.sendAt - Date.now());
  return job.id;
}

function init(onDispatch) {
  dispatchFn = onDispatch;

  let loaded = [];
  try {
    if (fs.existsSync(filePath)) {
      loaded = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (!Array.isArray(loaded)) loaded = [];
    }
  } catch (err) {
    console.error(`[WARN] Queue file unreadable (${err.message}). Starting with an empty queue.`);
    loaded = [];
  }

  const now = Date.now();
  const maxLateMs = config.queue.maxLateMs || 86400000;
  let overdueCount = 0;
  jobs = [];

  for (const job of loaded) {
    if (!job || !job.id || !job.lead || !job.sendAt) continue;
    const late = now - job.sendAt;
    if (late > maxLateMs) {
      console.log(`[SKIP] Dropping stale ${job.channel} follow-up for ${job.lead.email || job.lead.phone} (due ${Math.round(late / 3600000)}h ago, past maxLateMs)`);
      continue;
    }
    jobs.push(job);
    if (late > 0) {
      // Overdue while we were down: send now, staggered
      arm(job, overdueCount * 2000);
      overdueCount++;
    } else {
      arm(job, job.sendAt - now);
    }
  }
  persist();

  if (jobs.length) {
    console.log(`[QUEUE] Recovered ${jobs.length} pending follow-up(s) from disk (${overdueCount} overdue, dispatching now)`);
  }
}

function depth() {
  return jobs.length;
}

function stop() {
  for (const t of timers.values()) clearTimeout(t);
  timers.clear();
}

module.exports = { init, add, depth, stop, filePath };
