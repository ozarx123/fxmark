/**
 * Forgot-password email (reset link).
 */
import config from '../../config/env.config.js';
import { sendMail } from './email.service.js';
import {
  buildForgotPasswordEmailHtml,
  buildForgotPasswordEmailText,
} from './forgot-password-email.template.js';

function getPasswordResetExpiryMs() {
  const n = parseInt(process.env.PASSWORD_RESET_EXPIRY_MS || '', 10);
  if (!Number.isNaN(n) && n > 0) return n;
  return 60 * 60 * 1000;
}

function formatExpiryLabel(ms) {
  if (ms >= 24 * 60 * 60 * 1000) {
    return `${Math.round(ms / (24 * 60 * 60 * 1000))} day(s)`;
  }
  if (ms >= 60 * 60 * 1000) {
    return `${Math.round(ms / (60 * 60 * 1000))} hour(s)`;
  }
  return `${Math.round(ms / (60 * 1000))} minutes`;
}

/**
 * @param {{ to: string, greetingName?: string, resetToken: string }} params
 */
export async function sendForgotPasswordEmail({ to, greetingName, resetToken }) {
  const base = (config.frontendBaseUrl || '').trim().replace(/\/$/, '');
  // Hash route: browser always requests `/` (index.html); works on static hosts without SPA rewrites.
  // HashRouteLift in frontend maps `/#/reset-password?token=` → `/reset-password?token=`.
  const resetUrl = base
    ? `${base}/#/reset-password?token=${encodeURIComponent(resetToken.trim())}`
    : '';
  const logoUrl =
    (config.mailLogoUrl || '').trim() || (base ? `${base}/fxmark-logo.png` : '');
  const ms = getPasswordResetExpiryMs();
  const expiryLabel = formatExpiryLabel(ms);

  const web =
    (config.mailCompanyWebsite || config.frontendBaseUrl || '').trim() || '';
  const websiteHref = web ? (web.startsWith('http') ? web : `https://${web}`) : '';
  const websiteLabel = web.replace(/^https?:\/\//i, '').replace(/\/$/, '');

  const branding = {
    companyName: config.mailCompanyName || config.fromName || 'FXMARK',
    companyLegalName: config.mailCompanyLegal || undefined,
    supportEmail: config.mailSupportEmail || config.fromEmail || '',
    supportPhone: config.mailSupportPhone || '',
    companyWebsiteDisplay: websiteLabel || undefined,
    companyWebsiteHref: websiteHref || undefined,
    companyAddress: config.mailCompanyAddress || '',
  };

  const subject = `${branding.companyName} — Reset your password`;
  const html = buildForgotPasswordEmailHtml({
    greetingName: greetingName || 'there',
    resetUrl,
    expiryLabel,
    logoUrl,
    branding,
  });
  const text = buildForgotPasswordEmailText({
    greetingName: greetingName || 'there',
    resetUrl,
    expiryLabel,
    branding,
  });

  return sendMail({ to, subject, html, text });
}

export default { sendForgotPasswordEmail };
