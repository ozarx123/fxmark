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

async function listByUser(userId, options = {}) {
  const c = await col();
  const { status, symbol, limit = 50, accountId } = options;
  const filter = { userId };
  if (accountId) filter.$or = [{ accountId }, { accountId: { $exists: false } }, { accountId: null }];
  if (status) filter.status = status;
  if (symbol) filter.symbol = symbol;
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

export default { create, findById, listByUser, updateStatus };
