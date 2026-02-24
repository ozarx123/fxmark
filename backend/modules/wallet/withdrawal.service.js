/**
 * Withdrawal service — request/process withdrawals, deduct balance, post to ledger
 */
import walletRepo from './wallet.repository.js';
import ledgerService from '../finance/ledger.service.js';

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
  return { id, status: 'pending', amount: Number(amount), currency: currency || 'USD' };
}

async function processWithdrawal(withdrawalId, userId) {
  const tx = await walletRepo.getTransactionById(withdrawalId, userId);
  if (!tx) {
    const err = new Error('Withdrawal not found');
    err.statusCode = 404;
    throw err;
  }
  if (tx.type !== 'withdrawal' || tx.status !== 'pending') {
    const err = new Error('Withdrawal already processed or invalid');
    err.statusCode = 400;
    throw err;
  }
  const wallet = await walletRepo.getOrCreateWallet(userId, tx.currency || 'USD');
  if (wallet.balance < tx.amount) {
    const err = new Error('Insufficient balance');
    err.statusCode = 400;
    throw err;
  }
  await walletRepo.updateBalance(userId, tx.currency || 'USD', -tx.amount);
  await walletRepo.updateTransaction(withdrawalId, {
    status: 'completed',
    completedAt: new Date(),
  });
  try {
    await ledgerService.postWithdrawal(userId, tx.amount, tx.currency || 'USD', withdrawalId);
  } catch (e) {
    console.warn('[withdrawal] Ledger post failed:', e.message);
  }
  return { status: 'completed' };
}

async function listWithdrawals(userId, limit = 50) {
  return walletRepo.getTransactions(userId, { type: 'withdrawal', limit });
}

export default { requestWithdrawal, processWithdrawal, listWithdrawals };
