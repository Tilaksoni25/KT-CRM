const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const env = require('../config/env');

/**
 * Generate a JWT access token (15 minute expiry)
 * @param {object} payload - { userId, email, role }
 * @returns {string}
 */
const generateAccessToken = (payload) => {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: '15m'
  });
};

/**
 * Generate a JWT refresh token (30 day expiry)
 * @param {object} payload - { userId }
 * @returns {string}
 */
const generateRefreshToken = (payload) => {
  return jwt.sign(
    { ...payload, jti: crypto.randomUUID() }, // jti ensures uniqueness even within same second
    env.JWT_REFRESH_SECRET,
    { expiresIn: '30d' }
  );
};

/**
 * Verify an access token
 * @param {string} token 
 * @returns {object} - Decoded payload
 */
const verifyAccessToken = (token) => {
  return jwt.verify(token, env.JWT_ACCESS_SECRET);
};

/**
 * Verify a refresh token
 * @param {string} token 
 * @returns {object} - Decoded payload
 */
const verifyRefreshToken = (token) => {
  return jwt.verify(token, env.JWT_REFRESH_SECRET);
};

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken
};
