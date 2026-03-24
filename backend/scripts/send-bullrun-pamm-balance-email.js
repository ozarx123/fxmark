/**
 * Send Bull Run (PAMM AI) allocation + USD wallet snapshot email.
 *
 * Usage:
 *   node scripts/send-bullrun-pamm-balance-email.js user@example.com
 *
 * Requires: backend/.env (MongoDB, Zoho mail vars)
 */
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(backendRoot, '.env') });

function isBullRunFund(fund) {
  if (!fund) return false;
  const name = String(fund.name || '').toUpperCase();
  const type = String(fund.fundType || '').toLowerCase();
  return name === 'BULL RUN' || type === 'ai';
}

const emailArg = (process.argv[2] || '').trim().toLowerCase();
if (!emailArg) {
  console.error('Usage: node scripts/send-bullrun-pamm-balance-email.js <email>');
  process.exit(1);
}

if (!(process.env.ZOHO_MAIL_USER || '').trim() || !(process.env.ZOHO_MAIL_PASSWORD || '').trim()) {
  console.error('Missing ZOHO_MAIL_USER or ZOHO_MAIL_PASSWORD in backend/.env');
  process.exit(1);
}

const { default: userRepo } = await import('../modules/users/user.repository.js');
const { default: walletRepo } = await import('../modules/wallet/wallet.repository.js');
const { default: pammRepo } = await import('../modules/pamm/pamm.repository.js');
const { sendWalletBalanceUpdateEmail } = await import('../modules/email/wallet-balance-email.js');

const user = await userRepo.findByEmail(emailArg);
if (!user?.id) {
  console.error('No user found for email:', emailArg);
  process.exit(1);
}

const uid = String(user.id);
const allocs = await pammRepo.listAllocationsByFollowerFlexible(uid, { status: 'active', limit: 80 });

let bullRunTotal = 0;
let hasBullRunAlloc = false;
const fundNames = new Set();
for (const a of allocs) {
  const fund = await pammRepo.getManagerById(a.managerId);
  if (!isBullRunFund(fund)) continue;
  hasBullRunAlloc = true;
  bullRunTotal += Number(a.allocatedBalance) || 0;
  if (fund?.name) fundNames.add(String(fund.name));
}

if (allocs.length === 0) {
  console.error('No active PAMM allocations for user:', emailArg);
  process.exit(1);
}

if (!hasBullRunAlloc) {
  console.error('No active Bull Run (fundType ai / name BULL RUN) allocation for user:', emailArg);
  process.exit(1);
}

const wallet = await walletRepo.getOrCreateWallet(uid, 'USD');
const walletUsd = Number(wallet?.balance) || 0;

const r = await sendWalletBalanceUpdateEmail({
  to: emailArg,
  fullName: user.name || emailArg.split('@')[0],
  accountNo: user.accountNo || '—',
  type: 'pamm_bull_run_balance',
  amount: bullRunTotal,
  currency: 'USD',
  reference: `bull-run-${[...fundNames].join(',') || 'pamm'}-${Date.now()}`,
  newBalance: walletUsd,
  completedAt: new Date(),
});

if (r.sent) {
  console.log(
    'Sent Bull Run PAMM balance email to',
    emailArg,
    '| allocation USD:',
    bullRunTotal.toFixed(2),
    '| wallet USD:',
    walletUsd.toFixed(2)
  );
  process.exit(0);
}
console.error('Failed:', r.error || 'unknown');
process.exit(1);
