/**
 * Ledger service — post journal entries, validate double-entry
 */
import ledgerRepo from './ledger.repository.js';
import { ACCOUNTS, SYSTEM_ACCOUNT_ID } from './chart-of-accounts.js';

const WALLET_ACCOUNT = ACCOUNTS.WALLET;

function logLedgerIdempotencySkip(referenceType, referenceId, entityId, credit, debit, accountCode = WALLET_ACCOUNT) {
  const amount = (credit || 0) - (debit || 0);
  console.warn(
    '[ledger-idempotency] duplicate prevented',
    { referenceType, referenceId, entityId, amount, accountCode }
  );
}

/**
 * Post a journal entry (must balance: sum debits = sum credits).
 * @param {Array<{ accountCode, entityId, debit, credit, currency?, reference?, referenceType?, referenceId?, description?, pammFundId? }>} entries
 * @param {{ session?: import('mongodb').ClientSession }} [options]
 */
async function post(entries, options = {}) {
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
    const doc = {
      accountCode: e.accountCode,
      entityId: e.entityId != null ? String(e.entityId) : '',
      debit,
      credit,
      currency: e.currency || 'USD',
      reference: e.reference || null,
      referenceType: e.referenceType || null,
      referenceId: e.referenceId != null ? String(e.referenceId) : null,
      description: e.description || null,
    };
    if (e.pammFundId != null) doc.pammFundId = String(e.pammFundId);
    if (e.sourceType != null) doc.sourceType = String(e.sourceType);
    if (e.userId != null) doc.userId = String(e.userId);
    if (e.journalLeg != null) doc.journalLeg = String(e.journalLeg);
    return doc;
  });
  if (Math.abs(totalDebit - totalCredit) > 0.001) {
    const err = new Error(`Journal does not balance: debits=${totalDebit} credits=${totalCredit}`);
    err.statusCode = 400;
    throw err;
  }
  const ids = await ledgerRepo.insertMany(docs, options);
  return { ids, entries: docs };
}

/**
 * Post deposit: Cash/Bank (debit) -> Wallet (credit). Idempotent by referenceId.
 */
async function postDeposit(userId, amount, currency, referenceId, options = {}) {
  const amt = Number(amount) || 0;
  if (amt < 0.001) return { ids: [], entries: [] };
  const exists = await ledgerRepo.existsWalletEntryForEvent(userId, 'deposit', referenceId, amt, 0, options);
  if (exists) {
    logLedgerIdempotencySkip('deposit', referenceId, userId, amt, 0);
    return { ids: [], entries: [] };
  }
  return post([
    { accountCode: ACCOUNTS.CASH_BANK, entityId: SYSTEM_ACCOUNT_ID, debit: amt, credit: 0, currency, referenceType: 'deposit', referenceId },
    { accountCode: ACCOUNTS.WALLET, entityId: userId, debit: 0, credit: amt, currency, referenceType: 'deposit', referenceId },
  ], options);
}

/**
 * Post internal transfer: Sender Wallet (debit) -> Recipient Wallet (credit). Idempotent by referenceId.
 */
async function postTransfer(senderId, recipientId, amount, currency, referenceId, options = {}) {
  const amt = Number(amount) || 0;
  if (amt < 0.001) return { ids: [], entries: [] };
  const exists = await ledgerRepo.existsWalletEntryForEvent(recipientId, 'transfer', referenceId, amt, 0, options);
  if (exists) {
    logLedgerIdempotencySkip('transfer', referenceId, recipientId, amt, 0);
    return { ids: [], entries: [] };
  }
  return post([
    { accountCode: ACCOUNTS.WALLET, entityId: senderId, debit: amt, credit: 0, currency, referenceType: 'transfer', referenceId },
    { accountCode: ACCOUNTS.WALLET, entityId: recipientId, debit: 0, credit: amt, currency, referenceType: 'transfer', referenceId },
  ], options);
}

/**
 * Bank-grade double-entry for withdrawal (same session as wallet debit). Append-only.
 * Wallet liability debit + settlement (cash/bank) credit; idempotent by referenceId on wallet leg.
 */
async function createDoubleEntryLedger({ userId, amount, currency, referenceId, sourceType, session }) {
  await ledgerRepo.ensureLedgerReferenceIdIndex();
  if (sourceType !== 'withdrawal') {
    const err = new Error('createDoubleEntryLedger: unsupported sourceType');
    err.statusCode = 400;
    throw err;
  }
  const amt = Number(amount) || 0;
  if (amt < 0.001) return { ids: [], entries: [], skipped: true };
  const opts = session ? { session } : {};
  const exists = await ledgerRepo.existsWalletEntryForEvent(userId, 'withdrawal', referenceId, 0, amt, opts);
  if (exists) {
    logLedgerIdempotencySkip('withdrawal', referenceId, userId, 0, amt);
    return { ids: [], entries: [], skipped: true };
  }
  const uid = String(userId);
  const ref = String(referenceId);
  return post(
    [
      {
        accountCode: ACCOUNTS.WALLET,
        entityId: uid,
        debit: amt,
        credit: 0,
        currency,
        referenceType: 'withdrawal',
        referenceId: ref,
        sourceType: 'withdrawal',
        userId: uid,
        journalLeg: 'wallet_debit',
      },
      {
        accountCode: ACCOUNTS.CASH_BANK,
        entityId: SYSTEM_ACCOUNT_ID,
        debit: 0,
        credit: amt,
        currency,
        referenceType: 'withdrawal',
        referenceId: ref,
        sourceType: 'withdrawal',
        userId: uid,
        journalLeg: 'settlement_credit',
      },
    ],
    opts
  );
}

/**
 * True if a withdrawal ledger entry already exists for (userId, referenceId, sourceType=withdrawal).
 * Used to treat "ledger exists = transaction already completed" — do not debit again.
 */
async function hasWithdrawalLedgerEntry(userId, referenceId, amount, options = {}) {
  const amt = Number(amount) || 0;
  if (amt < 0.001) return false;
  return ledgerRepo.existsWalletEntryForEvent(userId, 'withdrawal', referenceId, 0, amt, options);
}

/**
 * Post withdrawal: Wallet (debit) -> Cash/Bank (credit). Idempotent by referenceId.
 * Prefer createDoubleEntryLedger from withdrawal processing for explicit journal metadata.
 */
async function postWithdrawal(userId, amount, currency, referenceId, options = {}) {
  return createDoubleEntryLedger({
    userId,
    amount,
    currency,
    referenceId,
    sourceType: 'withdrawal',
    session: options.session,
  });
}

/**
 * Post admin credit: Cash/Bank (debit) -> Wallet (credit). Idempotent by referenceId.
 * Used when superadmin adds funds to a customer wallet.
 */
async function postAdminCredit(userId, amount, currency, referenceId, options = {}) {
  const amt = Number(amount) || 0;
  if (amt < 0.001) return { ids: [], entries: [] };
  const exists = await ledgerRepo.existsWalletEntryForEvent(userId, 'admin_credit', referenceId, amt, 0, options);
  if (exists) {
    logLedgerIdempotencySkip('admin_credit', referenceId, userId, amt, 0);
    return { ids: [], entries: [] };
  }
  return post([
    { accountCode: ACCOUNTS.CASH_BANK, entityId: SYSTEM_ACCOUNT_ID, debit: amt, credit: 0, currency, referenceType: 'admin_credit', referenceId },
    { accountCode: ACCOUNTS.WALLET, entityId: String(userId), debit: 0, credit: amt, currency, referenceType: 'admin_credit', referenceId },
  ], options);
}

/**
 * Post bulk import opening balance: Cash/Bank (debit) -> Wallet (credit).
 * referenceType: import_opening_balance. Idempotent per (userId, referenceId, amount).
 */
async function postImportOpeningBalance(userId, amount, currency, referenceId, options = {}) {
  const amt = Number(amount) || 0;
  if (amt < 0.001) return { ids: [], entries: [] };
  const exists = await ledgerRepo.existsWalletEntryForEvent(userId, 'import_opening_balance', referenceId, amt, 0, options);
  if (exists) {
    logLedgerIdempotencySkip('import_opening_balance', referenceId, userId, amt, 0);
    return { ids: [], entries: [] };
  }
  return post(
    [
      {
        accountCode: ACCOUNTS.CASH_BANK,
        entityId: SYSTEM_ACCOUNT_ID,
        debit: amt,
        credit: 0,
        currency,
        referenceType: 'import_opening_balance',
        referenceId,
      },
      {
        accountCode: ACCOUNTS.WALLET,
        entityId: userId,
        debit: 0,
        credit: amt,
        currency,
        referenceType: 'import_opening_balance',
        referenceId,
      },
    ],
    options
  );
}

/**
 * Post trading P&L: Wallet (liability) <-> Trading P&L. Idempotent by referenceId.
 * profit: Wallet credit (increase), Trading P&L debit
 * loss: Wallet debit (decrease), Trading P&L credit
 */
async function postTradingPnl(userId, amount, currency, referenceId, isProfit = true, options = {}) {
  const amt = Number(amount) || 0;
  if (amt < 0.001) return { ids: [], entries: [] };
  const credit = isProfit ? amt : 0;
  const debit = isProfit ? 0 : amt;
  const exists = await ledgerRepo.existsWalletEntryForEvent(userId, 'trade', referenceId, credit, debit, options);
  if (exists) {
    logLedgerIdempotencySkip('trade', referenceId, userId, credit, debit);
    return { ids: [], entries: [] };
  }
  if (isProfit) {
    return post([
      { accountCode: ACCOUNTS.WALLET, entityId: userId, debit: 0, credit: amt, currency, referenceType: 'trade', referenceId },
      { accountCode: ACCOUNTS.TRADING_PNL, entityId: userId, debit: amt, credit: 0, currency, referenceType: 'trade', referenceId },
    ], options);
  }
  return post([
    { accountCode: ACCOUNTS.WALLET, entityId: userId, debit: amt, credit: 0, currency, referenceType: 'trade', referenceId },
    { accountCode: ACCOUNTS.TRADING_PNL, entityId: userId, debit: 0, credit: amt, currency, referenceType: 'trade', referenceId },
  ], options);
}

/**
 * Post IB commission earned: Commission Income (credit) -> Receivables or Wallet (debit)
 */
async function postCommissionEarned(ibUserId, amount, currency, referenceId, clientUserId = null, options = {}) {
  return post(
    [
      {
        accountCode: ACCOUNTS.RECEIVABLES,
        entityId: ibUserId,
        debit: amount,
        credit: 0,
        currency,
        referenceType: 'commission',
        referenceId,
        description: clientUserId ? `Commission from ${clientUserId}` : null,
      },
      {
        accountCode: ACCOUNTS.COMMISSION_INCOME,
        entityId: SYSTEM_ACCOUNT_ID,
        debit: 0,
        credit: amount,
        currency,
        referenceType: 'commission',
        referenceId,
      },
    ],
    options
  );
}

/**
 * Post IB commission paid: Receivables (credit) -> Cash/Bank (debit)
 */
async function postCommissionPaid(ibUserId, amount, currency, referenceId) {
  return post([
    { accountCode: ACCOUNTS.COMMISSION_PAID, entityId: SYSTEM_ACCOUNT_ID, debit: amount, credit: 0, currency, referenceType: 'payout', referenceId },
    { accountCode: ACCOUNTS.RECEIVABLES, entityId: ibUserId, debit: 0, credit: amount, currency, referenceType: 'payout', referenceId },
  ]);
}

/**
 * Post PAMM Bull Run IB commission to wallet (instant credit). Idempotent by referenceId.
 * Commission Paid (debit) -> Wallet (credit) for IB.
 */
async function postPammIbCommissionToWallet(ibUserId, amount, currency, referenceId, description = null, options = {}) {
  const amt = Number(amount) || 0;
  if (amt < 0.001) return { ids: [], entries: [] };
  const exists = await ledgerRepo.existsWalletEntryForEvent(ibUserId, 'pamm_ib_commission', referenceId, amt, 0, options);
  if (exists) {
    logLedgerIdempotencySkip('pamm_ib_commission', referenceId, ibUserId, amt, 0);
    return { ids: [], entries: [] };
  }
  return post([
    { accountCode: ACCOUNTS.COMMISSION_PAID, entityId: SYSTEM_ACCOUNT_ID, debit: amt, credit: 0, currency, referenceType: 'pamm_ib_commission', referenceId, description },
    { accountCode: ACCOUNTS.WALLET, entityId: ibUserId, debit: 0, credit: amt, currency, referenceType: 'pamm_ib_commission', referenceId, description },
  ], options);
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

/** List ledger entries for a PAMM fund (for financial reporting) */
async function listLedgerEntriesByPammFund(pammFundId, options = {}) {
  return ledgerRepo.listByPammFund(pammFundId, options);
}

// ---------- PAMM / Bull Run ledger posting ----------
/** PAMM performance fee to manager: TRADING_PNL (debit) -> Wallet manager (credit). Idempotent by referenceId. */
async function postPammFee(managerId, amount, currency, referenceId, fundId, options = {}) {
  const amt = Math.abs(Number(amount)) || 0;
  if (amt < 0.001) return { ids: [], entries: [] };
  const exists = await ledgerRepo.existsWalletEntryForEvent(String(managerId), 'pamm_fee', referenceId, amt, 0, { ...options, pammFundId: String(fundId) });
  if (exists) {
    logLedgerIdempotencySkip('pamm_fee', referenceId, String(managerId), amt, 0);
    return { ids: [], entries: [] };
  }
  return post([
    { accountCode: ACCOUNTS.TRADING_PNL, entityId: SYSTEM_ACCOUNT_ID, debit: amt, credit: 0, currency, referenceType: 'pamm_fee', referenceId, pammFundId: String(fundId) },
    { accountCode: ACCOUNTS.WALLET, entityId: String(managerId), debit: 0, credit: amt, currency, referenceType: 'pamm_fee', referenceId, pammFundId: String(fundId) },
  ], options);
}

/** PAMM profit/loss distribution to investor: Wallet <-> Trading P&L. Idempotent by (positionId, followerId, amount, isProfit). */
async function postPammDistribution(followerId, amount, currency, positionId, isProfit, fundId, options = {}) {
  const amt = Math.abs(Number(amount)) || 0;
  if (amt < 0.001) return { ids: [], entries: [] };
  const fid = String(fundId);
  const refId = positionId || null;
  const credit = isProfit ? amt : 0;
  const debit = isProfit ? 0 : amt;
  const exists = await ledgerRepo.existsWalletEntryForEvent(String(followerId), 'pamm_dist', refId, credit, debit, { ...options, pammFundId: fid });
  if (exists) {
    logLedgerIdempotencySkip('pamm_dist', refId, String(followerId), credit, debit);
    return { ids: [], entries: [] };
  }
  if (isProfit) {
    return post([
      { accountCode: ACCOUNTS.TRADING_PNL, entityId: SYSTEM_ACCOUNT_ID, debit: amt, credit: 0, currency, referenceType: 'pamm_dist', referenceId: refId, pammFundId: fid },
      { accountCode: ACCOUNTS.WALLET, entityId: String(followerId), debit: 0, credit: amt, currency, referenceType: 'pamm_dist', referenceId: refId, pammFundId: fid },
    ], options);
  }
  return post([
    { accountCode: ACCOUNTS.WALLET, entityId: String(followerId), debit: amt, credit: 0, currency, referenceType: 'pamm_dist', referenceId: refId, pammFundId: fid },
    { accountCode: ACCOUNTS.TRADING_PNL, entityId: SYSTEM_ACCOUNT_ID, debit: 0, credit: amt, currency, referenceType: 'pamm_dist', referenceId: refId, pammFundId: fid },
  ], options);
}

/** Manager adds capital to PAMM pool: Wallet (debit) -> CLIENT_FUNDS (credit). Idempotent by referenceId. */
async function postPammManagerCapitalAdd(managerId, amount, currency, referenceId, fundId, options = {}) {
  const amt = Math.abs(Number(amount)) || 0;
  if (amt < 0.001) return { ids: [], entries: [] };
  const exists = await ledgerRepo.existsWalletEntryForEvent(String(managerId), 'pamm_manager_cap_in', referenceId, 0, amt, { ...options, pammFundId: String(fundId) });
  if (exists) {
    logLedgerIdempotencySkip('pamm_manager_cap_in', referenceId, String(managerId), 0, amt);
    return { ids: [], entries: [] };
  }
  return post([
    { accountCode: ACCOUNTS.WALLET, entityId: String(managerId), debit: amt, credit: 0, currency, referenceType: 'pamm_manager_cap_in', referenceId, pammFundId: String(fundId) },
    { accountCode: ACCOUNTS.CLIENT_FUNDS, entityId: String(fundId), debit: 0, credit: amt, currency, referenceType: 'pamm_manager_cap_in', referenceId, pammFundId: String(fundId) },
  ], options);
}

/** Manager withdraws capital from PAMM pool: CLIENT_FUNDS (debit) -> Wallet (credit). Idempotent by referenceId. */
async function postPammManagerCapitalWithdraw(managerId, amount, currency, referenceId, fundId, options = {}) {
  const amt = Math.abs(Number(amount)) || 0;
  if (amt < 0.001) return { ids: [], entries: [] };
  const exists = await ledgerRepo.existsWalletEntryForEvent(String(managerId), 'pamm_manager_cap_out', referenceId, amt, 0, { ...options, pammFundId: String(fundId) });
  if (exists) {
    logLedgerIdempotencySkip('pamm_manager_cap_out', referenceId, String(managerId), amt, 0);
    return { ids: [], entries: [] };
  }
  return post([
    { accountCode: ACCOUNTS.CLIENT_FUNDS, entityId: String(fundId), debit: amt, credit: 0, currency, referenceType: 'pamm_manager_cap_out', referenceId, pammFundId: String(fundId) },
    { accountCode: ACCOUNTS.WALLET, entityId: String(managerId), debit: 0, credit: amt, currency, referenceType: 'pamm_manager_cap_out', referenceId, pammFundId: String(fundId) },
  ], options);
}

/** Investor allocates to PAMM: Wallet (debit) -> CLIENT_FUNDS (credit). Idempotent by referenceId. */
async function postPammAllocation(followerId, amount, currency, referenceId, fundId, options = {}) {
  const amt = Math.abs(Number(amount)) || 0;
  if (amt < 0.001) return { ids: [], entries: [] };
  const exists = await ledgerRepo.existsWalletEntryForEvent(String(followerId), 'pamm_alloc', referenceId, 0, amt, { ...options, pammFundId: String(fundId) });
  if (exists) {
    logLedgerIdempotencySkip('pamm_alloc', referenceId, String(followerId), 0, amt);
    return { ids: [], entries: [] };
  }
  return post([
    { accountCode: ACCOUNTS.WALLET, entityId: String(followerId), debit: amt, credit: 0, currency, referenceType: 'pamm_alloc', referenceId, pammFundId: String(fundId) },
    { accountCode: ACCOUNTS.CLIENT_FUNDS, entityId: String(fundId), debit: 0, credit: amt, currency, referenceType: 'pamm_alloc', referenceId, pammFundId: String(fundId) },
  ], options);
}

/** Investor unallocates (withdraw/unfollow): CLIENT_FUNDS (debit) -> Wallet (credit). Idempotent by referenceId. */
async function postPammUnallocation(followerId, amount, currency, referenceId, fundId, options = {}) {
  const amt = Math.abs(Number(amount)) || 0;
  if (amt < 0.001) return { ids: [], entries: [] };
  const exists = await ledgerRepo.existsWalletEntryForEvent(String(followerId), 'pamm_unalloc', referenceId, amt, 0, { ...options, pammFundId: String(fundId) });
  if (exists) {
    logLedgerIdempotencySkip('pamm_unalloc', referenceId, String(followerId), amt, 0);
    return { ids: [], entries: [] };
  }
  return post([
    { accountCode: ACCOUNTS.CLIENT_FUNDS, entityId: String(fundId), debit: amt, credit: 0, currency, referenceType: 'pamm_unalloc', referenceId, pammFundId: String(fundId) },
    { accountCode: ACCOUNTS.WALLET, entityId: String(followerId), debit: 0, credit: amt, currency, referenceType: 'pamm_unalloc', referenceId, pammFundId: String(fundId) },
  ], options);
}

/**
 * Reverse a Bull Run **profit** distribution to one investor (original was WALLET credit).
 * Idempotent by referenceId rbprof:positionId:followerId
 */
async function postPammDistributionProfitRollback(followerId, amount, currency, positionId, fundId, options = {}) {
  const amt = Math.abs(Number(amount)) || 0;
  if (amt < 0.001) return { ids: [], entries: [] };
  const fid = String(fundId);
  const refId = `rbprof:${String(positionId)}:${String(followerId)}`;
  const exists = await ledgerRepo.existsWalletEntryForEvent(String(followerId), 'pamm_dist_rb', refId, 0, amt, {
    ...options,
    pammFundId: fid,
  });
  if (exists) {
    logLedgerIdempotencySkip('pamm_dist_rb', refId, String(followerId), 0, amt);
    return { ids: [], entries: [] };
  }
  return post(
    [
      {
        accountCode: ACCOUNTS.WALLET,
        entityId: String(followerId),
        debit: amt,
        credit: 0,
        currency,
        referenceType: 'pamm_dist_rb',
        referenceId: refId,
        description: 'Bull Run PAMM distribution rollback (profit)',
        pammFundId: fid,
      },
      {
        accountCode: ACCOUNTS.TRADING_PNL,
        entityId: SYSTEM_ACCOUNT_ID,
        debit: 0,
        credit: amt,
        currency,
        referenceType: 'pamm_dist_rb',
        referenceId: refId,
        pammFundId: fid,
      },
    ],
    options
  );
}

/**
 * Reverse a Bull Run **loss** distribution to one investor (original was WALLET debit).
 * Idempotent by referenceId rbloss:positionId:followerId
 */
async function postPammDistributionLossRollback(followerId, amount, currency, positionId, fundId, options = {}) {
  const amt = Math.abs(Number(amount)) || 0;
  if (amt < 0.001) return { ids: [], entries: [] };
  const fid = String(fundId);
  const refId = `rbloss:${String(positionId)}:${String(followerId)}`;
  const exists = await ledgerRepo.existsWalletEntryForEvent(String(followerId), 'pamm_dist_rb', refId, amt, 0, {
    ...options,
    pammFundId: fid,
  });
  if (exists) {
    logLedgerIdempotencySkip('pamm_dist_rb', refId, String(followerId), amt, 0);
    return { ids: [], entries: [] };
  }
  return post(
    [
      {
        accountCode: ACCOUNTS.WALLET,
        entityId: String(followerId),
        debit: 0,
        credit: amt,
        currency,
        referenceType: 'pamm_dist_rb',
        referenceId: refId,
        description: 'Bull Run PAMM distribution rollback (loss)',
        pammFundId: fid,
      },
      {
        accountCode: ACCOUNTS.TRADING_PNL,
        entityId: SYSTEM_ACCOUNT_ID,
        debit: amt,
        credit: 0,
        currency,
        referenceType: 'pamm_dist_rb',
        referenceId: refId,
        pammFundId: fid,
      },
    ],
    options
  );
}

/** Reverse PAMM IB Bull Run commission credit to an IB wallet. Idempotent by rb|stableRef. */
async function postPammIbCommissionRollback(ibUserId, amount, currency, stableRef, options = {}) {
  const amt = Math.abs(Number(amount)) || 0;
  if (amt < 0.001) return { ids: [], entries: [] };
  const refId = `rb|${String(stableRef)}`;
  const exists = await ledgerRepo.existsWalletEntryForEvent(String(ibUserId), 'pamm_ib_commission_rb', refId, 0, amt, options);
  if (exists) {
    logLedgerIdempotencySkip('pamm_ib_commission_rb', refId, String(ibUserId), 0, amt);
    return { ids: [], entries: [] };
  }
  return post(
    [
      {
        accountCode: ACCOUNTS.WALLET,
        entityId: String(ibUserId),
        debit: amt,
        credit: 0,
        currency,
        referenceType: 'pamm_ib_commission_rb',
        referenceId: refId,
        description: 'PAMM IB commission rollback (Bull Run)',
      },
      {
        accountCode: ACCOUNTS.COMMISSION_PAID,
        entityId: SYSTEM_ACCOUNT_ID,
        debit: 0,
        credit: amt,
        currency,
        referenceType: 'pamm_ib_commission_rb',
        referenceId: refId,
      },
    ],
    options
  );
}

export default {
  post,
  createDoubleEntryLedger,
  hasWithdrawalLedgerEntry,
  postDeposit,
  postWithdrawal,
  postTransfer,
  postAdminCredit,
  postImportOpeningBalance,
  postTradingPnl,
  postCommissionEarned,
  postCommissionPaid,
  postPammIbCommissionToWallet,
  postPammFee,
  postPammDistribution,
  postPammManagerCapitalAdd,
  postPammManagerCapitalWithdraw,
  postPammAllocation,
  postPammUnallocation,
  postPammDistributionProfitRollback,
  postPammDistributionLossRollback,
  postPammIbCommissionRollback,
  listEntries,
  getBalance,
  getBalances,
  listLedgerEntriesByPammFund,
};
