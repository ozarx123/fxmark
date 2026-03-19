/**
 * Internal transfer service — lookup recipient, verify details, execute transfer
 * All fund movement is atomic (wallet + ledger + history) via financial-transaction.service.
 */
import userRepo from '../users/user.repository.js';
import financialTransactionService from '../finance/financial-transaction.service.js';

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

async function executeInternalTransfer(senderId, recipientId, amount, currency = 'USD', idempotencyKey = null) {
  const recipient = await userRepo.findById(recipientId);
  if (!recipient) {
    const err = new Error('Recipient not found');
    err.statusCode = 404;
    throw err;
  }
  return financialTransactionService.atomicInternalTransfer(
    senderId,
    recipientId,
    amount,
    currency,
    idempotencyKey
  );
}

async function transferInternal(senderId, payload) {
  const { recipientAccountNoOrEmail, amount, currency = 'USD', verification, idempotencyKey } = payload;
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
  return executeInternalTransfer(senderId, lookup.recipientId, amount, currency, idempotencyKey || null);
}

export default { lookupRecipient, verifyDetails, executeInternalTransfer, transferInternal };
