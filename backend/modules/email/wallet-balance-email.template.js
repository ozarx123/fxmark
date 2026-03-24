/**
 * Wallet balance update notification (transactional). Brand aligned with welcome-email.
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

export function formatMoney(amount, currency = 'USD') {
  const n = Number(amount);
  if (!Number.isFinite(n)) return '—';
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD' }).format(n);
  } catch {
    return `${n.toFixed(2)} ${currency}`;
  }
}

/** Map wallet_transactions.type → short label */
export function labelForWalletTxType(type) {
  const t = String(type || '').toLowerCase();
  const map = {
    deposit: 'Deposit',
    withdrawal: 'Withdrawal',
    transfer_in: 'Transfer received',
    transfer_out: 'Transfer sent',
    trade: 'Trading P&L',
    import_opening_balance: 'Opening balance',
    ib_pamm_commission: 'IB commission',
    pamm_dist: 'PAMM distribution',
    pamm_manager_cap_in: 'PAMM manager allocation',
    pamm_manager_cap_out: 'PAMM manager withdrawal',
    admin_credit: 'Account credit',
    admin_debit: 'Account debit',
    admin_profit_adjustment: 'Profit adjustment',
    balance_snapshot: 'Balance snapshot',
    pamm_bull_run_balance: 'Bull Run (PAMM) allocation',
  };
  return map[t] || t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) || 'Wallet activity';
}

/**
 * @param {{
 *   fullName: string,
 *   accountNo?: string,
 *   transactionLabel: string,
 *   amountDisplay: string,
 *   signedHint?: string,
 *   newBalance: string,
 *   currency: string,
 *   reference?: string | null,
 *   occurredAt: string,
 *   walletUrl?: string,
 *   logoUrl?: string,
 *   branding: object,
 *   headline?: string,
 *   introLine?: string,
 *   amountRowTitle?: string,
 *   balanceRowTitle?: string,
 * }} p
 */
export function buildWalletBalanceEmailHtml(p) {
  const name = escapeHtml(p.fullName || 'Trader');
  const acct = escapeHtml(p.accountNo || '—');
  const company = escapeHtml(p.branding?.companyName || 'FXMARK');
  const legal = p.branding?.companyLegalName ? escapeHtml(p.branding.companyLegalName) : '';
  const supportEmail = (p.branding?.supportEmail || '').trim();
  const supportEmailHtml = escapeHtml(supportEmail);
  const supportPhone = p.branding?.supportPhone ? escapeHtml(p.branding.supportPhone) : '';
  const websiteHref = (p.branding?.companyWebsiteHref || '').trim();
  const websiteHrefAttr = escapeHtml(websiteHref);
  const websiteLabel = escapeHtml(
    (p.branding?.companyWebsiteDisplay || websiteHref.replace(/^https?:\/\//i, '')).replace(/\/$/, '')
  );
  const address = p.branding?.companyAddress ? escapeHtml(p.branding.companyAddress).replace(/\n/g, '<br/>') : '';
  const logoSrc = (p.logoUrl || '').trim();
  const logoAttr = escapeHtml(logoSrc);
  const logoBlock = logoSrc
    ? `<img src="${logoAttr}" alt="${company}" width="160" style="display:block;margin:0 auto 12px;max-width:160px;height:auto;" />`
    : `<p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:28px;font-weight:800;"><span style="color:${BRAND_RED};">F</span><span style="color:${BRAND_ORANGE};">X</span><span style="color:${BRAND_RED};">MARK</span></p>`;

  const walletUrl = (p.walletUrl || '').trim();
  const walletAttr = escapeHtml(walletUrl);
  const ctaBlock = walletUrl
    ? `<p style="margin:24px 0 0;text-align:center;"><a href="${walletAttr}" style="display:inline-block;padding:12px 22px;background:linear-gradient(135deg,${BRAND_RED} 0%,${BRAND_ORANGE} 100%);color:${BRAND_WHITE};text-decoration:none;border-radius:10px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;font-weight:600;">View wallet</a></p>`
    : '';

  const ref = p.reference != null && String(p.reference).trim() !== '' ? escapeHtml(String(p.reference)) : '';
  const footerRows = [];
  if (supportEmail) {
    footerRows.push(
      `<tr><td style="padding:4px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:12px;color:#aaaaaa;">Email: <a href="mailto:${supportEmailHtml}" style="color:${BRAND_ORANGE};text-decoration:none;">${supportEmailHtml}</a></td></tr>`
    );
  }
  if (supportPhone) {
    footerRows.push(
      `<tr><td style="padding:4px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:12px;color:#aaaaaa;">Phone: ${supportPhone}</td></tr>`
    );
  }
  if (websiteHref) {
    footerRows.push(
      `<tr><td style="padding:4px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:12px;color:#aaaaaa;">Web: <a href="${websiteHrefAttr}" style="color:${BRAND_ORANGE};text-decoration:none;">${websiteLabel}</a></td></tr>`
    );
  }
  if (address) {
    footerRows.push(
      `<tr><td style="padding:4px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:12px;color:#aaaaaa;line-height:1.45;">${address}</td></tr>`
    );
  }

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background-color:#f4f4f4;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f4f4;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;margin:0 auto;">
          <tr>
            <td style="padding:28px 28px 20px;background:linear-gradient(165deg,#1a0f0f 0%,${BRAND_DARK} 45%,#0d0d0d 100%);border-radius:16px 16px 0 0;border:1px solid ${BRAND_LINE};border-bottom:0;">
              ${logoBlock}
              <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:${BRAND_ORANGE};font-weight:700;">${company}</p>
              <h1 style="margin:14px 0 0;font-family:Georgia,'Times New Roman',serif;font-size:24px;font-weight:600;color:${BRAND_WHITE};line-height:1.25;">${escapeHtml(p.headline || 'Wallet update')}</h1>
              <p style="margin:12px 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:15px;line-height:1.55;color:${BRAND_MUTED};">
                ${p.introLine != null && String(p.introLine).trim() !== '' ? escapeHtml(p.introLine) : `Hi ${name}, your wallet balance changed. Details below.`}
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:28px;background-color:${BRAND_WHITE};border-left:1px solid ${BRAND_LINE};border-right:1px solid ${BRAND_LINE};">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-radius:12px;overflow:hidden;border:1px solid #e8e8e8;">
                <tr>
                  <td style="padding:14px 18px;background-color:#fafafa;border-bottom:1px solid #eeeeee;">
                    <p style="margin:0;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#666;font-weight:600;">Activity</p>
                    <p style="margin:6px 0 0;font-size:17px;color:${BRAND_DARK};font-weight:700;">${escapeHtml(p.transactionLabel)}</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:14px 18px;border-bottom:1px solid #eeeeee;">
                    <p style="margin:0;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#666;font-weight:600;">${escapeHtml(p.amountRowTitle || 'Amount')}</p>
                    <p style="margin:6px 0 0;font-size:22px;font-weight:800;color:${BRAND_RED};font-family:'SF Mono',Consolas,monospace;">${escapeHtml(p.amountDisplay)}</p>
                    ${p.signedHint ? `<p style="margin:6px 0 0;font-size:13px;color:#666;">${escapeHtml(p.signedHint)}</p>` : ''}
                  </td>
                </tr>
                <tr>
                  <td style="padding:14px 18px;background-color:#fafafa;border-bottom:1px solid #eeeeee;">
                    <p style="margin:0;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#666;font-weight:600;">${escapeHtml(p.balanceRowTitle || `New balance (${p.currency})`)}</p>
                    <p style="margin:6px 0 0;font-size:20px;font-weight:700;color:${BRAND_DARK};font-family:'SF Mono',Consolas,monospace;">${escapeHtml(p.newBalance)}</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:14px 18px;">
                    <p style="margin:0;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#666;font-weight:600;">Account</p>
                    <p style="margin:6px 0 0;font-size:15px;color:#333;">${acct}</p>
                    ${ref ? `<p style="margin:10px 0 0;font-size:12px;color:#666;">Reference: <span style="font-family:monospace;">${ref}</span></p>` : ''}
                    <p style="margin:10px 0 0;font-size:12px;color:#888;">${escapeHtml(p.occurredAt)}</p>
                  </td>
                </tr>
              </table>
              ${ctaBlock}
            </td>
          </tr>
          <tr>
            <td style="padding:22px 28px;background-color:#141414;border-radius:0 0 16px 16px;border:1px solid ${BRAND_LINE};border-top:0;">
              <p style="margin:0 0 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;font-weight:600;color:${BRAND_WHITE};">${company}${legal ? ` · ${legal}` : ''}</p>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${footerRows.join('')}</table>
              <p style="margin:16px 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:11px;color:#777;line-height:1.5;">
                This is an automated message about your wallet. If you did not expect this activity, contact support immediately.
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

export function buildWalletBalanceEmailText(p) {
  const headline = p.headline || 'Wallet update';
  const amtLabel = p.amountRowTitle || 'Amount';
  const balLabel = p.balanceRowTitle || `New balance (${p.currency})`;
  const lines = [
    `${headline} — ${p.branding?.companyName || 'FXMARK'}`,
    '',
    `Hello ${p.fullName || 'Trader'},`,
    '',
  ];
  if (p.introLine != null && String(p.introLine).trim() !== '') {
    lines.push(p.introLine, '');
  }
  lines.push(
    `Activity: ${p.transactionLabel}`,
    `${amtLabel}: ${p.amountDisplay}`,
    `${balLabel}: ${p.newBalance}`,
    `Account: ${p.accountNo || '—'}`,
  );
  if (p.reference != null && String(p.reference).trim() !== '') lines.push(`Reference: ${p.reference}`);
  lines.push(`Time: ${p.occurredAt}`, '');
  if ((p.walletUrl || '').trim()) lines.push(`Wallet: ${p.walletUrl.trim()}`, '');
  const c = p.branding || {};
  lines.push(
    '—',
    c.companyName || 'FXMARK',
    c.companyLegalName || '',
    c.supportEmail ? `Email: ${c.supportEmail}` : '',
    c.supportPhone ? `Phone: ${c.supportPhone}` : '',
    c.companyWebsiteHref || c.companyWebsiteDisplay ? `Web: ${c.companyWebsiteHref || c.companyWebsiteDisplay}` : '',
    c.companyAddress || ''
  );
  return lines.filter(Boolean).join('\n');
}
