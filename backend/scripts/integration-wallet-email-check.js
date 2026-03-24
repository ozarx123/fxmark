/**
 * Verify configuration and wiring for wallet balance notification emails.
 * Does not send mail; optional GET /api/health when API_URL is set.
 *
 * Usage (from backend/): node scripts/integration-wallet-email-check.js
 */
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(backendRoot, '.env') });

const v = (process.env.MAIL_WALLET_BALANCE_UPDATES || '').trim().toLowerCase();
const walletEmailsEnabled = !['0', 'false', 'no', 'off'].includes(v);
const zohoOk =
  !!(process.env.ZOHO_MAIL_USER || '').trim() && !!(process.env.ZOHO_MAIL_PASSWORD || '').replace(/\s+/g, '').trim();
const mongoOk = !!(process.env.CONNECTION_STRING || process.env.MONGODB_URI || '').trim();

const lines = [
  '=== Wallet balance email — integration check ===',
  '',
  'Frontend → Backend (user flows that change wallet and queue email):',
  '  • POST /api/wallet/deposits → POST .../deposits/:id/confirm  → deposit.service → queueWalletBalanceNotifyById',
  '  • POST /api/wallet/withdrawals → POST .../withdrawals/:id/process → withdrawal.service (completed) → queueWalletBalanceNotifyById',
  '  • POST /api/wallet/transfer → transfer.service → atomicInternalTransfer → queueWalletBalanceNotifyById (sender + recipient)',
  '  • Trading close P&L (not Wallet page) → positions.service → queueWalletBalanceNotifyById',
  '',
  'SPA routes (frontend-web):',
  '  • /wallet — DepositConfirmModal, WithdrawConfirmModal, TransferModal → walletApi (see src/api/walletApi.js)',
  '  • VITE_API_URL must point at the API that has the same Zoho + DB as your expectations (see src/config/apiBase.js)',
  '',
  `MAIL_WALLET_BALANCE_UPDATES: ${walletEmailsEnabled ? 'enabled (default)' : 'DISABLED'} — wallet notify ${walletEmailsEnabled ? 'will' : 'will NOT'} run`,
  `Zoho SMTP (ZOHO_MAIL_USER/PASSWORD): ${zohoOk ? 'configured' : 'MISSING — sendMail will no-op'}`,
  `MongoDB (CONNECTION_STRING or MONGODB_URI): ${mongoOk ? 'set' : 'MISSING — notify cannot load user/wallet'}`,
  '',
];

const apiBase = (process.env.API_URL || 'http://localhost:3000').replace(/\/$/, '');
if (process.argv.includes('--health')) {
  try {
    const r = await fetch(`${apiBase}/api/health`);
    const ok = r.ok;
    const body = await r.text();
    lines.push(`GET ${apiBase}/api/health → ${r.status} ${ok ? 'OK' : ''}`);
    if (!ok) lines.push(`  body: ${body.slice(0, 200)}`);
  } catch (e) {
    lines.push(`GET ${apiBase}/api/health → failed: ${e.message}`);
    lines.push('  (Start the API or set API_URL to a reachable backend)');
  }
} else {
  lines.push('Tip: node scripts/integration-wallet-email-check.js --health  (requires API running)');
}

lines.push('');
lines.push('Module import smoke test...');

try {
  const mod = await import('../modules/email/wallet-balance-notify.js');
  if (typeof mod.queueWalletBalanceNotifyById !== 'function') throw new Error('missing export');
  const mod2 = await import('../modules/email/wallet-balance-email.js');
  if (typeof mod2.sendWalletBalanceUpdateEmail !== 'function') throw new Error('missing export');
  lines.push('  wallet-balance-notify.js + wallet-balance-email.js: OK');
} catch (e) {
  lines.push(`  FAILED: ${e.message}`);
  console.log(lines.join('\n'));
  process.exit(1);
}

console.log(lines.join('\n'));
process.exit(0);
