/**
 * Email sent when wallet balance changes (deposit, withdrawal, transfer, trade P&L, etc.).
 */
import config from '../../config/env.config.js';
import { sendMail } from './email.service.js';
import {
  buildWalletBalanceEmailHtml,
  buildWalletBalanceEmailText,
  formatMoney,
  labelForWalletTxType,
} from './wallet-balance-email.template.js';

function brandingFromConfig() {
  const web = (config.mailCompanyWebsite || config.frontendBaseUrl || '').trim() || '';
  const websiteHref = web ? (web.startsWith('http') ? web : `https://${web}`) : '';
  const websiteLabel = web.replace(/^https?:\/\//i, '').replace(/\/$/, '');
  return {
    companyName: config.mailCompanyName || config.fromName || 'FXMARK',
    companyLegalName: config.mailCompanyLegal || undefined,
    supportEmail: config.mailSupportEmail || config.fromEmail || '',
    supportPhone: config.mailSupportPhone || '',
    companyWebsiteDisplay: websiteLabel || undefined,
    companyWebsiteHref: websiteHref || undefined,
    companyAddress: config.mailCompanyAddress || '',
  };
}

/**
 * @param {{
 *   to: string,
 *   fullName?: string,
 *   accountNo?: string,
 *   type: string,
 *   amount: number,
 *   currency?: string,
 *   reference?: string | null,
 *   newBalance: number,
 *   completedAt?: Date | string | null,
 * }} params
 */
export async function sendWalletBalanceUpdateEmail(params) {
  const base = (config.frontendBaseUrl || '').trim().replace(/\/$/, '');
  const walletUrl = base ? `${base}/wallet` : '';
  const logoUrl = (config.mailLogoUrl || '').trim() || (base ? `${base}/fxmark-logo.png` : '');
  const branding = brandingFromConfig();
  const currency = params.currency || 'USD';
  const label = labelForWalletTxType(params.type);
  const rawAmt = Number(params.amount);
  const t = String(params.type || '').toLowerCase();
  let displayAmt = rawAmt;
  if (t === 'withdrawal' && rawAmt > 0) displayAmt = -Math.abs(rawAmt);
  if (t === 'balance_snapshot') {
    displayAmt = Number(params.newBalance);
  }
  const amountDisplay = formatMoney(displayAmt, currency);
  let signedHint =
    t === 'balance_snapshot'
      ? 'Live wallet balance (manual test)'
      : displayAmt >= 0
        ? 'Credit to your wallet'
        : 'Debit from your wallet';
  if (t === 'pamm_bull_run_balance') {
    signedHint = 'Capital allocated to Bull Run. Profits credit to your USD wallet when distributed.';
  }
  const newBalance = formatMoney(params.newBalance, currency);
  const occurred =
    params.completedAt instanceof Date
      ? params.completedAt.toISOString()
      : params.completedAt
        ? String(params.completedAt)
        : new Date().toISOString();
  const occurredAt = new Date(occurred).toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }) + ' UTC';

  const subject = `${label} — ${amountDisplay} · ${branding.companyName}`;
  const payload = {
    fullName: params.fullName || 'Trader',
    accountNo: params.accountNo || '—',
    transactionLabel: label,
    amountDisplay,
    signedHint,
    newBalance,
    currency,
    reference: params.reference,
    occurredAt,
    walletUrl,
    logoUrl,
    branding,
  };
  if (t === 'pamm_bull_run_balance') {
    payload.headline = 'Bull Run (PAMM) update';
    payload.introLine = 'Your active Bull Run (AI) allocation and withdrawable USD wallet are shown below.';
    payload.amountRowTitle = 'Bull Run allocation';
    payload.balanceRowTitle = 'Withdrawable wallet (USD)';
  }
  const html = buildWalletBalanceEmailHtml(payload);
  const text = buildWalletBalanceEmailText(payload);
  return sendMail({ to: params.to, subject, html, text });
}

export default { sendWalletBalanceUpdateEmail };
