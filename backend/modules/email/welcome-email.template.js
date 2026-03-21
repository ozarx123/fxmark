/**
 * HTML + plain-text welcome email (transactional). Inline styles for major clients.
 * Brand colors match frontend-web/src/components/FxmarkLogo.jsx (F/X/MARK + GLOBAL).
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

function formatPhone(phone) {
  const t = (phone || '').trim();
  return t ? t : 'Not provided yet — you can add it in your profile anytime.';
}

/** HTML wordmark when logo image URL is unavailable (matches FxmarkLogo wordmark on dark). */
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
 *   fullName: string,
 *   accountNo: string,
 *   phone?: string | null,
 *   dashboardUrl?: string,
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
export function buildWelcomeEmailHtml({ fullName, accountNo, phone, dashboardUrl, logoUrl, branding }) {
  const name = escapeHtml(fullName || 'Trader');
  const acct = escapeHtml(accountNo || '—');
  const phoneLine = escapeHtml(formatPhone(phone));
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
  const dash = (dashboardUrl || '').trim();
  const dashAttr = escapeHtml(dash);
  const logoSrc = (logoUrl || '').trim();
  const logoAttr = escapeHtml(logoSrc);

  const logoBlock =
    logoSrc
      ? `<img src="${logoAttr}" alt="FXMARK GLOBAL" width="200" style="max-width:200px;width:100%;height:auto;display:block;margin:0 auto 12px;border:0;outline:none;text-decoration:none;" />`
      : wordmarkHtmlFallback();

  const footerRows = [];
  const linkColor = BRAND_ORANGE;
  const footerLabel = '#a3a3a3';
  const footerValue = '#e5e5e5';
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

  const ctaBlock = dash
    ? `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 0;">
    <tr>
      <td style="border-radius:10px;background:linear-gradient(135deg,${BRAND_RED} 0%,${BRAND_ORANGE} 100%);">
        <a href="${dashAttr}" target="_blank" rel="noopener noreferrer"
          style="display:inline-block;padding:14px 28px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:15px;font-weight:600;color:${BRAND_WHITE};text-decoration:none;border-radius:10px;">
          Open your dashboard
        </a>
      </td>
    </tr>
  </table>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Welcome</title></head>
<body style="margin:0;padding:0;background-color:${BRAND_DARK};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${BRAND_DARK};padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width:560px;margin:0 auto;" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td style="padding:28px 28px 20px;background:linear-gradient(165deg,#1a0f0f 0%,${BRAND_DARK} 45%,#0d0d0d 100%);border-radius:16px 16px 0 0;border:1px solid ${BRAND_LINE};border-bottom:0;">
              ${logoBlock}
              <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:${BRAND_ORANGE};font-weight:700;">${company}</p>
              <h1 style="margin:14px 0 0;font-family:Georgia,'Times New Roman',serif;font-size:26px;font-weight:600;color:${BRAND_WHITE};line-height:1.25;">Welcome aboard, ${name}</h1>
              <p style="margin:14px 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:15px;line-height:1.55;color:${BRAND_MUTED};">
                Your trading account is ready. Below are your account details — keep them somewhere safe.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:28px;background-color:${BRAND_WHITE};border-left:1px solid ${BRAND_LINE};border-right:1px solid ${BRAND_LINE};">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-radius:12px;overflow:hidden;border:1px solid #e8e8e8;">
                <tr>
                  <td style="padding:16px 18px;background-color:#fafafa;border-bottom:1px solid #eeeeee;border-left:4px solid ${BRAND_RED};">
                    <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#666666;font-weight:600;">Full name</p>
                    <p style="margin:6px 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:16px;color:${BRAND_DARK};font-weight:600;">${name}</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:16px 18px;background-color:${BRAND_WHITE};border-bottom:1px solid #eeeeee;border-left:4px solid ${BRAND_ORANGE};">
                    <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#666666;font-weight:600;">Account number</p>
                    <p style="margin:6px 0 0;font-family:'SF Mono',Consolas,Monaco,monospace;font-size:18px;color:${BRAND_RED};font-weight:700;letter-spacing:0.04em;">${acct}</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:16px 18px;background-color:#fafafa;border-left:4px solid ${BRAND_RED};">
                    <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#666666;font-weight:600;">Phone</p>
                    <p style="margin:6px 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:15px;color:#333333;line-height:1.45;">${phoneLine}</p>
                  </td>
                </tr>
              </table>
              ${ctaBlock}
              <p style="margin:24px 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:13px;line-height:1.55;color:#666666;">
                You will receive a separate email to verify your address. If you didn’t create this account, please contact us immediately.
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
                This message was sent to you because a new account was registered with this email address.
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

export function buildWelcomeEmailText({ fullName, accountNo, phone, dashboardUrl, branding }) {
  const c = branding;
  const lines = [
    `Welcome to ${c.companyName || 'FXMARK'}, ${fullName || 'Trader'}!`,
    '',
    'Your account details:',
    `  Full name:      ${fullName || '—'}`,
    `  Account number: ${accountNo || '—'}`,
    `  Phone:          ${formatPhone(phone)}`,
    '',
  ];
  if ((dashboardUrl || '').trim()) {
    lines.push(`Dashboard: ${dashboardUrl.trim()}`, '');
  }
  lines.push(
    'You will receive a separate email to verify your email address.',
    '',
    '—',
    c.companyName || 'FXMARK',
    c.companyLegalName || '',
    c.supportEmail ? `Email: ${c.supportEmail}` : '',
    c.supportPhone ? `Phone: ${c.supportPhone}` : '',
    c.companyWebsiteHref || c.companyWebsiteDisplay
      ? `Web: ${c.companyWebsiteHref || c.companyWebsiteDisplay}`
      : '',
    c.companyAddress || ''
  );
  return lines.filter(Boolean).join('\n');
}
