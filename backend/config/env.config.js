/**
 * Environment and feature flags
 */
export default {
  nodeEnv: process.env.NODE_ENV || 'development',
  apiUrl: process.env.API_URL || 'http://localhost:3000',
  jwtSecret: process.env.JWT_SECRET || 'change-me',
  jwtExpiry: process.env.JWT_EXPIRY || '7d',
  jwtRefreshExpiry: process.env.JWT_REFRESH_EXPIRY || '30d',
};
