/**
 * Deposit service — create/confirm deposits, credit wallet, post to ledger
 */
import walletRepo from './wallet.repository.js';
import ledgerService from '../finance/ledger.service.js';

async function createDeposit(userId, currency, amount, reference) {
  if (!userId || amount == null || amount <= 0) {
    const err = new Error('Invalid deposit: userId and positive amount required');
    err.statusCode = 400;
    throw err;
  }
  const id = await walletRepo.createTransaction({
    userId,
    type: 'deposit',
    amount: Number(amount),
    currency: currency || 'USD',
    status: 'pending',
    reference: reference || null,
  });
  return { id, status: 'pending', amount: Number(amount), currency: currency || 'USD' };
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
  await walletRepo.updateBalance(userId, tx.currency || 'USD', tx.amount);
  await walletRepo.updateTransaction(depositId, {
    status: 'completed',
    completedAt: new Date(),
  });
  try {
    await ledgerService.postDeposit(userId, tx.amount, tx.currency || 'USD', depositId);
  } catch (e) {
    console.warn('[deposit] Ledger post failed:', e.message);
  }
  return { status: 'completed' };
}

async function listDeposits(userId, limit = 50) {
  return walletRepo.getTransactions(userId, { type: 'deposit', limit });
}

export default { createDeposit, confirmDeposit, listDeposits };
