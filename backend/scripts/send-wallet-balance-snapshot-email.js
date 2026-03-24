/**
 * Send one wallet-style email with the user's current USD wallet balance from MongoDB.
 *
 * Usage:
 *   node scripts/send-wallet-balance-snapshot-email.js user@example.com
 *
 * Requires: backend/.env (CONNECTION_STRING / MONGODB_URI, Zoho mail vars)
 */
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(backendRoot, '.env') });

const emailArg = (process.argv[2] || '').trim().toLowerCase();
if (!emailArg) {
  console.error('Usage: node scripts/send-wallet-balance-snapshot-email.js <email>');
  process.exit(1);
}

if (!(process.env.ZOHO_MAIL_USER || '').trim() || !(process.env.ZOHO_MAIL_PASSWORD || '').trim()) {
  console.error('Missing ZOHO_MAIL_USER or ZOHO_MAIL_PASSWORD in backend/.env');
  process.exit(1);
}

const { default: userRepo } = await import('../modules/users/user.repository.js');
const { default: walletRepo } = await import('../modules/wallet/wallet.repository.js');
const { sendWalletBalanceUpdateEmail } = await import('../modules/email/wallet-balance-email.js');

const user = await userRepo.findByEmail(emailArg);
if (!user?.id) {
  console.error('No user found for email:', emailArg);
  process.exit(1);
}

const wallet = await walletRepo.getOrCreateWallet(user.id, 'USD');
const bal = Number(wallet?.balance) || 0;

const r = await sendWalletBalanceUpdateEmail({
  to: emailArg,
  fullName: user.name || emailArg.split('@')[0],
  accountNo: user.accountNo || '—',
  type: 'balance_snapshot',
  amount: bal,
  currency: 'USD',
  reference: `snapshot-${Date.now()}`,
  newBalance: bal,
  completedAt: new Date(),
});

if (r.sent) {
  console.log('Sent balance snapshot email to', emailArg, '| USD balance:', bal.toFixed(2));
  process.exit(0);
}
console.error('Failed:', r.error || 'unknown');
process.exit(1);
