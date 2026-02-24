/**
 * Trade Manager / PAMM repository — MongoDB: pamm_managers, pamm_allocations, manager_trades
 */
import { getDb } from '../../config/mongo.js';
import { ObjectId } from 'mongodb';

const MANAGERS_COLLECTION = 'pamm_managers';
const ALLOCATIONS_COLLECTION = 'pamm_allocations';
const TRADES_COLLECTION = 'manager_trades';

async function managersCol() {
  const db = await getDb();
  return db.collection(MANAGERS_COLLECTION);
}

async function allocationsCol() {
  const db = await getDb();
  return db.collection(ALLOCATIONS_COLLECTION);
}

async function tradesCol() {
  const db = await getDb();
  return db.collection(TRADES_COLLECTION);
}

// ---------- Managers ----------
async function createManager(doc) {
  const col = await managersCol();
  const now = new Date();
  const { insertedId } = await col.insertOne({
    ...doc,
    approvalStatus: doc.approvalStatus ?? 'pending',
    createdAt: now,
    updatedAt: now,
  });
  return insertedId.toString();
}

async function getManagerByUserId(userId) {
  const col = await managersCol();
  const m = await col.findOne({ userId });
  return m ? { id: m._id.toString(), ...m, _id: undefined } : null;
}

/** List all funds for a manager (one manager can have multiple funds) */
async function listFundsByManagerId(userId) {
  const col = await managersCol();
  const list = await col.find({ userId }).sort({ createdAt: -1 }).toArray();
  return list.map((m) => ({ id: m._id.toString(), ...m, _id: undefined }));
}

async function getManagerById(id) {
  if (!ObjectId.isValid(id)) return null;
  const col = await managersCol();
  const m = await col.findOne({ _id: new ObjectId(id) });
  return m ? { id: m._id.toString(), ...m, _id: undefined } : null;
}

async function getFundByTradingAccountId(tradingAccountId) {
  const col = await managersCol();
  const m = await col.findOne({ tradingAccountId });
  return m ? { id: m._id.toString(), ...m, _id: undefined } : null;
}

async function listManagers(options = {}) {
  const col = await managersCol();
  const { isPublic = true, limit = 50, includePending = false } = options;
  const filter = {};
  if (isPublic !== undefined) filter.isPublic = !!isPublic;
  if (!includePending) {
    filter.$or = [{ approvalStatus: 'approved' }, { approvalStatus: { $exists: false } }];
  }
  const list = await col.find(filter).sort({ createdAt: -1 }).limit(limit).toArray();
  return list.map((m) => ({ id: m._id.toString(), ...m, _id: undefined }));
}

async function updateManager(userId, update) {
  const col = await managersCol();
  const result = await col.findOneAndUpdate(
    { userId },
    { $set: { ...update, updatedAt: new Date() } },
    { returnDocument: 'after' }
  );
  return result ? { id: result._id.toString(), ...result, _id: undefined } : null;
}

async function updateManagerById(id, update) {
  if (!ObjectId.isValid(id)) return null;
  const col = await managersCol();
  const result = await col.findOneAndUpdate(
    { _id: new ObjectId(id) },
    { $set: { ...update, updatedAt: new Date() } },
    { returnDocument: 'after' }
  );
  return result ? { id: result._id.toString(), ...result, _id: undefined } : null;
}

async function listAllManagers(options = {}) {
  const col = await managersCol();
  const { limit = 100, approvalStatus } = options;
  const filter = {};
  if (approvalStatus) filter.approvalStatus = approvalStatus;
  const list = await col.find(filter).sort({ createdAt: -1 }).limit(limit).toArray();
  return list.map((m) => ({ id: m._id.toString(), ...m, _id: undefined }));
}

// ---------- Allocations (follow relationship) ----------
async function createAllocation(followerId, managerId, allocatedBalance = 0) {
  const col = await allocationsCol();
  const now = new Date();
  const { insertedId } = await col.insertOne({
    followerId,
    managerId,
    allocatedBalance: Number(allocatedBalance),
    status: 'active',
    createdAt: now,
    updatedAt: now,
  });
  return insertedId.toString();
}

async function getAllocationById(id, followerId) {
  if (!ObjectId.isValid(id)) return null;
  const col = await allocationsCol();
  const a = await col.findOne({ _id: new ObjectId(id), followerId });
  return a ? { id: a._id.toString(), ...a, _id: undefined } : null;
}

async function getActiveAllocation(followerId, managerId) {
  const col = await allocationsCol();
  const a = await col.findOne({ followerId, managerId, status: 'active' });
  return a ? { id: a._id.toString(), ...a, _id: undefined } : null;
}

async function listAllocationsByFollower(followerId, options = {}) {
  const col = await allocationsCol();
  const { status, limit = 50 } = options;
  const filter = { followerId };
  if (status) filter.status = status;
  const list = await col.find(filter).sort({ createdAt: -1 }).limit(limit).toArray();
  return list.map((a) => ({ id: a._id.toString(), ...a, _id: undefined }));
}

async function listAllocationsByManager(managerId, options = {}) {
  const col = await allocationsCol();
  const { status, limit = 50 } = options;
  const filter = { managerId };
  if (status) filter.status = status;
  const list = await col.find(filter).sort({ createdAt: -1 }).limit(limit).toArray();
  return list.map((a) => ({ id: a._id.toString(), ...a, _id: undefined }));
}

async function updateAllocation(id, update) {
  const col = await allocationsCol();
  if (!ObjectId.isValid(id)) return null;
  const result = await col.findOneAndUpdate(
    { _id: new ObjectId(id) },
    { $set: { ...update, updatedAt: new Date() } },
    { returnDocument: 'after' }
  );
  return result ? { id: result._id.toString(), ...result, _id: undefined } : null;
}

// ---------- Manager trades (for getTrades) ----------
async function createTrade(doc) {
  const col = await tradesCol();
  const now = new Date();
  const { insertedId } = await col.insertOne({ ...doc, createdAt: now });
  return insertedId.toString();
}

async function listTradesByManager(managerId, options = {}) {
  const col = await tradesCol();
  const { limit = 50, symbol } = options;
  const filter = { managerId };
  if (symbol) filter.symbol = symbol;
  const list = await col.find(filter).sort({ createdAt: -1 }).limit(limit).toArray();
  return list.map((t) => ({ id: t._id.toString(), ...t, _id: undefined }));
}

export default {
  createManager,
  getManagerByUserId,
  listFundsByManagerId,
  getManagerById,
  getFundByTradingAccountId,
  listManagers,
  listAllManagers,
  updateManager,
  updateManagerById,
  createAllocation,
  getAllocationById,
  getActiveAllocation,
  listAllocationsByFollower,
  listAllocationsByManager,
  updateAllocation,
  createTrade,
  listTradesByManager,
};
