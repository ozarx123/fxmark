/**
 * Welcome email after registration (distinct from verification email).
 */
import config from '../../config/env.config.js';
import { sendMail } from './email.service.js';
import { buildWelcomeEmailHtml, buildWelcomeEmailText } from './welcome-email.template.js';

/**
 * @param {{ to: string, fullName?: string, accountNo?: string, phone?: string | null }} params
 * @returns {Promise<{ sent: boolean, error?: string }>}
 */
export async function sendWelcomeEmail({ to, fullName, accountNo, phone }) {
  const base = (config.frontendBaseUrl || '').trim().replace(/\/$/, '');
  const dashboardUrl = base ? `${base}/dashboard` : '';
  const logoUrl =
    (config.mailLogoUrl || '').trim() || (base ? `${base}/fxmark-logo.png` : '');

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

  const subject = `Welcome to ${branding.companyName} — your account is ready`;
  const html = buildWelcomeEmailHtml({
    fullName: fullName || 'Trader',
    accountNo: accountNo || '—',
    phone,
    dashboardUrl,
    logoUrl,
    branding,
  });
  const text = buildWelcomeEmailText({
    fullName: fullName || 'Trader',
    accountNo: accountNo || '—',
    phone,
    dashboardUrl,
    branding,
  });

  return sendMail({ to, subject, html, text });
}

export default { sendWelcomeEmail };
