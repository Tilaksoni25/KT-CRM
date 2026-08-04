const rateLimit = require('express-rate-limit');
const env = require('../config/env');

// Rate limiter for authentication endpoints: 10 requests per 15 minutes per IP
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: env.NODE_ENV === 'test' ? 1000 : 10, // increase limits during tests to avoid false positives
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again after 15 minutes.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false
});

module.exports = {
  authLimiter
};
