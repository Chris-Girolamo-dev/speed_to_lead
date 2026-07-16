// Normalizes arbitrary inbound payloads (Zapier, form-platform webhooks,
// the attach snippet, or the drop-in form) into a canonical lead object
// using the per-client fieldMap in client.config.json.

const CANONICAL_FIELDS = ['firstName', 'lastName', 'fullName', 'company', 'phone', 'email'];

// Keys that are transport plumbing, never lead data
const INTERNAL_KEYS = ['token', '_token', 'g-recaptcha-response'];

// Flatten a nested payload into leaf entries: { path, key, value }.
// Webhook providers nest data (e.g. Webflow: { payload: { data: {...} } }),
// so aliases can match either the full dot-path or the leaf key name.
function flatten(obj, prefix, depth, out) {
  if (depth > 4) return out;
  for (const key of Object.keys(obj || {})) {
    const val = obj[key];
    const path = prefix ? `${prefix}.${key}` : key;
    if (val === null || val === undefined) continue;
    if (typeof val === 'object' && !Array.isArray(val)) {
      flatten(val, path, depth + 1, out);
    } else if (Array.isArray(val)) {
      // Arrays of primitives are joined; arrays of objects are skipped
      if (val.every(v => typeof v !== 'object')) {
        out.push({ path, key, value: val.join(', ') });
      }
    } else {
      out.push({ path, key, value: val });
    }
  }
  return out;
}

function clean(value, maxLen) {
  let str = String(value).trim();
  if (str.length > maxLen) str = str.slice(0, maxLen);
  return str;
}

/**
 * @param {object} body        raw request body
 * @param {object} intake      config.intake ({ fieldMap })
 * @param {object} security    config.security ({ honeypotField, maxFieldLength, maxExtraFields })
 * @returns {{ lead: object, extras: object, isSpam: boolean }}
 */
function normalize(body, intake, security) {
  const maxLen = security.maxFieldLength || 500;
  const entries = flatten(body, '', 0, []);
  // Lowercased key/path -> entry. On leaf-key collisions the DEEPER entry
  // wins: webhook wrappers put metadata at the top level (e.g. Webflow's
  // "name" = the form's name) and the actual lead fields nested inside.
  const lower = new Map();
  const depthOf = e => e.path.split('.').length;
  for (const e of entries) {
    const k = e.key.toLowerCase();
    const p = e.path.toLowerCase();
    if (!lower.has(k) || depthOf(e) > depthOf(lower.get(k))) lower.set(k, e);
    if (!lower.has(p)) lower.set(p, e);
  }

  // Honeypot: real humans never fill the hidden field
  const honeypot = (security.honeypotField || '').toLowerCase();
  if (honeypot && lower.has(honeypot) && String(lower.get(honeypot).value).trim() !== '') {
    return { lead: null, extras: {}, isSpam: true };
  }

  const fieldMap = intake.fieldMap || {};
  const lead = {};
  const consumedPaths = new Set();

  for (const canonical of CANONICAL_FIELDS) {
    const aliases = fieldMap[canonical] || [canonical];
    for (const alias of aliases) {
      const entry = lower.get(String(alias).toLowerCase());
      if (entry && String(entry.value).trim() !== '') {
        lead[canonical] = clean(entry.value, maxLen);
        consumedPaths.add(entry.path);
        break;
      }
    }
  }

  // Derive first/last from a single full-name field when needed
  if (!lead.firstName && lead.fullName) {
    const parts = lead.fullName.split(/\s+/);
    lead.firstName = parts[0];
    if (!lead.lastName && parts.length > 1) lead.lastName = parts.slice(1).join(' ');
  }
  if (!lead.fullName && (lead.firstName || lead.lastName)) {
    lead.fullName = [lead.firstName, lead.lastName].filter(Boolean).join(' ');
  }

  // Everything unmapped becomes an "extra" shown in the admin alert
  const extras = {};
  const maxExtras = security.maxExtraFields || 20;
  let count = 0;
  for (const e of entries) {
    if (consumedPaths.has(e.path)) continue;
    if (INTERNAL_KEYS.includes(e.key.toLowerCase())) continue;
    if (honeypot && e.key.toLowerCase() === honeypot) continue;
    if (count >= maxExtras) break;
    extras[e.path] = clean(e.value, maxLen);
    count++;
  }

  return { lead, extras, isSpam: false };
}

function extrasToText(extras) {
  const keys = Object.keys(extras);
  if (!keys.length) return '(none)';
  return keys.map(k => `${k}: ${extras[k]}`).join('\n');
}

module.exports = { normalize, extrasToText, CANONICAL_FIELDS };
