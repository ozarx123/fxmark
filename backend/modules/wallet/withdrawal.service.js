/**
 * Withdrawal service — request/process withdrawals, deduct balance, post to ledger
 */
import { MongoServerError } from 'mongodb';
import walletRepo from './wallet.repository.js';
import ledgerService from '../finance/ledger.service.js';
import financialTransactionService from '../finance/financial-transaction.service.js';
import fraudDetection from './fraudDetection.service.js';
import alertService from '../admin/alert.service.js';
import withdrawalApprovalSettingsRepo from './withdrawal-approval.settings.repository.js';
import { queueWalletBalanceNotifyById } from '../email/wallet-balance-notify.js';

class IdempotentReplaySignal extends Error {
  constructor(replayDoc) {
    super('idempotent_replay');
    this.name = 'IdempotentReplaySignal';
    this.replayDoc = replayDoc;
  }
}

function normalizeProcessIdempotencyKey(clientKey, withdrawalId) {
  const fallback = String(withdrawalId || '').trim();
  const raw = clientKey != null && String(clientKey).trim() !== '' ? String(clientKey).trim() : fallback;
  const k = raw.slice(0, 128);
  return k || fallback;
}

function withdrawalProcessSuccessBody(doc, idempotentReplay) {
  const id = doc.id || doc._id?.toString?.();
  const body = {
    status: 'completed',
    withdrawalId: id,
    amount: Number(doc.amount),
    currency: doc.currency || 'USD',
    reference: doc.reference != null ? String(doc.reference) : id,
    completedAt: doc.completedAt || null,
  };
  if (idempotentReplay) body.idempotentReplay = true;
  return body;
}

async function requestWithdrawal(userId, currency, amount, destination) {
  if (!userId || amount == null || amount <= 0) {
    const err = new Error('Invalid withdrawal: userId and positive amount required');
    err.statusCode = 400;
    throw err;
  }
  const wallet = await walletRepo.getOrCreateWallet(userId, currency || 'USD');
  if (wallet.balance < amount) {
    const err = new Error('Insufficient balance');
    err.statusCode = 400;
    throw err;
  }
  const id = await walletRepo.createTransaction({
    userId,
    type: 'withdrawal',
    amount: Number(amount),
    currency: currency || 'USD',
    status: 'pending',
    destination: destination || null,
  });
  const settings = await withdrawalApprovalSettingsRepo.getWithdrawalApprovalSettings();
  const amt = Number(amount);
  let initialStatus = 'review';
  if (settings.autoApproveSmallWithdrawals && amt <= (settings.autoApproveThresholdUsd || 0)) {
    initialStatus = 'approved';
  }
  if (initialStatus !== 'pending') {
    await walletRepo.updateTransaction(id, { status: initialStatus });
  }
  return {
    id,
    status: initialStatus,
    amount: amt,
    currency: currency || 'USD',
    message: initialStatus === 'approved' ? undefined : 'Withdrawal requires review or approval before processing.',
  };
}

async function processWithdrawal(withdrawalId, userId, clientIdempotencyKey, options = {}) {
  const bypassFraudChecks = options.bypassFraudChecks === true;
  const allowCryptoRailCompletion = options.allowCryptoRailCompletion === true;
  const idemKey = normalizeProcessIdempotencyKey(clientIdempotencyKey, withdrawalId);

  const tx = await walletRepo.getTransactionById(withdrawalId, userId);
  if (!tx) {
    const err = new Error('Withdrawal not found');
    err.statusCode = 404;
    throw err;
  }
  if (tx.type !== 'withdrawal') {
    const err = new Error('Withdrawal already processed or invalid');
    err.statusCode = 400;
    throw err;
  }

  const dest = String(tx.destination || '').trim();
  const isBep20 = /^0x[a-fA-F0-9]{40}$/.test(dest);
  if (isBep20 && !allowCryptoRailCompletion) {
    const err = new Error(
      'Crypto withdrawals to a wallet address are completed by an administrator after approval. You cannot finalize this request from the app.'
    );
    err.statusCode = 400;
    err.code = 'CRYPTO_WITHDRAWAL_ADMIN_ONLY';
    throw err;
  }

  if (tx.status === 'completed') {
    return withdrawalProcessSuccessBody(tx, true);
  }

  if (tx.status !== 'approved' && tx.status !== 'completed') {
    const err = new Error(
      tx.status === 'review' || tx.status === 'pending'
        ? 'Withdrawal must be approved before processing. Use admin to approve.'
        : 'Withdrawal already processed or invalid'
    );
    err.statusCode = 400;
    err.code = tx.status === 'rejected' ? 'WITHDRAWAL_REJECTED' : 'WITHDRAWAL_NOT_APPROVED';
    throw err;
  }

  const amount = Number(tx.amount) || 0;
  const currency = tx.currency || 'USD';
  if (amount <= 0) {
    const err = new Error('Withdrawal already processed or invalid');
    err.statusCode = 400;
    throw err;
  }

  if (await ledgerService.hasWithdrawalLedgerEntry(userId, withdrawalId, amount, {})) {
    console.log(
      `[withdrawal] idempotent success (ledger already exists) withdrawalId=${withdrawalId} userId=${userId}`
    );
    const fresh = await walletRepo.getTransactionById(withdrawalId, userId);
    if (fresh?.status === 'completed') {
      queueWalletBalanceNotifyById(withdrawalId);
    }
    return withdrawalProcessSuccessBody(fresh || tx, true);
  }

  const priorByKey = await walletRepo.findCompletedWithdrawalByProcessIdempotencyKey(userId, idemKey);
  if (priorByKey) {
    return withdrawalProcessSuccessBody(priorByKey, true);
  }

  let fraudMeta = {
    fraudRiskScore: 0,
    fraudRiskFlags: [],
    fraudCheckedAt: new Date(),
  };

  if (!bypassFraudChecks) {
    const fraud = await fraudDetection.evaluateWithdrawal(userId, amount, { withdrawalId });
    const band = fraudDetection.getRiskBand(fraud.riskScore);
    fraudMeta = {
      fraudRiskScore: fraud.riskScore,
      fraudRiskFlags: fraud.flags,
      fraudCheckedAt: new Date(),
    };

    if (band === 'HIGH') {
      await walletRepo.updateTransaction(withdrawalId, { ...fraudMeta, status: 'rejected' });
      console.warn(
        `[fraud] blocked withdrawalId=${withdrawalId} userId=${userId} score=${fraud.riskScore} flags=${(fraud.flags || []).join(',')}`
      );
      alertService
        .createAlert({
          type: alertService.ALERT_TYPES.FRAUD_HIGH,
          referenceId: withdrawalId,
          userId,
          message: 'High-risk withdrawal blocked',
          metadata: { withdrawalId, amount, currency, riskScore: fraud.riskScore, flags: fraud.flags },
        })
        .catch((e) => console.warn('[alert] create failed', e?.message));
      const err = new Error('Suspicious activity detected');
      err.statusCode = 403;
      err.code = 'FRAUD_BLOCKED';
      throw err;
    }

    if (band === 'MEDIUM') {
      await walletRepo.updateTransaction(withdrawalId, { ...fraudMeta, status: 'review' });
      console.log(
        `[withdrawal] sent to review withdrawalId=${withdrawalId} userId=${userId} score=${fraud.riskScore}`
      );
      return {
        status: 'review',
        withdrawalId,
        amount,
        currency,
        message: 'Withdrawal requires manual review',
        fraudRiskScore: fraud.riskScore,
        fraudRiskFlags: fraud.flags,
      };
    }
  } else {
    fraudMeta = {
      fraudRiskScore: 0,
      fraudRiskFlags: ['admin_nowpayments_payout'],
      fraudCheckedAt: new Date(),
    };
  }

  try {
    await financialTransactionService.runPairedWithTransaction(async (session) => {
      const claimed = await walletRepo.claimPendingWithdrawal(
        withdrawalId,
        userId,
        {
          status: 'completed',
          completedAt: new Date(),
          reference: withdrawalId,
          processIdempotencyKey: idemKey,
          ...fraudMeta,
        },
        { session }
      );
      if (!claimed) {
        const again = await walletRepo.getTransactionById(withdrawalId, userId);
        if (again?.status === 'completed') {
          throw new IdempotentReplaySignal(again);
        }
        const err = new Error('Withdrawal already processed or invalid');
        err.statusCode = 400;
        throw err;
      }
      const debited = await walletRepo.debitBalanceIfSufficient(userId, currency, amount, { session });
      if (!debited) {
        const err = new Error('Insufficient balance');
        err.statusCode = 400;
        throw err;
      }
      await ledgerService.createDoubleEntryLedger({
        userId,
        amount,
        currency,
        referenceId: withdrawalId,
        sourceType: 'withdrawal',
        session,
      });
    }, { label: 'withdrawal_process' });
  } catch (e) {
    if (e instanceof IdempotentReplaySignal && e.replayDoc) {
      return withdrawalProcessSuccessBody(e.replayDoc, true);
    }
    if (e instanceof MongoServerError && e.code === 11000) {
      const byKey = await walletRepo.findCompletedWithdrawalByProcessIdempotencyKey(userId, idemKey);
      if (byKey) {
        return withdrawalProcessSuccessBody(byKey, true);
      }
    }
    throw e;
  }

  const done = await walletRepo.getTransactionById(withdrawalId, userId);
  if (done?.status === 'completed') {
    console.log(
      `[withdrawal] processed withdrawalId=${withdrawalId} userId=${userId} amount=${amount} ${currency}`
    );
    await financialTransactionService.verifyWalletLedgerAfterMutation(userId, currency, {
      flow: 'withdrawal_process',
      withdrawalId,
    });
    queueWalletBalanceNotifyById(withdrawalId);
    return withdrawalProcessSuccessBody(done, false);
  }
  const err = new Error('Withdrawal processing failed');
  err.statusCode = 500;
  throw err;
}

async function listWithdrawals(userId, limit = 50) {
  return walletRepo.getTransactions(userId, { type: 'withdrawal', limit });
}

export default { requestWithdrawal, processWithdrawal, listWithdrawals };
