/**
 * Deposit service — create/confirm deposits, credit wallet, post to ledger
 * Payment methods and limits from payment settings (PSP); deposit always credits LIVE wallet.
 */
import { withTransaction } from '../../config/mongo.js';
import walletRepo from './wallet.repository.js';
import ledgerService from '../finance/ledger.service.js';
import paymentSettingsRepo from './payment.settings.repository.js';

async function createDeposit(userId, currency, amount, reference, paymentMethod = null) {
  if (!userId || amount == null || amount <= 0) {
    const err = new Error('Invalid deposit: userId and positive amount required');
    err.statusCode = 400;
    throw err;
  }
  const settings = await paymentSettingsRepo.getPaymentSettings();
  const amt = Number(amount);
  const curr = currency || 'USD';

  if (!settings.pspEnabled) {
    const err = new Error('Payments are currently unavailable. Please try again later.');
    err.statusCode = 503;
    throw err;
  }
  if (amt < (settings.minDeposit ?? 0)) {
    const err = new Error(`Minimum deposit is ${settings.minDeposit}`);
    err.statusCode = 400;
    throw err;
  }
  if (amt > (settings.maxDeposit ?? 0)) {
    const err = new Error(`Maximum deposit is ${settings.maxDeposit}`);
    err.statusCode = 400;
    throw err;
  }

  const methodId = (paymentMethod || '').trim() || 'card';
  const methodConfig = settings.methods?.[methodId];
  if (methodConfig) {
    if (!methodConfig.enabled) {
      const err = new Error('Selected payment method is not available');
      err.statusCode = 400;
      throw err;
    }
    if (amt < (methodConfig.minAmount ?? 0)) {
      const err = new Error(`Minimum amount for this method is ${methodConfig.minAmount}`);
      err.statusCode = 400;
      throw err;
    }
    if (amt > (methodConfig.maxAmount ?? 0)) {
      const err = new Error(`Maximum amount for this method is ${methodConfig.maxAmount}`);
      err.statusCode = 400;
      throw err;
    }
  }

  const id = await walletRepo.createTransaction({
    userId,
    type: 'deposit',
    amount: amt,
    currency: curr,
    status: 'pending',
    reference: reference || null,
    payment_method: methodId,
  });
  return {
    id,
    transaction_id: id,
    status: 'pending',
    amount: amt,
    currency: curr,
    payment_method: methodId,
  };
}

async function confirmDeposit(depositId, userId) {
  const tx = await walletRepo.getTransactionById(depositId, userId);
  if (!tx) {
    const err = new Error('Deposit not found');
    err.statusCode = 404;
    throw err;
  }
  if (tx.type !== 'deposit' || tx.status !== 'pending') {
    const err = new Error('Deposit already processed or invalid');
    err.statusCode = 400;
    throw err;
  }
  await withTransaction(async (session) => {
    await walletRepo.updateBalance(userId, tx.currency || 'USD', tx.amount, { session });
    await walletRepo.updateTransaction(depositId, {
      status: 'completed',
      completedAt: new Date(),
      reference: depositId,
    }, { session });
    await ledgerService.postDeposit(userId, tx.amount, tx.currency || 'USD', depositId, { session });
  });
  return { status: 'completed' };
}

async function listDeposits(userId, limit = 50) {
  const list = await walletRepo.getTransactions(userId, { type: 'deposit', limit });
  return list.map((t) => ({
    ...t,
    transaction_id: t.id,
    payment_method: t.payment_method || null,
  }));
}

/** Available payment methods for client (only when PSP enabled, only enabled methods) */
async function getAvailablePaymentMethods() {
  const settings = await paymentSettingsRepo.getPaymentSettings();
  if (!settings.pspEnabled) {
    return { pspEnabled: false, methods: [] };
  }
  const methods = [];
  const methodIds = paymentSettingsRepo.SUPPORTED_METHOD_IDS;
  const labels = paymentSettingsRepo.METHOD_LABELS;
  for (const id of methodIds) {
    const config = settings.methods?.[id];
    if (config && config.enabled) {
      methods.push({
        id,
        label: labels[id] || id,
        minAmount: config.minAmount ?? settings.minDeposit ?? 20,
        maxAmount: config.maxAmount ?? settings.maxDeposit ?? 100000,
      });
    }
  }
  return {
    pspEnabled: true,
    minDeposit: settings.minDeposit ?? 20,
    maxDeposit: settings.maxDeposit ?? 100000,
    methods,
  };
}

export default { createDeposit, confirmDeposit, listDeposits, getAvailablePaymentMethods };
