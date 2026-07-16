// Append-only audit log of every accepted lead (data/leads.jsonl).
// Insurance in case the client's own form -> CRM flow drops a lead.
const fs = require('fs');
const path = require('path');
const { env, ROOT } = require('./config');

const filePath = env.LEADS_FILE
  ? path.resolve(ROOT, env.LEADS_FILE)
  : path.join(ROOT, 'data', 'leads.jsonl');

function append(lead, extras) {
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const line = JSON.stringify({ receivedAt: new Date().toISOString(), lead, extras }) + '\n';
    fs.appendFileSync(filePath, line, 'utf8');
  } catch (err) {
    console.error(`[ERROR] Failed to write lead log: ${err.message}`);
  }
}

module.exports = { append, filePath };
