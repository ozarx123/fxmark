/**
 * Environment and feature flags
 */
import './load-env.js';

const trimmed = (v) => (v || '').trim().replace(/\/$/, '');

const nodeEnvRaw = process.env.NODE_ENV;
const isLocalDevDefault =
  !nodeEnvRaw || nodeEnvRaw === 'development';

/** Resolved API base (same rules as apiUrl export). */
const apiUrlResolved =
  trimmed(process.env.API_URL) || (isLocalDevDefault ? 'http://localhost:3000' : '');

/**
 * True when the backend URL is clearly this machine (Vite + API on localhost).
 * Used so NODE_ENV=production in backend/.env does not wipe frontendBaseUrl during local dev.
 */
const backendIsLocalHost =
  /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(apiUrlResolved);

/** Same idea as security-bootstrap: empty API_URL counts as local/dev-style. */
const apiUrlForSecurity = trimmed(process.env.API_URL);
const isLocalApiUrl =
  !apiUrlForSecurity || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(apiUrlForSecurity);

const explicitFrontend = trimmed(process.env.FRONTEND_URL || process.env.WEB_APP_URL);

/** Public web app origin (no path). Email links, GET /api/auth/login → SPA, GET /api/auth/verify-email redirect. */
const frontendBaseUrlResolved =
  explicitFrontend ||
  (isLocalDevDefault ? 'http://localhost:5173' : '') ||
  (backendIsLocalHost ? 'http://localhost:5173' : '');

export default {
  nodeEnv: nodeEnvRaw || 'development',
  /** Backend base URL; localhost default only for unset or development NODE_ENV. */
  apiUrl: apiUrlResolved,
  /** Public web app origin (no path). Used for email verification links and API → SPA redirects. */
  frontendBaseUrl: frontendBaseUrlResolved,
  jwtSecret: process.env.JWT_SECRET || 'change-me',
  /** Public production defaults to short-lived access tokens; override with JWT_EXPIRY. */
  jwtExpiry:
    trimmed(process.env.JWT_EXPIRY) ||
    (nodeEnvRaw === 'production' && !isLocalApiUrl ? '15m' : '7d'),
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
  /** Welcome / transactional footer (see modules/email/welcome-email.template.js) */
  mailCompanyName: trimmed(process.env.MAIL_COMPANY_NAME || process.env.FROM_NAME || 'FXMARK'),
  mailCompanyLegal: trimmed(process.env.MAIL_COMPANY_LEGAL),
  mailSupportEmail: trimmed(process.env.MAIL_SUPPORT_EMAIL || process.env.FROM_EMAIL || process.env.ZOHO_MAIL_USER),
  mailSupportPhone: trimmed(process.env.MAIL_SUPPORT_PHONE),
  /** Shown in footer; defaults to public app URL */
  mailCompanyWebsite: trimmed(process.env.MAIL_COMPANY_WEBSITE || explicitFrontend || frontendBaseUrlResolved),
  /** Multiline address for email footer */
  mailCompanyAddress: (process.env.MAIL_COMPANY_ADDRESS || '').trim(),
  /** Full URL to logo image for HTML emails (default: FRONTEND_URL + /fxmark-logo.png) */
  mailLogoUrl: trimmed(process.env.MAIL_LOGO_URL),
};
