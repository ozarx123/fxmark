/**
 * Ledger service — post journal entries, validate double-entry
 */
import ledgerRepo from './ledger.repository.js';
import { ACCOUNTS } from './chart-of-accounts.js';

/**
 * Post a journal entry (must balance: sum debits = sum credits)
 * @param {Array<{ accountCode, entityId, debit, credit, currency?, reference?, referenceType?, referenceId?, description? }>} entries
 */
async function post(entries) {
  if (!entries || entries.length < 2) {
    const err = new Error('Journal must have at least 2 entries');
    err.statusCode = 400;
    throw err;
  }
  let totalDebit = 0;
  let totalCredit = 0;
  const docs = entries.map((e) => {
    const debit = Number(e.debit) || 0;
    const credit = Number(e.credit) || 0;
    totalDebit += debit;
    totalCredit += credit;
    return {
      accountCode: e.accountCode,
      entityId: e.entityId,
      debit,
      credit,
      currency: e.currency || 'USD',
      reference: e.reference || null,
      referenceType: e.referenceType || null,
      referenceId: e.referenceId || null,
      description: e.description || null,
    };
  });
  if (Math.abs(totalDebit - totalCredit) > 0.001) {
    const err = new Error(`Journal does not balance: debits=${totalDebit} credits=${totalCredit}`);
    err.statusCode = 400;
    throw err;
  }
  const ids = await ledgerRepo.insertMany(docs);
  return { ids, entries: docs };
}

/**
 * Post deposit: Cash/Bank (debit) -> Wallet (credit)
 */
async function postDeposit(userId, amount, currency, referenceId) {
  return post([
    { accountCode: ACCOUNTS.CASH_BANK, entityId: 'system', debit: amount, credit: 0, currency, referenceType: 'deposit', referenceId },
    { accountCode: ACCOUNTS.WALLET, entityId: userId, debit: 0, credit: amount, currency, referenceType: 'deposit', referenceId },
  ]);
}

/**
 * Post internal transfer: Sender Wallet (debit) -> Recipient Wallet (credit)
 */
async function postTransfer(senderId, recipientId, amount, currency, referenceId) {
  return post([
    { accountCode: ACCOUNTS.WALLET, entityId: senderId, debit: amount, credit: 0, currency, referenceType: 'transfer', referenceId },
    { accountCode: ACCOUNTS.WALLET, entityId: recipientId, debit: 0, credit: amount, currency, referenceType: 'transfer', referenceId },
  ]);
}

/**
 * Post withdrawal: Wallet (debit) -> Cash/Bank (credit)
 */
async function postWithdrawal(userId, amount, currency, referenceId) {
  return post([
    { accountCode: ACCOUNTS.WALLET, entityId: userId, debit: amount, credit: 0, currency, referenceType: 'withdrawal', referenceId },
    { accountCode: ACCOUNTS.CASH_BANK, entityId: 'system', debit: 0, credit: amount, currency, referenceType: 'withdrawal', referenceId },
  ]);
}

/**
 * Post admin credit: Cash/Bank (debit) -> Wallet (credit)
 * Used when superadmin adds funds to a customer wallet.
 */
async function postAdminCredit(userId, amount, currency, referenceId) {
  return post([
    { accountCode: ACCOUNTS.CASH_BANK, entityId: 'system', debit: amount, credit: 0, currency, referenceType: 'admin_credit', referenceId },
    { accountCode: ACCOUNTS.WALLET, entityId: userId, debit: 0, credit: amount, currency, referenceType: 'admin_credit', referenceId },
  ]);
}

/**
 * Post trading P&L: Wallet (liability) <-> Trading P&L
 * profit: Wallet credit (increase), Trading P&L debit
 * loss: Wallet debit (decrease), Trading P&L credit
 */
async function postTradingPnl(userId, amount, currency, referenceId, isProfit = true) {
  if (isProfit) {
    return post([
      { accountCode: ACCOUNTS.WALLET, entityId: userId, debit: 0, credit: amount, currency, referenceType: 'trade', referenceId },
      { accountCode: ACCOUNTS.TRADING_PNL, entityId: userId, debit: amount, credit: 0, currency, referenceType: 'trade', referenceId },
    ]);
  }
  return post([
    { accountCode: ACCOUNTS.WALLET, entityId: userId, debit: amount, credit: 0, currency, referenceType: 'trade', referenceId },
    { accountCode: ACCOUNTS.TRADING_PNL, entityId: userId, debit: 0, credit: amount, currency, referenceType: 'trade', referenceId },
  ]);
}

/**
 * Post IB commission earned: Commission Income (credit) -> Receivables or Wallet (debit)
 */
async function postCommissionEarned(ibUserId, amount, currency, referenceId, clientUserId = null) {
  return post([
    { accountCode: ACCOUNTS.RECEIVABLES, entityId: ibUserId, debit: amount, credit: 0, currency, referenceType: 'commission', referenceId, description: clientUserId ? `Commission from ${clientUserId}` : null },
    { accountCode: ACCOUNTS.COMMISSION_INCOME, entityId: 'system', debit: 0, credit: amount, currency, referenceType: 'commission', referenceId },
  ]);
}

/**
 * Post PAMM performance fee: Manager earns fee (Wallet credit = increase, PAMM_FEES credit)
 */
async function postPammFee(managerId, amount, currency, referenceId) {
  return post([
    { accountCode: ACCOUNTS.WALLET, entityId: managerId, debit: 0, credit: amount, currency, referenceType: 'pamm_fee', referenceId },
    { accountCode: ACCOUNTS.PAMM_FEES, entityId: 'system', debit: amount, credit: 0, currency, referenceType: 'pamm_fee', referenceId },
  ]);
}

/**
 * Post PAMM allocation: Wallet debit (user pays) -> Client Funds credit (held in PAMM)
 */
async function postPammAllocation(userId, amount, currency, referenceId) {
  return post([
    { accountCode: ACCOUNTS.WALLET, entityId: userId, debit: amount, credit: 0, currency, referenceType: 'pamm_alloc', referenceId },
    { accountCode: ACCOUNTS.CLIENT_FUNDS, entityId: 'system', debit: 0, credit: amount, currency, referenceType: 'pamm_alloc', referenceId },
  ]);
}

/**
 * Post PAMM unallocation: Client Funds debit -> Wallet credit (return to user)
 */
async function postPammUnallocation(userId, amount, currency, referenceId) {
  return post([
    { accountCode: ACCOUNTS.CLIENT_FUNDS, entityId: 'system', debit: amount, credit: 0, currency, referenceType: 'pamm_unalloc', referenceId },
    { accountCode: ACCOUNTS.WALLET, entityId: userId, debit: 0, credit: amount, currency, referenceType: 'pamm_unalloc', referenceId },
  ]);
}

/**
 * Post PAMM profit distribution to investor
 * Profit: Wallet credit (increase), Client Funds debit
 * Loss: Wallet debit (decrease), Client Funds credit
 */
async function postPammDistribution(followerId, amount, currency, referenceId, isProfit = true) {
  if (isProfit) {
    return post([
      { accountCode: ACCOUNTS.CLIENT_FUNDS, entityId: 'system', debit: amount, credit: 0, currency, referenceType: 'pamm_dist', referenceId },
      { accountCode: ACCOUNTS.WALLET, entityId: followerId, debit: 0, credit: amount, currency, referenceType: 'pamm_dist', referenceId },
    ]);
  }
  return post([
    { accountCode: ACCOUNTS.WALLET, entityId: followerId, debit: amount, credit: 0, currency, referenceType: 'pamm_dist', referenceId },
    { accountCode: ACCOUNTS.CLIENT_FUNDS, entityId: 'system', debit: 0, credit: amount, currency, referenceType: 'pamm_dist', referenceId },
  ]);
}

/**
 * Post IB commission paid: Receivables (credit) -> Cash/Bank (debit)
 */
async function postCommissionPaid(ibUserId, amount, currency, referenceId) {
  return post([
    { accountCode: ACCOUNTS.COMMISSION_PAID, entityId: 'system', debit: amount, credit: 0, currency, referenceType: 'payout', referenceId },
    { accountCode: ACCOUNTS.RECEIVABLES, entityId: ibUserId, debit: 0, credit: amount, currency, referenceType: 'payout', referenceId },
  ]);
}

/** Get ledger entries for entity */
async function listEntries(entityId, options = {}) {
  return ledgerRepo.listByEntity(entityId, options);
}

/** Get account balance */
async function getBalance(entityId, accountCode, asOf = null) {
  return ledgerRepo.getBalance(entityId, accountCode, asOf);
}

/** Get all balances for entity */
async function getBalances(entityId, asOf = null) {
  return ledgerRepo.getBalancesByEntity(entityId, asOf);
}

export default {
  post,
  postDeposit,
  postWithdrawal,
  postTransfer,
  postAdminCredit,
  postTradingPnl,
  postPammFee,
  postPammAllocation,
  postPammUnallocation,
  postPammDistribution,
  postCommissionEarned,
  postCommissionPaid,
  listEntries,
  getBalance,
  getBalances,
};
