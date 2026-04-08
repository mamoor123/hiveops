/**
 * Simple in-memory rate limiter for auth endpoints.
 */

const attempts = new Map();

function rateLimiter({ windowMs = 15 * 60 * 1000, maxAttempts = 20 } = {}) {
  return (req, res, next) => {
    const key = req.ip;
    const now = Date.now();
    const record = attempts.get(key);

    if (!record || now - record.windowStart > windowMs) {
      attempts.set(key, { windowStart: now, count: 1 });
      return next();
    }

    record.count++;
    if (record.count > maxAttempts) {
      const retryAfter = Math.ceil((windowMs - (now - record.windowStart)) / 1000);
      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({ error: 'Too many attempts. Please try again later.' });
    }

    next();
  };
}

// Clean up old entries periodically
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  for (const [key, record] of attempts) {
    if (now - record.windowStart > windowMs) {
      attempts.delete(key);
    }
  }
}, 5 * 60 * 1000);
if (cleanupTimer.unref) cleanupTimer.unref();

module.exports = { rateLimiter };
