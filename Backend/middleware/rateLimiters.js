const rateLimit = require('express-rate-limit');

const isTest = process.env.NODE_ENV === 'test';

const friendlyMessage = {
  success: false,
  message: 'Too many requests. Please try again later.',
};

function createLimiter(options) {
  if (isTest) {
    return (req, res, next) => next();
  }

  return rateLimit({
    standardHeaders: true,
    legacyHeaders: false,
    message: friendlyMessage,
    ...options,
  });
}

const authLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 15,
});

const aiChatLimiter = createLimiter({
  windowMs: 60 * 1000,
  max: 30,
  keyGenerator: (req) => String(req.user?.id || req.ip),
});

module.exports = {
  authLimiter,
  aiChatLimiter,
};
