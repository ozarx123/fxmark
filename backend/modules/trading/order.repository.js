/**
 * Order repository — MongoDB orders collection
 */
import { getDb } from '../../config/mongo.js';
import { ObjectId } from 'mongodb';

const COLLECTION = 'orders';

async function col() {
  const db = await getDb();
  return db.collection(COLLECTION);
}

async function create(doc) {
  const c = await col();
  const now = new Date();
  const { insertedId } = await c.insertOne({
    ...doc,
    createdAt: now,
    updatedAt: now,
  });
  return insertedId.toString();
}

async function findById(id, userId, accountId = null) {
  if (!ObjectId.isValid(id)) return null;
  const c = await col();
  const filter = { _id: new ObjectId(id), userId };
  if (accountId) filter.$or = [{ accountId }, { accountId: { $exists: false } }, { accountId: null }];
  const o = await c.findOne(filter);
  return o ? { id: o._id.toString(), ...o, _id: undefined } : null;
}

/** Idempotent place: same userId + accountScope + clientOrderId returns existing row. */
async function findByClientOrderKey(userId, accountScope, clientOrderId) {
  if (!userId || !accountScope || !clientOrderId) return null;
  const c = await col();
  const o = await c.findOne({
    userId,
    accountScope,
    clientOrderId: String(clientOrderId).trim(),
  });
  return o ? { id: o._id.toString(), ...o, _id: undefined } : null;
}

function normalizeSymbol(s) {
  if (!s) return null;
  return String(s).replace(/\//g, '').toUpperCase();
}

/** List pending orders for a symbol (for price trigger engine). */
async function listPendingBySymbol(symbol) {
  const c = await col();
  const sym = normalizeSymbol(symbol);
  if (!sym) return [];
  const filter = {
    status: { $in: ['pending', 'placed'] },
    type: { $in: ['buy_limit', 'sell_limit', 'buy_stop', 'sell_stop'] },
    symbol: { $in: [sym, symbol].filter(Boolean) },
  };
  const list = await c.find(filter).sort({ createdAt: 1 }).toArray();
  return list.map((o) => ({ id: o._id.toString(), ...o, _id: undefined }));
}

async function listByUser(userId, options = {}) {
  const c = await col();
  const { status, symbol, limit = 50, accountId } = options;
  const filter = { userId };
  if (accountId) filter.$or = [{ accountId }, { accountId: { $exists: false } }, { accountId: null }];
  if (status) filter.status = status;
  if (symbol) filter.symbol = normalizeSymbol(symbol) || symbol;
  const list = await c.find(filter).sort({ createdAt: -1 }).limit(limit).toArray();
  return list.map((o) => ({ id: o._id.toString(), ...o, _id: undefined }));
}

async function updateStatus(id, userId, status, extra = {}, accountId = null) {
  if (!ObjectId.isValid(id)) return null;
  const c = await col();
  const filter = { _id: new ObjectId(id), userId };
  if (accountId) filter.$or = [{ accountId }, { accountId: { $exists: false } }, { accountId: null }];
  const result = await c.findOneAndUpdate(
    filter,
    { $set: { status, updatedAt: new Date(), ...extra } },
    { returnDocument: 'after' }
  );
  return result ? { id: result._id.toString(), ...result, _id: undefined } : null;
}

async function updateOrder(id, userId, update, accountId = null) {
  if (!ObjectId.isValid(id)) return null;
  const c = await col();
  const filter = { _id: new ObjectId(id), userId };
  if (accountId) filter.$or = [{ accountId }, { accountId: { $exists: false } }, { accountId: null }];
  const result = await c.findOneAndUpdate(
    filter,
    { $set: { ...update, updatedAt: new Date() } },
    { returnDocument: 'after' }
  );
  return result ? { id: result._id.toString(), ...result, _id: undefined } : null;
}

export default { create, findById, findByClientOrderKey, listByUser, listPendingBySymbol, updateStatus, updateOrder };
