/**
 * Speed-to-Lead attach snippet
 * ----------------------------
 * Attaches to the client's EXISTING form and mirrors each submission to
 * the Speed-to-Lead API in parallel. It never blocks, alters, or replaces
 * the form's own submit behavior: the client's CRM flow runs untouched.
 *
 * Install: fill in STL_CONFIG below, then load this file on the page that
 * hosts the form (script tag before </body>, or via Google Tag Manager
 * as a Custom HTML tag).
 *
 * Only edit STL_CONFIG. Everything below it is generic.
 */
var STL_CONFIG = {
  // Your deployed service endpoint. Do NOT put the INTAKE_TOKEN here:
  // anything in this file ships to every visitor's browser. Browser
  // calls are authorized by adding this site's origin to
  // cors.allowedOrigins in the server's client.config.json instead.
  apiEndpoint: 'https://YOUR-SERVICE.onrender.com/api/leads',

  // CSS selector for the client's existing form
  formSelector: '#contactForm',

  // Map canonical lead fields to CSS selectors INSIDE the form.
  // Delete lines for fields the form does not have. If the form has a
  // single combined name field, map it to fullName.
  fieldSelectors: {
    firstName: '#firstName',
    lastName: '#lastName',
    fullName: null,
    company: '#company',
    phone: '#phone',
    email: '#email'
  }
};

(function () {
  function attach() {
    var form = document.querySelector(STL_CONFIG.formSelector);
    if (!form) {
      console.warn('[speed-to-lead] Form not found: ' + STL_CONFIG.formSelector);
      return;
    }

    // Capture phase: runs even if the site's own handler stops propagation
    form.addEventListener('submit', function () {
      try {
        var payload = {};
        var selectors = STL_CONFIG.fieldSelectors;
        for (var field in selectors) {
          if (!selectors[field]) continue;
          var input = form.querySelector(selectors[field]) || document.querySelector(selectors[field]);
          if (input && typeof input.value === 'string' && input.value.trim() !== '') {
            payload[field] = input.value.trim();
          }
        }
        if (!payload.email && !payload.phone) return; // nothing actionable

        // keepalive lets the request survive the page navigating away
        fetch(STL_CONFIG.apiEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          keepalive: true
        }).catch(function (err) {
          console.warn('[speed-to-lead] dispatch failed:', err.message);
        });
      } catch (err) {
        // Never let the mirror break the client's own form
        console.warn('[speed-to-lead] error:', err.message);
      }
    }, true);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attach);
  } else {
    attach();
  }
})();
