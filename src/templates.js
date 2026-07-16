// Minimal {{placeholder}} interpolation. No template engine.
// Unknown or missing keys render as empty string (boot-time validation
// in config.js warns about typos before go-live).
function render(template, data) {
  data = data || {};
  return String(template).replace(/\{\{\s*(\w+)\s*\}\}/g, function (match, key) {
    const val = data[key];
    return val === undefined || val === null ? '' : String(val);
  });
}

module.exports = { render };
