/**
 * Environment and feature flags
 */
export default {
  nodeEnv: process.env.NODE_ENV || 'development',
  apiUrl: process.env.API_URL || 'http://localhost:3000',
  jwtSecret: process.env.JWT_SECRET || 'change-me',
  jwtExpiry: process.env.JWT_EXPIRY || '7d',
  jwtRefreshExpiry: process.env.JWT_REFRESH_EXPIRY || '30d',
  // Gmail (SMTP) for email verification and notifications
  gmailUser: (process.env.GMAIL_USER || '').trim().toLowerCase(),
  gmailAppPassword: (process.env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, '').trim(),
  fromEmail: (process.env.FROM_EMAIL || process.env.GMAIL_USER || 'noreply@fxmark.com').trim(),
  fromName: (process.env.FROM_NAME || 'FXMARK').trim(),
};
