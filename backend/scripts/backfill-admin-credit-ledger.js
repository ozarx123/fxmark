/**
 * Backfill missing ledger entries and fix Wallet vs Ledger reconciliation.
 * 1. Posts ledger entries for admin_credit transactions that weren't posted
 * 2. For users with wallet > ledger, posts reconciliation adjustment for the difference
 *
 * Run from backend: node scripts/backfill-admin-credit-ledger.js
 * Optional: node scripts/backfill-admin-credit-ledger.js <email|userId|name>  (fix specific user only)
 */
import 'dotenv/config';
import { getDb } from '../config/mongo.js';
import ledgerService from '../modules/finance/ledger.service.js';
import { ACCOUNTS } from '../modules/finance/chart-of-accounts.js';
import { ObjectId } from 'mongodb';

const TRANSACTIONS_COLLECTION = 'wallet_transactions';
const LEDGER_COLLECTION = 'ledger_entries';
const WALLETS_COLLECTION = 'wallets';

function normUserId(userId) {
  return userId == null ? '' : String(userId);
}

async function run() {
  const db = await getDb();
  const txCol = db.collection(TRANSACTIONS_COLLECTION);
  const ledgerCol = db.collection(LEDGER_COLLECTION);

  // --- Step 1: Backfill admin_credit ---
  const adminCredits = await txCol.find({ type: 'admin_credit' }).toArray();
  console.log(`[1/2] Found ${adminCredits.length} admin_credit transactions`);

  let posted = 0;
  let skipped = 0;

  for (const tx of adminCredits) {
    const txId = tx._id.toString();
    const existing = await ledgerCol.findOne({
      referenceType: 'admin_credit',
      referenceId: txId,
    });
    if (existing) {
      skipped++;
      continue;
    }

    const userId = tx.userId != null ? String(tx.userId) : null;
    if (!userId) {
      console.warn(`  Skip tx ${txId}: missing userId`);
      skipped++;
      continue;
    }
    const amount = Number(tx.amount) || 0;
    const currency = tx.currency || 'USD';
    if (amount <= 0) {
      console.warn(`  Skip tx ${txId}: invalid amount ${amount}`);
      skipped++;
      continue;
    }

    try {
      await ledgerService.postAdminCredit(userId, amount, currency, txId);
      console.log(`  Posted: userId=${userId} amount=${amount} ${currency} txId=${txId}`);
      posted++;
    } catch (e) {
      console.error(`  Failed tx ${txId}:`, e.message);
    }
  }

  console.log(`  Admin credit backfill: Posted=${posted}, Skipped=${skipped}\n`);

  // --- Step 2: Reconciliation adjustment for remaining mismatches ---
  console.log('[2/2] Checking for remaining wallet vs ledger mismatches...');

  const walletsCol = db.collection(WALLETS_COLLECTION);
  const usersCol = db.collection('users');
  let walletFilter = { balance: { $gt: 0 } };

  const targetArg = process.argv[2];
  if (targetArg) {
    const target = targetArg.trim();
    let targetUserId = null;
    if (ObjectId.isValid(target) && target.length === 24) {
      targetUserId = target;
    } else {
      const esc = target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const user = await usersCol.findOne({
        $or: [
          { email: new RegExp(esc, 'i') },
          { name: new RegExp(esc, 'i') },
        ],
      });
      targetUserId = user?._id?.toString();
    }
    if (targetUserId) {
      walletFilter = { userId: targetUserId, balance: { $gt: 0 } };
      console.log(`  Targeting user: ${targetArg} (userId=${targetUserId})\n`);
    } else {
      console.warn(`  User not found for "${targetArg}". Running for all users.\n`);
    }
  }

  const wallets = await walletsCol.find(walletFilter).toArray();
  let adjusted = 0;

  for (const w of wallets) {
    const userId = normUserId(w.userId);
    const currency = w.currency || 'USD';
    const walletBal = Number(w.balance) || 0;
    if (walletBal <= 0) continue;

    const ledgerBal = await ledgerRepoGetBalance(db, userId, ACCOUNTS.WALLET);
    const diff = walletBal - ledgerBal;
    if (diff < 0.01) continue;

    const refId = `recon-adj-${userId}-${Date.now()}`;
    try {
      await ledgerService.postAdminCredit(userId, diff, currency, refId);
      console.log(`  Adjusted: userId=${userId} amount=${diff.toFixed(2)} ${currency} (wallet=${walletBal}, ledger was=${ledgerBal})`);
      adjusted++;
    } catch (e) {
      console.error(`  Failed adjustment for ${userId}:`, e.message);
    }
  }

  console.log(`\nDone. Admin credits posted: ${posted}. Reconciliation adjustments: ${adjusted}`);
}

/** Get ledger balance for WALLET account (handles 1100 and 2110) */
async function ledgerRepoGetBalance(db, entityId, accountCode) {
  const c = db.collection(LEDGER_COLLECTION);
  const uid = normUserId(entityId);
  const r = await c.aggregate([
    { $match: { entityId: uid, accountCode: { $in: [accountCode, '1100'] } } },
    { $group: { _id: null, debit: { $sum: '$debit' }, credit: { $sum: '$credit' } } },
  ]).next();
  if (!r) return 0;
  const first = accountCode[0];
  if (first === '1' || first === '5') return (r.debit || 0) - (r.credit || 0);
  return (r.credit || 0) - (r.debit || 0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
