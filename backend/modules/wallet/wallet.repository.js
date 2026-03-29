/**
 * Wallet repository — MongoDB: wallets (balance per user/currency), wallet_transactions (history)
 */
import { getDb } from '../../config/mongo.js';
import { ObjectId } from 'mongodb';
import { assertPairedWalletLedgerAllowed } from '../finance/finance-wallet-guard.js';
import { queueWalletBalanceNotify } from '../email/wallet-balance-notify.js';

const WALLETS_COLLECTION = 'wallets';
const TRANSACTIONS_COLLECTION = 'wallet_transactions';

async function walletsCol() {
  const db = await getDb();
  return db.collection(WALLETS_COLLECTION);
}

async function transactionsCol() {
  const db = await getDb();
  return db.collection(TRANSACTIONS_COLLECTION);
}

let withdrawalIdempotencyIndexEnsured = false;
async function ensureWithdrawalIdempotencyIndex() {
  if (withdrawalIdempotencyIndexEnsured) return;
  const col = await transactionsCol();
  await col.createIndex(
    { userId: 1, processIdempotencyKey: 1 },
    {
      unique: true,
      partialFilterExpression: {
        type: 'withdrawal',
        status: 'completed',
        // $gt: '' = non-empty string; $ne: '' is rejected on some servers (partial index + $not).
        processIdempotencyKey: { $exists: true, $type: 'string', $gt: '' },
      },
    }
  );
  await col.createIndex({ userId: 1, type: 1, createdAt: -1 });
  try {
    await col.createIndex(
      { userId: 1, type: 1, reference: 1 },
      {
        unique: true,
        name: 'wallet_tx_pamm_dist_user_ref_unique',
        partialFilterExpression: { type: 'pamm_dist' },
      }
    );
  } catch (e) {
    if (e?.code !== 11000) console.warn('[wallet] pamm_dist unique index:', e.message);
  }
  try {
    await col.createIndex(
      { userId: 1, type: 1, reference: 1 },
      {
        unique: true,
        name: 'wallet_tx_ib_pamm_commission_user_ref_unique',
        partialFilterExpression: { type: 'ib_pamm_commission' },
      }
    );
  } catch (e) {
    if (e?.code !== 11000) console.warn('[wallet] ib_pamm_commission unique index:', e.message);
  }
  withdrawalIdempotencyIndexEnsured = true;
}

/** True if this user already has a pamm_dist wallet tx for this position (exactly-once per user per close). */
async function existsPammDistribution(userId, positionId, options = {}) {
  await ensureWithdrawalIdempotencyIndex();
  const col = await transactionsCol();
  const uid = normUserId(userId);
  const ref = positionId != null ? String(positionId) : '';
  const refConds = [{ reference: ref }];
  if (ObjectId.isValid(ref) && ref.length === 24) refConds.push({ reference: new ObjectId(ref) });
  const findOpts = options.session ? { session: options.session } : {};
  const doc = await col.findOne(
    {
      userId: uid,
      type: 'pamm_dist',
      $or: refConds,
    },
    findOpts
  );
  return !!doc;
}

/** All completed pamm_dist wallet rows for a closed position (Bull Run profit credits). */
async function listPammDistTransactionsByPosition(positionId) {
  await ensureWithdrawalIdempotencyIndex();
  const col = await transactionsCol();
  const ref = positionId != null ? String(positionId) : '';
  const refOr = [{ reference: ref }];
  if (ObjectId.isValid(ref) && ref.length === 24) refOr.push({ reference: new ObjectId(ref) });
  const list = await col
    .find({
      type: 'pamm_dist',
      status: 'completed',
      $or: refOr,
    })
    .toArray();
  return list.map((t) => ({
    id: t._id.toString(),
    userId: normUserId(t.userId),
    amount: Number(t.amount) || 0,
    currency: t.currency || 'USD',
    reference: t.reference,
    completedAt: t.completedAt,
  }));
}

/** Stable reference for IB PAMM commission wallet row: pib|positionId|investorId|ibId|Llevel */
function ibPammCommissionReferenceKey(positionId, investorId, ibId, levelNumber) {
  return `pib|${String(positionId)}|${String(investorId)}|${String(ibId)}|L${levelNumber}`;
}

async function existsIbPammCommissionWallet(userId, referenceKey, options = {}) {
  await ensureWithdrawalIdempotencyIndex();
  const col = await transactionsCol();
  const findOpts = options.session ? { session: options.session } : {};
  const doc = await col.findOne(
    {
      userId: normUserId(userId),
      type: 'ib_pamm_commission',
      reference: String(referenceKey),
    },
    findOpts
  );
  return !!doc;
}

let walletsIndexEnsured = false;
async function ensureWalletsIndex() {
  if (walletsIndexEnsured) return;
  const col = await walletsCol();
  await col.createIndex({ userId: 1, currency: 1 }, { unique: true });
  walletsIndexEnsured = true;
}

/** Normalize userId to string (MongoDB is strict about type matching) */
function normUserId(userId) {
  return userId == null ? '' : String(userId);
}

/** Get or create wallet for user/currency. Default balance 0. options.session for transactions. */
async function getOrCreateWallet(userId, currency = 'USD', options = {}) {
  await ensureWalletsIndex();
  const col = await walletsCol();
  const uid = normUserId(userId);
  const findOpts = options.session ? { session: options.session } : {};
  const existing = await col.findOne({ userId: uid, currency }, findOpts);
  if (existing) {
    return { id: existing._id.toString(), ...existing, _id: undefined };
  }
  const doc = {
    userId: uid,
    currency,
    balance: 0,
    locked: 0,
    updatedAt: new Date(),
  };
  const insertOpts = options.session ? { session: options.session } : {};
  const { insertedId } = await col.insertOne(doc, insertOpts);
  return { id: insertedId.toString(), ...doc, _id: undefined };
}

/**
 * Set wallet balance to an exact value (reconciliation / emergency sync only).
 * @param {import('mongodb').ClientSession} [options.session]
 */
async function setBalanceAbsolute(userId, currency, newBalance, options = {}) {
  assertPairedWalletLedgerAllowed('setBalanceAbsolute', options);
  await ensureWalletsIndex();
  const col = await walletsCol();
  const uid = normUserId(userId);
  const bal = Number(newBalance) || 0;
  const opts = { returnDocument: 'after', upsert: true };
  if (options.session) opts.session = options.session;
  const result = await col.findOneAndUpdate(
    { userId: uid, currency: currency || 'USD' },
    { $set: { balance: bal, updatedAt: new Date() } },
    opts
  );
  if (!result) return null;
  return { id: result._id.toString(), ...result, _id: undefined };
}

/** Update balance (add delta). Returns updated wallet. options.session for transaction. */
async function updateBalance(userId, currency, delta, options = {}) {
  assertPairedWalletLedgerAllowed('updateBalance', options);
  await ensureWalletsIndex();
  const col = await walletsCol();
  const uid = normUserId(userId);
  const opts = { returnDocument: 'after', upsert: true };
  if (options.session) opts.session = options.session;
  const result = await col.findOneAndUpdate(
    { userId: uid, currency },
    {
      $inc: { balance: delta },
      $set: { updatedAt: new Date() },
    },
    opts
  );
  if (!result) return null;
  return { id: result._id.toString(), ...result, _id: undefined };
}

/**
 * Debit wallet only if balance >= amount (single atomic findOneAndUpdate). No upsert.
 * @returns {Promise<object|null>} Updated wallet or null if amount invalid, insufficient, or missing wallet
 */
async function debitBalanceIfSufficient(userId, currency, amount, options = {}) {
  assertPairedWalletLedgerAllowed('debitBalanceIfSufficient', options);
  const amt = Number(amount) || 0;
  if (amt <= 0) return null;
  await ensureWalletsIndex();
  const col = await walletsCol();
  const uid = normUserId(userId);
  const cur = currency || 'USD';
  const opts = { returnDocument: 'after' };
  if (options.session) opts.session = options.session;
  const result = await col.findOneAndUpdate(
    { userId: uid, currency: cur, balance: { $gte: amt } },
    { $inc: { balance: -amt }, $set: { updatedAt: new Date() } },
    opts
  );
  if (!result) return null;
  return { id: result._id.toString(), ...result, _id: undefined };
}

/** Insert a transaction record. Returns id. options.session for transaction. */
async function createTransaction(doc, options = {}) {
  const col = await transactionsCol();
  const toInsert = { ...doc, createdAt: new Date() };
  if (toInsert.userId != null) toInsert.userId = normUserId(toInsert.userId);
  const insertOpts = options.session ? { session: options.session } : {};
  const { insertedId } = await col.insertOne(toInsert, insertOpts);
  const id = insertedId.toString();
  if (toInsert.status === 'completed' && !options.skipBalanceEmail && !options.session) {
    queueWalletBalanceNotify({ ...toInsert, id });
  }
  return id;
}

/** Update transaction status (e.g. completedAt). options.session for transaction. */
async function updateTransaction(id, update, options = {}) {
  const col = await transactionsCol();
  if (!ObjectId.isValid(id)) return null;
  const opts = { returnDocument: 'after' };
  if (options.session) opts.session = options.session;
  const result = await col.findOneAndUpdate(
    { _id: new ObjectId(id) },
    { $set: update },
    opts
  );
  return result;
}

/** List transactions for user, optional type filter (string or array), newest first. */
async function getTransactions(userId, options = {}) {
  const col = await transactionsCol();
  const { type, limit = 50 } = options;
  const filter = { userId: normUserId(userId) };
  if (type) {
    filter.type = Array.isArray(type) ? { $in: type } : type;
  }
  const cursor = col.find(filter).sort({ createdAt: -1 }).limit(limit);
  const list = await cursor.toArray();
  return list.map((t) => ({
    id: t._id.toString(),
    transaction_id: t._id.toString(),
    userId: t.userId,
    user_id: t.userId,
    type: t.type,
    amount: t.amount,
    currency: t.currency || 'USD',
    status: t.status,
    reference: t.reference,
    destination: t.destination,
    payment_method: t.payment_method || null,
    createdAt: t.createdAt,
    created_at: t.createdAt,
    completedAt: t.completedAt,
    fraudRiskScore: t.fraudRiskScore,
    fraudRiskFlags: Array.isArray(t.fraudRiskFlags) ? t.fraudRiskFlags : [],
    fraudCheckedAt: t.fraudCheckedAt,
  }));
}

/** All wallet rows (read-only reconciliation / reporting). */
async function listAllWallets() {
  await ensureWalletsIndex();
  const col = await walletsCol();
  const list = await col.find({}).project({ userId: 1, currency: 1, balance: 1 }).toArray();
  return list.map((w) => ({
    userId: normUserId(w.userId),
    currency: w.currency || 'USD',
    balance: Number(w.balance) || 0,
  }));
}

/** Get one transaction by id and userId. */
async function getTransactionById(id, userId) {
  if (!ObjectId.isValid(id)) return null;
  const col = await transactionsCol();
  const t = await col.findOne({ _id: new ObjectId(id), userId: normUserId(userId) });
  return t ? { ...t, id: t._id.toString() } : null;
}

/**
 * Atomically transition a pending withdrawal to completed. Only one caller can succeed.
 * Used to prevent double debit under concurrent process requests.
 * @returns {Promise<object|null>} Updated doc or null if not found or not pending
 */
/** Admin: recent activity across transaction types (withdrawals, deposits, admin_credit, transfers). */
async function listRecentActivityForAdmin(limit = 80) {
  const col = await transactionsCol();
  const list = await col
    .find({})
    .sort({ createdAt: -1 })
    .limit(Math.min(limit, 200))
    .toArray();
  return list.map((t) => ({
    id: t._id.toString(),
    userId: t.userId,
    type: t.type,
    amount: t.amount,
    currency: t.currency || 'USD',
    status: t.status ?? null,
    fraudRiskScore: t.fraudRiskScore ?? null,
    fraudRiskFlags: Array.isArray(t.fraudRiskFlags) ? t.fraudRiskFlags : [],
    createdAt: t.createdAt,
    completedAt: t.completedAt ?? null,
  }));
}

/** Admin: list withdrawals (all users) with optional filters. */
async function listWithdrawalsForAdmin(options = {}) {
  const col = await transactionsCol();
  const {
    limit = 100,
    risk,
    status,
    from,
    to,
    amountMin,
    amountMax,
    search,
  } = options;
  const filter = { type: 'withdrawal' };
  if (risk === 'high') filter.fraudRiskScore = { $gte: 70 };
  if (risk === 'medium') filter.fraudRiskScore = { $gte: 41, $lt: 70 };
  if (risk === 'low') filter.$or = [{ fraudRiskScore: { $lt: 41 } }, { fraudRiskScore: { $exists: false } }];
  if (status) filter.status = status;
  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = new Date(from);
    if (to) filter.createdAt.$lte = new Date(to);
  }
  if (amountMin != null && amountMin !== '' || amountMax != null && amountMax !== '') {
    filter.amount = {};
    if (amountMin != null && amountMin !== '') filter.amount.$gte = Number(amountMin);
    if (amountMax != null && amountMax !== '') filter.amount.$lte = Number(amountMax);
  }
  if (search && String(search).trim()) {
    const s = String(search).trim();
    const or = [{ userId: new RegExp(s, 'i') }];
    if (ObjectId.isValid(s)) or.push({ _id: new ObjectId(s) });
    filter.$and = (filter.$and || []).concat([{ $or: or }]);
  }
  const list = await col.find(filter).sort({ createdAt: -1 }).limit(Math.min(limit, 500)).toArray();
  return list.map((t) => ({
    id: t._id.toString(),
    userId: t.userId,
    type: t.type,
    amount: t.amount,
    currency: t.currency || 'USD',
    status: t.status,
    fraudRiskScore: t.fraudRiskScore,
    fraudRiskFlags: Array.isArray(t.fraudRiskFlags) ? t.fraudRiskFlags : [],
    fraudCheckedAt: t.fraudCheckedAt,
    createdAt: t.createdAt,
    completedAt: t.completedAt,
    reference: t.reference,
    destination: t.destination,
    approvedBy: t.approvedBy ?? null,
    approvedAt: t.approvedAt ?? null,
    rejectedBy: t.rejectedBy ?? null,
    rejectedAt: t.rejectedAt ?? null,
    adminNote: t.adminNote ?? null,
  }));
}

/** Admin: get one withdrawal by id (any user). */
async function getWithdrawalByIdForAdmin(id) {
  if (!ObjectId.isValid(id)) return null;
  const col = await transactionsCol();
  const t = await col.findOne({ _id: new ObjectId(id), type: 'withdrawal' });
  if (!t) return null;
  return {
    id: t._id.toString(),
    userId: t.userId,
    type: t.type,
    amount: t.amount,
    currency: t.currency || 'USD',
    status: t.status,
    fraudRiskScore: t.fraudRiskScore,
    fraudRiskFlags: Array.isArray(t.fraudRiskFlags) ? t.fraudRiskFlags : [],
    fraudCheckedAt: t.fraudCheckedAt,
    createdAt: t.createdAt,
    completedAt: t.completedAt,
    reference: t.reference,
    destination: t.destination,
    processIdempotencyKey: t.processIdempotencyKey,
    approvedBy: t.approvedBy ?? null,
    approvedAt: t.approvedAt ?? null,
    rejectedBy: t.rejectedBy ?? null,
    rejectedAt: t.rejectedAt ?? null,
    adminNote: t.adminNote ?? null,
  };
}

/** Completed withdrawal for this user + process idempotency key (replay lookup). */
async function findCompletedWithdrawalByProcessIdempotencyKey(userId, key) {
  if (!userId || key == null || String(key).trim() === '') return null;
  await ensureWithdrawalIdempotencyIndex();
  const col = await transactionsCol();
  const k = String(key).trim().slice(0, 128);
  const t = await col.findOne({
    userId: normUserId(userId),
    type: 'withdrawal',
    status: 'completed',
    processIdempotencyKey: k,
  });
  if (!t) return null;
  return { ...t, id: t._id.toString() };
}

async function claimPendingWithdrawal(id, userId, update, options = {}) {
  if (!ObjectId.isValid(id)) return null;
  const col = await transactionsCol();
  const filter = {
    _id: new ObjectId(id),
    userId: normUserId(userId),
    type: 'withdrawal',
    status: { $in: ['pending', 'approved'] },
  };
  const opts = { returnDocument: 'after' };
  if (options.session) opts.session = options.session;
  const result = await col.findOneAndUpdate(filter, { $set: update }, opts);
  return result;
}

export default {
  getOrCreateWallet,
  setBalanceAbsolute,
  updateBalance,
  debitBalanceIfSufficient,
  listAllWallets,
  createTransaction,
  updateTransaction,
  getTransactions,
  getTransactionById,
  listRecentActivityForAdmin,
  listWithdrawalsForAdmin,
  getWithdrawalByIdForAdmin,
  claimPendingWithdrawal,
  findCompletedWithdrawalByProcessIdempotencyKey,
  existsPammDistribution,
  listPammDistTransactionsByPosition,
  existsIbPammCommissionWallet,
  ibPammCommissionReferenceKey,
};
