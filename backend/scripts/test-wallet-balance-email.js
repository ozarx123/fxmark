/**
 * Send one sample wallet balance update email (same template as production notifications).
 *
 * Loads backend/.env (Zoho + FRONTEND_URL + MAIL_* for branding).
 *
 * Usage:
 *   node scripts/test-wallet-balance-email.js [recipient@example.com]
 * If recipient is omitted, uses ZOHO_MAIL_USER (send to self).
 *
 * From repo root: node backend/scripts/test-wallet-balance-email.js
 */
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(backendRoot, '.env') });

const explicit = (process.argv[2] || '').trim();
const recipient = explicit || (process.env.ZOHO_MAIL_USER || '').trim();
if (!recipient) {
  console.error('Usage: node scripts/test-wallet-balance-email.js <recipient@example.com>');
  console.error('Or set ZOHO_MAIL_USER in backend/.env to send a self-test.');
  process.exit(1);
}

if (!(process.env.ZOHO_MAIL_USER || '').trim() || !(process.env.ZOHO_MAIL_PASSWORD || '').trim()) {
  console.error('Missing ZOHO_MAIL_USER or ZOHO_MAIL_PASSWORD in backend/.env');
  process.exit(1);
}

const { sendWalletBalanceUpdateEmail } = await import('../modules/email/wallet-balance-email.js');

const r = await sendWalletBalanceUpdateEmail({
  to: recipient,
  fullName: 'Test User',
  accountNo: 'TEST-0001',
  type: 'deposit',
  amount: 250.5,
  currency: 'USD',
  reference: 'test-deposit-' + Date.now(),
  newBalance: 1250.75,
  completedAt: new Date(),
});

if (r.sent) {
  console.log('Wallet balance test email sent. Check inbox/spam for:', recipient);
  process.exit(0);
}
console.error('Failed:', r.error || 'unknown');
process.exit(1);
