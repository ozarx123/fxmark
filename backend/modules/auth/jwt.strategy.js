/**
 * JWT verification strategy
 * Used by middleware to attach req.user from Authorization header
 */
const jwt = require('jsonwebtoken');
const config = require('../../config/env.config');

function verify(token) {
  return jwt.verify(token, config.jwtSecret);
}

function decode(token) {
  try {
    return jwt.verify(token, config.jwtSecret);
  } catch {
    return null;
  }
}

module.exports = { verify, decode };
