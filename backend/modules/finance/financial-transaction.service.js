/**
 * Financial transaction service — centralized paired wallet + ledger operations.
 * All wallet balance mutations must run inside runPairedWithTransaction() or runWithPairedWalletLedgerContext() (see finance-wallet-guard.js).
 *
 * Post-commit: verifyWalletLedgerAfterMutation logs full trace on mismatch (no auto-correction).
 * Optional: FINANCE_ENSURE_WALLET_LEDGER_INDEX=1 on startup when DB has no duplicate WALLET keys.
 */
import { randomUUID } from 'crypto';
import { MongoServerError } from 'mongodb';
import { withTransaction, getDb } from '../../config/mongo.js';
import { runWithPairedWalletLedgerContext } from './finance-wallet-guard.js';
import { queueWalletBalanceNotifyById } from '../email/wallet-balance-notify.js';
import walletRepo from '../wallet/wallet.repository.js';
import ledgerService from './ledger.service.js';
import ledgerRepo from './ledger.repository.js';
import { ACCOUNTS } from './chart-of-accounts.js';
import { LEDGER_COLLECTION, WALLET_LEDGER_UNIQUE_INDEX } from './ledger.model.js';

export { runWithPairedWalletLedgerContext } from './finance-wallet-guard.js';

const ENSURE_WALLET_LEDGER_INDEX = process.env.FINANCE_ENSURE_WALLET_LEDGER_INDEX === '1';

let walletLedgerIndexAttempted = false;

/** Mongo transaction + paired guard (use for deposit, withdrawal, PAMM slices, etc.) */
export async function runPairedWithTransaction(asyncFn, meta = {}) {
  return runWithPairedWalletLedgerContext(() => withTransaction(asyncFn), meta);
}

export async function tryEnsureWalletLedgerUniqueIndexOnce() {
  if (!ENSURE_WALLET_LEDGER_INDEX || walletLedgerIndexAttempted) return { ok: true, skipped: true };
  walletLedgerIndexAttempted = true;
  const db = await getDb();
  const col = db.collection(LEDGER_COLLECTION);
  const dup = await col
    .aggregate([
      { $match: { accountCode: ACCOUNTS.WALLET } },
      {
        $group: {
          _id: {
            accountCode: '$accountCode',
            entityId: '$entityId',
            referenceType: '$referenceType',
            referenceId: '$referenceId',
          },
          c: { $sum: 1 },
        },
      },
      { $match: { c: { $gt: 1 } } },
      { $limit: 1 },
    ])
    .toArray();
  if (dup.length > 0) {
    console.error(
      '[financial-transaction] WALLET ledger duplicates exist; unique index not created. Run scripts/ensure-wallet-ledger-unique-index.js'
    );
    return { ok: false, reason: 'duplicates' };
  }
  try {
    await col.createIndex(WALLET_LEDGER_UNIQUE_INDEX.keys, WALLET_LEDGER_UNIQUE_INDEX.options);
    console.log('[financial-transaction] Created index', WALLET_LEDGER_UNIQUE_INDEX.options.name);
    return { ok: true, created: true };
  } catch (e) {
    if (e?.code === 85 || e?.codeName === 'IndexOptionsConflict') {
      return { ok: true, exists: true };
    }
    console.error('[financial-transaction] Index create failed:', e?.message || e);
    return { ok: false, error: e?.message };
  }
}

/**
 * Run a ledger mutation that affects entity WALLET, then set wallets.balance delta = ledger WALLET delta (same session).
 * Use inside runPairedWithTransaction. Handles idempotent ledger posts (delta 0).
 */
export async function syncWalletToLedgerAfterMutation(session, userId, currency, ledgerMutateFn) {
  const uid = String(userId);
  const cur = currency || 'USD';
  await walletRepo.getOrCreateWallet(uid, cur, { session });
  const before = await ledgerRepo.getBalance(uid, ACCOUNTS.WALLET, null, { session });
  await ledgerMutateFn(session);
  const after = await ledgerRepo.getBalance(uid, ACCOUNTS.WALLET, null, { session });
  const delta = after - before;
  if (Math.abs(delta) > 0.001) {
    await walletRepo.updateBalance(uid, cur, delta, { session });
  }
  return { before, after, delta };
}

export async function verifyWalletLedgerAfterMutation(userId, currency = 'USD', context = {}) {
  const uid = userId == null ? '' : String(userId);
  const cur = currency || 'USD';
  const ledgerBal = await ledgerRepo.getBalance(uid, ACCOUNTS.WALLET, null);
  const walletDoc = await walletRepo.getOrCreateWallet(uid, cur);
  const walletBal = Number(walletDoc.balance) || 0;
  const diff = Math.abs(walletBal - ledgerBal);
  if (diff < 0.01) {
    return { status: 'ok', walletBalance: walletBal, ledgerBalance: ledgerBal, context };
  }
  const trace = new Error('WALLET_LEDGER_MISMATCH_TRACE').stack;
  const payload = {
    status: 'mismatch',
    walletBalance: walletBal,
    ledgerBalance: ledgerBal,
    discrepancy: diff,
    context,
    trace,
    ts: new Date().toISOString(),
  };
  console.error('[financial-transaction] WALLET/LEDGER MISMATCH POST-MUTATION', JSON.stringify(payload, null, 2));
  return payload;
}

/**
 * Internal transfer — single Mongo transaction; ledger failure aborts (no silent catch).
 * @param {string} [idempotencyKey] - stable key for retries
 */
export async function atomicInternalTransfer(senderId, recipientId, amount, currency = 'USD', idempotencyKey = null) {
  const sender = String(senderId);
  const recipient = String(recipientId);
  if (sender === recipient) {
    const err = new Error('Cannot transfer to yourself');
    err.statusCode = 400;
    throw err;
  }
  const numAmount = Number(amount);
  if (!Number.isFinite(numAmount) || numAmount <= 0) {
    const err = new Error('Invalid amount');
    err.statusCode = 400;
    throw err;
  }
  const cur = currency || 'USD';
  const refId = idempotencyKey
    ? `xfer|${sender}|${recipient}|${String(idempotencyKey).slice(0, 200)}`
    : `xfer|${sender}|${recipient}|${randomUUID()}`;

  if (idempotencyKey) {
    const exists = await ledgerRepo.existsWalletEntryForEvent(recipient, 'transfer', refId, numAmount, 0, {});
    if (exists) {
      return {
        success: true,
        amount: numAmount,
        currency: cur,
        referenceId: refId,
        idempotentReplay: true,
      };
    }
  }

  const preCheck = await walletRepo.getOrCreateWallet(sender, cur);
  if ((preCheck.balance || 0) < numAmount) {
    const err = new Error('Insufficient balance');
    err.statusCode = 400;
    throw err;
  }

  const now = new Date();
  let senderTxId;
  let recipientTxId;
  await runWithPairedWalletLedgerContext(async () => {
    await withTransaction(async (session) => {
      const debited = await walletRepo.debitBalanceIfSufficient(sender, cur, numAmount, { session });
      if (!debited) {
        const err = new Error('Insufficient balance');
        err.statusCode = 400;
        throw err;
      }
      await walletRepo.updateBalance(recipient, cur, numAmount, { session });
      await ledgerService.postTransfer(sender, recipient, numAmount, cur, refId, { session });
      senderTxId = await walletRepo.createTransaction(
        {
          userId: sender,
          type: 'transfer_out',
          amount: -numAmount,
          currency: cur,
          status: 'completed',
          destination: recipient,
          reference: refId,
          completedAt: now,
        },
        { session }
      );
      recipientTxId = await walletRepo.createTransaction(
        {
          userId: recipient,
          type: 'transfer_in',
          amount: numAmount,
          currency: cur,
          status: 'completed',
          reference: sender,
          destination: refId,
          completedAt: now,
        },
        { session }
      );
    });
    await verifyWalletLedgerAfterMutation(sender, cur, { flow: 'internal_transfer', refId });
    await verifyWalletLedgerAfterMutation(recipient, cur, { flow: 'internal_transfer', refId });
    if (senderTxId) queueWalletBalanceNotifyById(senderTxId);
    if (recipientTxId) queueWalletBalanceNotifyById(recipientTxId);
  }, { label: 'atomicInternalTransfer' });

  return { success: true, amount: numAmount, currency: cur, referenceId: refId };
}

/**
 * Bulk import opening balance inside an existing transaction session (caller must hold paired guard).
 * Credits wallet by the net change to ledger WALLET balance in this session (handles idempotent ledger post).
 */
export async function atomicImportOpeningBalanceInSession(session, userId, amount, currency, referenceId) {
  const uid = String(userId);
  const amt = Number(amount) || 0;
  if (amt < 0.001) return { skipped: true };
  const cur = currency || 'USD';
  const ref = String(referenceId);
  await walletRepo.getOrCreateWallet(uid, cur, { session });
  const beforeLedger = await ledgerRepo.getBalance(uid, ACCOUNTS.WALLET, null, { session });
  await ledgerService.postImportOpeningBalance(uid, amt, cur, ref, { session });
  const afterLedger = await ledgerRepo.getBalance(uid, ACCOUNTS.WALLET, null, { session });
  const delta = afterLedger - beforeLedger;
  if (Math.abs(delta) > 0.001) {
    await walletRepo.updateBalance(uid, cur, delta, { session });
  }
  await walletRepo.createTransaction(
    {
      userId: uid,
      type: 'import_opening_balance',
      amount: amt,
      currency: cur,
      status: 'completed',
      reference: ref,
      completedAt: new Date(),
    },
    { session }
  );
  return { success: true, amount: amt, referenceId: ref, ledgerDelta: delta };
}

/** PAMM IB commission credit: ledger + wallet + tx in one transaction. */
export async function atomicPammIbCommissionCredit(ibUserId, amount, stableRef, description) {
  const ibStr = String(ibUserId);
  const amt = Number(amount) || 0;
  if (amt < 0.001) return { skipped: true };
  let ibCommTxId;
  await runPairedWithTransaction(
    async (session) => {
      const { delta } = await syncWalletToLedgerAfterMutation(session, ibStr, 'USD', async (s) => {
        await ledgerService.postPammIbCommissionToWallet(ibStr, amt, 'USD', stableRef, description, { session: s });
      });
      if (Math.abs(delta) < 0.001 && amt >= 0.001) {
        await walletRepo.updateBalance(ibStr, 'USD', amt, { session });
      }
      try {
        ibCommTxId = await walletRepo.createTransaction(
          {
            userId: ibStr,
            type: 'ib_pamm_commission',
            amount: amt,
            currency: 'USD',
            status: 'completed',
            reference: stableRef,
            completedAt: new Date(),
          },
          { session }
        );
      } catch (e) {
        if (e instanceof MongoServerError && e.code === 11000) return;
        throw e;
      }
    },
    { label: 'pamm_ib_commission' }
  );
  await verifyWalletLedgerAfterMutation(ibStr, 'USD', { flow: 'pamm_ib_commission', stableRef });
  if (ibCommTxId) queueWalletBalanceNotifyById(ibCommTxId);
  return { success: true, amount: amt, referenceId: stableRef };
}

export default {
  atomicInternalTransfer,
  atomicImportOpeningBalanceInSession,
  atomicPammIbCommissionCredit,
  syncWalletToLedgerAfterMutation,
  runPairedWithTransaction,
  runWithPairedWalletLedgerContext,
  verifyWalletLedgerAfterMutation,
  tryEnsureWalletLedgerUniqueIndexOnce,
};
