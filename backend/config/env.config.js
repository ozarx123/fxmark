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
  // Zoho Mail SMTP — verification, notifications, password emails (see docs/EMAIL_SETUP.md)
  zohoMailUser: (process.env.ZOHO_MAIL_USER || '').trim().toLowerCase(),
  zohoMailPassword: (process.env.ZOHO_MAIL_PASSWORD || '').replace(/\s+/g, '').trim(),
  zohoSmtpHost: (process.env.ZOHO_SMTP_HOST || 'smtp.zoho.com').trim(),
  zohoSmtpPort: (() => {
    const n = parseInt(process.env.ZOHO_SMTP_PORT || '465', 10);
    return Number.isFinite(n) && n > 0 ? n : 465;
  })(),
  fromEmail: (process.env.FROM_EMAIL || process.env.ZOHO_MAIL_USER || 'noreply@fxmark.com').trim(),
  fromName: (process.env.FROM_NAME || 'FXMARK').trim(),
};
