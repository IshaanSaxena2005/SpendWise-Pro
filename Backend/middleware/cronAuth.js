const crypto = require('crypto');

/**
 * Shared-secret gate for scheduler endpoints (cron-job.org → x-cron-secret).
 *
 * Fail-closed: when CRON_SECRET is not configured, EVERY request is refused.
 * The previous inline checks compared `req.headers['x-cron-secret'] !==
 * process.env.CRON_SECRET`, which AUTHENTICATES ANONYMOUS REQUESTS when the
 * env var is unset (undefined === undefined).
 *
 * Timing-safe: both sides are hashed to fixed-length digests before
 * timingSafeEqual, so neither the secret's length nor its content leaks
 * through comparison timing.
 */
function cronSecretIsValid(provided) {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false; // misconfigured deployment must fail closed
  if (typeof provided !== 'string' || provided.length === 0) return false;
  const a = crypto.createHash('sha256').update(provided).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

function requireCronSecret(req, res, next) {
  if (!process.env.CRON_SECRET) {
    return res.status(503).json({
      success: false,
      message: 'Cron endpoint is not configured (CRON_SECRET missing).',
    });
  }

  if (!cronSecretIsValid(req.headers['x-cron-secret'])) {
    return res.status(403).json({
      success: false,
      message: 'Unauthorized: Invalid CRON_SECRET',
    });
  }

  return next();
}

module.exports = { requireCronSecret, cronSecretIsValid };
