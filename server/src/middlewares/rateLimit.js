// middlewares/rateLimit.js
// Pembatas laju sederhana di memori (fixed window per IP) — dipakai POST /api/custom-cake-designs.
// CATATAN PROTOTYPE: hitungan hanya berlaku per proses Node dan hilang saat server restart; tidak
// dibagi antar-instance. Untuk produksi gunakan store bersama (mis. Redis) atau pembatas di reverse proxy.

/**
 * @param {{windowMs: number, max: number, message: string, now?: () => number}} options
 * @returns {Function & {reset: () => void}} middleware Express
 */
function createRateLimiter({ windowMs, max, message, now = Date.now }) {
  const hits = new Map();

  function sweep(currentTime) {
    for (const [key, entry] of hits) {
      if (entry.resetAt <= currentTime) hits.delete(key);
    }
  }

  function rateLimit(req, res, next) {
    const currentTime = now();
    const key = req.ip || req.socket?.remoteAddress || 'unknown';

    // Bersihkan entri kedaluwarsa agar Map tidak tumbuh tanpa batas
    if (hits.size > 1000) sweep(currentTime);

    let entry = hits.get(key);

    if (!entry || entry.resetAt <= currentTime) {
      entry = { count: 0, resetAt: currentTime + windowMs };
      hits.set(key, entry);
    }

    entry.count += 1;

    if (entry.count > max) {
      res.set('Retry-After', String(Math.ceil((entry.resetAt - currentTime) / 1000)));
      return res.status(429).json({ status: 'error', message });
    }

    return next();
  }

  rateLimit.reset = () => hits.clear();

  return rateLimit;
}

module.exports = createRateLimiter;
