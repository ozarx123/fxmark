/**
 * Environment and feature flags
 */
const trimmed = (v) => (v || '').trim().replace(/\/$/, '');

const nodeEnvRaw = process.env.NODE_ENV;
const isLocalDevDefault =
  !nodeEnvRaw || nodeEnvRaw === 'development';

export default {
  nodeEnv: nodeEnvRaw || 'development',
  /** Backend base URL; localhost default only for unset or development NODE_ENV. */
  apiUrl: trimmed(process.env.API_URL) || (isLocalDevDefault ? 'http://localhost:3000' : ''),
  /** Public web app origin (no path). Used for email verification links and API → SPA redirects. */
  frontendBaseUrl:
    trimmed(process.env.FRONTEND_URL || process.env.WEB_APP_URL) ||
    (process.env.NODE_ENV === 'development' ? 'http://localhost:5173' : ''),
  jwtSecret: process.env.JWT_SECRET || 'change-me',
  jwtExpiry: process.env.JWT_EXPIRY || '7d',
  jwtRefreshExpiry: process.env.JWT_REFRESH_EXPIRY || '30d',
  // Gmail (App Password) — verification & notifications (see docs/EMAIL_SETUP.md)
  gmailUser: (process.env.GMAIL_USER || '').trim().toLowerCase(),
  gmailAppPassword: (process.env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, '').trim(),
  fromEmail: (process.env.FROM_EMAIL || process.env.GMAIL_USER || 'noreply@fxmark.com').trim(),
  fromName: (process.env.FROM_NAME || 'FXMARK').trim(),
};
