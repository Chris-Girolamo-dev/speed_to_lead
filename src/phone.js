// Normalize phone numbers to E.164, defaulting to +1 for US/Canada.
// Ported from the proven reference implementation.
function normalize(phone) {
  if (!phone) return '';
  let normalized = String(phone).trim().replace(/[-(). ]/g, '');
  if (!normalized.startsWith('+')) {
    if (/^\d{10}$/.test(normalized)) {
      normalized = '+1' + normalized;
    } else if (/^1\d{10}$/.test(normalized)) {
      normalized = '+' + normalized;
    }
  }
  return normalized;
}

// Loose sanity check after normalization: E.164 is + followed by 8-15 digits.
function looksValid(phone) {
  return /^\+\d{8,15}$/.test(phone);
}

module.exports = { normalize, looksValid };
