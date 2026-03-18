/**
 * Simple in-memory fixed-window rate limiting (per process).
 * For multi-instance production, use Redis-backed limiter.
 */
const buckets = new Map();

function pruneBuckets(now, windowMs) {
  if (buckets.size < 10000) return;
  for (const [k, b] of buckets) {
    if (now >= b.resetAt + windowMs) buckets.delete(k);
  }
}

/**
 * @param {{ windowMs: number; max: number; keyGenerator: (req: import('express').Request) => string | null; message?: string }} opts
 */
export function rateLimit({ windowMs, max, keyGenerator, message = 'Too many requests. Try again later.' }) {
  return (req, res, next) => {
    const key = keyGenerator(req);
    if (key == null || key === '') return next();
    const now = Date.now();
    pruneBuckets(now, windowMs);
    let b = buckets.get(key);
    if (!b || now >= b.resetAt) {
      b = { count: 0, resetAt: now + windowMs };
      buckets.set(key, b);
    }
    b.count += 1;
    if (b.count > max) {
      res.setHeader('Retry-After', String(Math.ceil((b.resetAt - now) / 1000) || 1));
      return res.status(429).json({ error: message });
    }
    next();
  };
}

export default { rateLimit };
