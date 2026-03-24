/**
 * Queue wallet balance notification after DB commit (deferred; avoids circular imports with wallet.repository).
 * Enable by default. Disable with MAIL_WALLET_BALANCE_UPDATES=0
 */
import { ObjectId } from 'mongodb';
import { getDb } from '../../config/mongo.js';
import { sendWalletBalanceUpdateEmail } from './wallet-balance-email.js';

function isWalletNotifyEnabled() {
  const v = (process.env.MAIL_WALLET_BALANCE_UPDATES || '').trim().toLowerCase();
  if (v === '0' || v === 'false' || v === 'no' || v === 'off') return false;
  return true;
}

function excludedTypes() {
  const raw = process.env.MAIL_WALLET_BALANCE_EXCLUDE_TYPES || 'import_opening_balance';
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  );
}

function minAbsAmount() {
  const n = parseFloat(String(process.env.MAIL_WALLET_NOTIFY_MIN_ABS || '0.005'));
  return Number.isFinite(n) && n >= 0 ? n : 0.005;
}

/** Always notify deposits/withdrawals/transfers; skip dust for other types */
function isCriticalWalletType(typ) {
  return ['deposit', 'withdrawal', 'transfer_in', 'transfer_out'].includes(typ);
}

/**
 * @param {object} tx - wallet_transactions row (insert or after update), must include userId, type, amount, status completed
 */
export function queueWalletBalanceNotify(tx) {
  if (!isWalletNotifyEnabled()) return;
  if (!tx || tx.status !== 'completed') return;
  const typ = String(tx.type || '').toLowerCase();
  if (!typ) return;
  if (excludedTypes().has(typ)) return;

  setImmediate(() => {
    void runWalletBalanceNotify(tx).catch((e) => console.warn('[wallet-email] notify failed:', e?.message || e));
  });
}

/** After Mongo transaction commit: load wallet_transactions by id and notify (avoids pre-commit reads). */
export function queueWalletBalanceNotifyById(transactionId) {
  if (!isWalletNotifyEnabled()) return;
  if (!transactionId || !ObjectId.isValid(String(transactionId))) return;
  setImmediate(() => {
    void runWalletBalanceNotifyById(String(transactionId)).catch((e) =>
      console.warn('[wallet-email] notifyById failed:', e?.message || e)
    );
  });
}

async function runWalletBalanceNotifyById(transactionId) {
  const db = await getDb();
  const col = db.collection('wallet_transactions');
  const t = await col.findOne({ _id: new ObjectId(String(transactionId)) });
  if (!t || t.status !== 'completed') return;
  await runWalletBalanceNotify({ ...t, id: t._id.toString(), userId: t.userId });
}

async function runWalletBalanceNotify(tx) {
  const typ = String(tx.type || '').toLowerCase();
  let amt = Number(tx.amount);
  if (!Number.isFinite(amt)) return;
  if (typ === 'withdrawal' && amt > 0) amt = -Math.abs(amt);
  const minAbs = minAbsAmount();
  if (Math.abs(amt) < minAbs && !isCriticalWalletType(typ)) {
    return;
  }

  const { default: userRepo } = await import('../users/user.repository.js');
  const { default: walletRepo } = await import('../wallet/wallet.repository.js');

  const userId = tx.userId != null ? String(tx.userId) : '';
  if (!userId) return;

  const user = await userRepo.findById(userId);
  if (!user?.email) return;

  const currency = tx.currency || 'USD';
  const wallet = await walletRepo.getOrCreateWallet(userId, currency);
  const newBalance = Number(wallet?.balance) || 0;

  const name = user.name || user.email?.split('@')[0] || 'Trader';
  const accountNo = user.accountNo || '—';
  const ref =
    tx.reference != null
      ? String(tx.reference)
      : tx.destination != null
        ? String(tx.destination)
        : null;
  const completedAt = tx.completedAt || tx.createdAt || new Date();

  const res = await sendWalletBalanceUpdateEmail({
    to: user.email,
    fullName: name,
    accountNo,
    type: typ,
    amount: amt,
    currency,
    reference: ref,
    newBalance,
    completedAt,
  });
  if (!res?.sent) {
    console.warn('[wallet-email] balance update email not sent:', res?.error || 'unknown');
  }
}

export default { queueWalletBalanceNotify, queueWalletBalanceNotifyById };
