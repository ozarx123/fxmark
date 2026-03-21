/**
 * Forgot-password / reset link email — same brand as welcome-email (FxmarkLogo.jsx).
 */

const BRAND_DARK = '#0B0B0B';
const BRAND_RED = '#E10600';
const BRAND_ORANGE = '#FF6A00';
const BRAND_WHITE = '#ffffff';
const BRAND_MUTED = '#b0b0b0';
const BRAND_LINE = '#2a1818';

function escapeHtml(s) {
  if (s == null || s === '') return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function wordmarkHtmlFallback() {
  return `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 4px;">
    <tr>
      <td align="center" style="padding:0;">
        <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:30px;font-weight:800;line-height:1.05;letter-spacing:-0.02em;">
          <span style="color:${BRAND_RED};">F</span><span style="color:${BRAND_ORANGE};">X</span><span style="color:${BRAND_RED};">MARK</span>
        </p>
        <p style="margin:6px 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:11px;font-weight:600;letter-spacing:0.28em;color:rgba(255,255,255,0.88);">GLOBAL</p>
      </td>
    </tr>
  </table>`;
}

/**
 * @param {{
 *   greetingName: string,
 *   resetUrl: string,
 *   expiryLabel: string,
 *   logoUrl?: string,
 *   branding: {
 *     companyName: string,
 *     companyLegalName?: string,
 *     supportEmail: string,
 *     supportPhone?: string,
 *     companyWebsiteDisplay?: string,
 *     companyWebsiteHref?: string,
 *     companyAddress?: string,
 *   }
 * }} params
 */
export function buildForgotPasswordEmailHtml({
  greetingName,
  resetUrl,
  expiryLabel,
  logoUrl,
  branding,
}) {
  const name = escapeHtml(greetingName || 'there');
  const resetAttr = escapeHtml((resetUrl || '').trim());
  const expiry = escapeHtml(expiryLabel || '1 hour');
  const c = branding;
  const company = escapeHtml(c.companyName || 'FXMARK');
  const legal = c.companyLegalName ? escapeHtml(c.companyLegalName) : '';
  const supportEmailRaw = (c.supportEmail || '').trim();
  const supportEmailHtml = escapeHtml(supportEmailRaw);
  const supportPhone = c.supportPhone ? escapeHtml(c.supportPhone) : '';
  const websiteDisplay = c.companyWebsiteDisplay ? escapeHtml(c.companyWebsiteDisplay) : '';
  const websiteHrefRaw = (c.companyWebsiteHref || '').trim();
  const websiteHrefAttr = escapeHtml(websiteHrefRaw);
  const address = c.companyAddress ? escapeHtml(c.companyAddress).replace(/\n/g, '<br/>') : '';
  const logoSrc = (logoUrl || '').trim();
  const logoAttr = escapeHtml(logoSrc);

  const logoBlock =
    logoSrc
      ? `<img src="${logoAttr}" alt="FXMARK GLOBAL" width="200" style="max-width:200px;width:100%;height:auto;display:block;margin:0 auto 12px;border:0;outline:none;text-decoration:none;" />`
      : wordmarkHtmlFallback();

  const linkColor = BRAND_ORANGE;
  const footerLabel = '#a3a3a3';
  const footerValue = '#e5e5e5';
  const footerRows = [];
  if (supportEmailRaw) {
    const mailto = `mailto:${encodeURIComponent(supportEmailRaw)}`;
    footerRows.push(
      `<tr><td style="padding:4px 0;color:${footerLabel};font-size:13px;">Email: <a href="${escapeHtml(mailto)}" style="color:${linkColor};text-decoration:none;">${supportEmailHtml}</a></td></tr>`
    );
  }
  if (supportPhone) {
    footerRows.push(
      `<tr><td style="padding:4px 0;color:${footerLabel};font-size:13px;">Phone: <span style="color:${footerValue};">${supportPhone}</span></td></tr>`
    );
  }
  if (websiteDisplay && websiteHrefRaw) {
    footerRows.push(
      `<tr><td style="padding:4px 0;color:${footerLabel};font-size:13px;">Web: <a href="${websiteHrefAttr}" target="_blank" rel="noopener noreferrer" style="color:${linkColor};text-decoration:none;">${websiteDisplay}</a></td></tr>`
    );
  }
  if (address) {
    footerRows.push(`<tr><td style="padding:8px 0 0;color:#888888;font-size:12px;line-height:1.5;">${address}</td></tr>`);
  }

  const ctaBlock = resetAttr
    ? `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 0;">
    <tr>
      <td style="border-radius:10px;background:linear-gradient(135deg,${BRAND_RED} 0%,${BRAND_ORANGE} 100%);">
        <a href="${resetAttr}" target="_blank" rel="noopener noreferrer"
          style="display:inline-block;padding:14px 28px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:15px;font-weight:600;color:${BRAND_WHITE};text-decoration:none;border-radius:10px;">
          Reset your password
        </a>
      </td>
    </tr>
  </table>
  <p style="margin:16px 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:12px;line-height:1.5;color:#888888;word-break:break-all;">
    Or copy this link:<br/><span style="color:#555555;">${resetAttr}</span>
  </p>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Reset password</title></head>
<body style="margin:0;padding:0;background-color:${BRAND_DARK};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${BRAND_DARK};padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width:560px;margin:0 auto;" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td style="padding:28px 28px 20px;background:linear-gradient(165deg,#1a0f0f 0%,${BRAND_DARK} 45%,#0d0d0d 100%);border-radius:16px 16px 0 0;border:1px solid ${BRAND_LINE};border-bottom:0;">
              ${logoBlock}
              <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:${BRAND_ORANGE};font-weight:700;">${company}</p>
              <h1 style="margin:14px 0 0;font-family:Georgia,'Times New Roman',serif;font-size:24px;font-weight:600;color:${BRAND_WHITE};line-height:1.25;">Password reset</h1>
              <p style="margin:14px 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:15px;line-height:1.55;color:${BRAND_MUTED};">
                Hi ${name}, we received a request to reset the password for your account. Use the button below — it expires in <strong style="color:${BRAND_WHITE};">${expiry}</strong>.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:28px;background-color:${BRAND_WHITE};border-left:1px solid ${BRAND_LINE};border-right:1px solid ${BRAND_LINE};">
              ${ctaBlock}
              <p style="margin:20px 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;line-height:1.55;color:#444444;">
                If you didn’t ask for this, you can ignore this email. Your password will stay the same.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:22px 28px;background-color:#141414;border-radius:0 0 16px 16px;border:1px solid ${BRAND_LINE};border-top:0;">
              <p style="margin:0 0 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;font-weight:600;color:${BRAND_WHITE};">${company}${legal ? ` · ${legal}` : ''}</p>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                ${footerRows.join('')}
              </table>
              <p style="margin:16px 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:11px;color:#777777;line-height:1.5;">
                This message was sent because a password reset was requested for your account.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function buildForgotPasswordEmailText({ greetingName, resetUrl, expiryLabel, branding }) {
  const c = branding;
  const lines = [
    `${c.companyName || 'FXMARK'} — Password reset`,
    '',
    `Hi ${greetingName || 'there'},`,
    '',
    'We received a request to reset your password. Open this link to choose a new password:',
    (resetUrl || '').trim() || '(link unavailable)',
    '',
    `This link expires in ${expiryLabel || '1 hour'}.`,
    '',
    "If you didn't request this, you can ignore this email.",
    '',
    '—',
    c.companyName || 'FXMARK',
    c.companyLegalName || '',
    c.supportEmail ? `Email: ${c.supportEmail}` : '',
    c.supportPhone ? `Phone: ${c.supportPhone}` : '',
    c.companyWebsiteHref || c.companyWebsiteDisplay
      ? `Web: ${c.companyWebsiteHref || c.companyWebsiteDisplay}`
      : '',
    c.companyAddress || '',
  ];
  return lines.filter(Boolean).join('\n');
}
