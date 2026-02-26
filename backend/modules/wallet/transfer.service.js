/**
 * Internal transfer service — lookup recipient, verify details, execute transfer
 */
import userRepo from '../users/user.repository.js';
import walletRepo from './wallet.repository.js';
import ledgerService from '../finance/ledger.service.js';

async function lookupRecipient(accountNoOrEmail) {
  const input = (accountNoOrEmail || '').trim();
  if (!input) return null;
  const byEmail = input.includes('@')
    ? await userRepo.findByEmail(input)
    : null;
  const byAccountNo = !byEmail
    ? await userRepo.findByAccountNo(input)
    : null;
  const user = byEmail || byAccountNo;
  if (!user) return null;
  const withAccountNo = await userRepo.ensureAccountNo(user.id);
  return {
    exists: true,
    accountNo: withAccountNo.accountNo,
    recipientId: withAccountNo.id,
    recipient: withAccountNo,
  };
}

function normalizeForMatch(str) {
  return (str || '').trim().toLowerCase();
}

function verifyDetails(recipient, verification) {
  if (!recipient || !verification) return false;
  const accountMatch = normalizeForMatch(recipient.accountNo) === normalizeForMatch(verification.accountNo);
  const emailMatch = normalizeForMatch(recipient.email) === normalizeForMatch(verification.email);
  const nameMatch = normalizeForMatch(recipient.name) === normalizeForMatch(verification.name);
  return accountMatch && emailMatch && nameMatch;
}

async function executeInternalTransfer(senderId, recipientId, amount, currency = 'USD') {
  if (senderId === recipientId) {
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
  const senderWallet = await walletRepo.getOrCreateWallet(senderId, currency);
  if ((senderWallet.balance || 0) < numAmount) {
    const err = new Error('Insufficient balance');
    err.statusCode = 400;
    throw err;
  }
  const recipient = await userRepo.findById(recipientId);
  if (!recipient) {
    const err = new Error('Recipient not found');
    err.statusCode = 404;
    throw err;
  }
  await walletRepo.updateBalance(senderId, currency, -numAmount);
  await walletRepo.updateBalance(recipientId, currency, numAmount);
  const now = new Date();
  const transferRefId = `transfer-${senderId}-${recipientId}-${Date.now()}`;
  try {
    await ledgerService.postTransfer(senderId, recipientId, numAmount, currency, transferRefId);
  } catch (e) {
    console.warn('[transfer] Ledger post failed:', e.message);
  }
  await walletRepo.createTransaction({
    userId: senderId,
    type: 'transfer_out',
    amount: -numAmount,
    currency,
    status: 'completed',
    destination: recipientId,
    completedAt: now,
  });
  await walletRepo.createTransaction({
    userId: recipientId,
    type: 'transfer_in',
    amount: numAmount,
    currency,
    status: 'completed',
    reference: senderId,
    completedAt: now,
  });
  return { success: true, amount: numAmount, currency };
}

async function transferInternal(senderId, payload) {
  const { recipientAccountNoOrEmail, amount, currency = 'USD', verification } = payload;
  if (!verification?.accountNo || !verification?.email || !verification?.name) {
    const err = new Error('Verification required: account no, email, and name must be provided');
    err.statusCode = 400;
    throw err;
  }
  const lookup = await lookupRecipient(recipientAccountNoOrEmail);
  if (!lookup?.exists) {
    const err = new Error('Recipient not found');
    err.statusCode = 404;
    throw err;
  }
  const verified = verifyDetails(lookup.recipient, verification);
  if (!verified) {
    const err = new Error('Verification failed: account no, email, and name do not match the recipient');
    err.statusCode = 400;
    throw err;
  }
  return executeInternalTransfer(senderId, lookup.recipientId, amount, currency);
}

export default { lookupRecipient, verifyDetails, executeInternalTransfer, transferInternal };
