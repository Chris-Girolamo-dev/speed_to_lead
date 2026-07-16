// Tiny in-memory sliding-window rate limiter. Per-IP, applied only to
// the intake endpoint. No external dependencies.
function createRateLimiter({ windowMs, max }) {
  const hits = new Map(); // ip -> array of timestamps

  const sweep = setInterval(() => {
    const cutoff = Date.now() - windowMs;
    for (const [ip, times] of hits) {
      const fresh = times.filter(t => t > cutoff);
      if (fresh.length) hits.set(ip, fresh);
      else hits.delete(ip);
    }
  }, windowMs);
  sweep.unref(); // never keeps the process alive

  return function rateLimit(req, res, next) {
    const ip = req.ip || 'unknown';
    const now = Date.now();
    const cutoff = now - windowMs;
    const times = (hits.get(ip) || []).filter(t => t > cutoff);
    if (times.length >= max) {
      return res.status(429).json({ error: 'Too many requests' });
    }
    times.push(now);
    hits.set(ip, times);
    next();
  };
}

module.exports = { createRateLimiter };
