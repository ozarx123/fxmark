/**
 * Environment and feature flags
 * NODE_ENV, API URLs, feature toggles
 */
module.exports = {
  nodeEnv: process.env.NODE_ENV || 'development',
  apiUrl: process.env.API_URL || 'http://localhost:3000',
  jwtSecret: process.env.JWT_SECRET || 'change-me',
  jwtExpiry: process.env.JWT_EXPIRY || '7d',
};
