/**
 * Wallet repository — MongoDB: wallets (balance per user/currency), wallet_transactions (history)
 */
import { getDb } from '../../config/mongo.js';
import { ObjectId } from 'mongodb';

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

/** Get or create wallet for user/currency. Default balance 0. */
async function getOrCreateWallet(userId, currency = 'USD') {
  await ensureWalletsIndex();
  const col = await walletsCol();
  const uid = normUserId(userId);
  const existing = await col.findOne({ userId: uid, currency });
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
  const { insertedId } = await col.insertOne(doc);
  return { id: insertedId.toString(), ...doc, _id: undefined };
}

/** Update balance (add delta). Returns updated wallet. */
async function updateBalance(userId, currency, delta) {
  await ensureWalletsIndex();
  const col = await walletsCol();
  const uid = normUserId(userId);
  const result = await col.findOneAndUpdate(
    { userId: uid, currency },
    {
      $inc: { balance: delta },
      $set: { updatedAt: new Date() },
    },
    { returnDocument: 'after', upsert: true }
  );
  if (!result) return null;
  return { id: result._id.toString(), ...result, _id: undefined };
}

/** Insert a transaction record. Returns id. */
async function createTransaction(doc) {
  const col = await transactionsCol();
  const { insertedId } = await col.insertOne({
    ...doc,
    createdAt: new Date(),
  });
  return insertedId.toString();
}

/** Update transaction status (e.g. completedAt). */
async function updateTransaction(id, update) {
  const col = await transactionsCol();
  if (!ObjectId.isValid(id)) return null;
  const result = await col.findOneAndUpdate(
    { _id: new ObjectId(id) },
    { $set: update },
    { returnDocument: 'after' }
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
    userId: t.userId,
    type: t.type,
    amount: t.amount,
    currency: t.currency || 'USD',
    status: t.status,
    reference: t.reference,
    destination: t.destination,
    createdAt: t.createdAt,
    completedAt: t.completedAt,
  }));
}

/** Get one transaction by id and userId. */
async function getTransactionById(id, userId) {
  if (!ObjectId.isValid(id)) return null;
  const col = await transactionsCol();
  const t = await col.findOne({ _id: new ObjectId(id), userId: normUserId(userId) });
  return t ? { ...t, id: t._id.toString() } : null;
}

export default {
  getOrCreateWallet,
  updateBalance,
  createTransaction,
  updateTransaction,
  getTransactions,
  getTransactionById,
};
