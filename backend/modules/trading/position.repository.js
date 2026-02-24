/**
 * Position repository — MongoDB positions collection
 */
import { getDb } from '../../config/mongo.js';
import { ObjectId } from 'mongodb';

const COLLECTION = 'positions';

async function col() {
  const db = await getDb();
  return db.collection(COLLECTION);
}

async function create(doc) {
  const c = await col();
  const now = new Date();
  const { insertedId } = await c.insertOne({
    ...doc,
    openedAt: now,
    updatedAt: now,
  });
  return insertedId.toString();
}

async function findById(id, userId, accountId = null) {
  if (!ObjectId.isValid(id)) return null;
  const c = await col();
  const filter = { _id: new ObjectId(id), userId };
  if (accountId) filter.$or = [{ accountId }, { accountId: { $exists: false } }, { accountId: null }];
  const p = await c.findOne(filter);
  return p ? { id: p._id.toString(), ...p, _id: undefined } : null;
}

async function listOpen(userId, options = {}) {
  const c = await col();
  const { symbol, limit = 100, accountId } = options;
  const filter = { userId, closedAt: null };
  if (accountId) filter.$or = [{ accountId }, { accountId: { $exists: false } }, { accountId: null }];
  if (symbol) filter.symbol = symbol;
  const list = await c.find(filter).sort({ openedAt: -1 }).limit(limit).toArray();
  return list.map((p) => ({ id: p._id.toString(), ...p, _id: undefined }));
}

async function listClosed(userId, options = {}) {
  const c = await col();
  const { symbol, from, to, limit = 50, accountId } = options;
  const filter = { userId, closedAt: { $ne: null } };
  if (accountId) filter.$or = [{ accountId }, { accountId: { $exists: false } }, { accountId: null }];
  if (symbol) filter.symbol = symbol;
  if (from || to) {
    filter.closedAt = {};
    if (from) filter.closedAt.$gte = new Date(from);
    if (to) filter.closedAt.$lte = new Date(to);
  }
  const list = await c.find(filter).sort({ closedAt: -1 }).limit(limit).toArray();
  return list.map((p) => ({ id: p._id.toString(), ...p, _id: undefined }));
}

async function update(id, userId, update, accountId = null) {
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

export default { create, findById, listOpen, listClosed, update };
