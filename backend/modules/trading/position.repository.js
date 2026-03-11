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

/**
 * Generate matching symbol variants for lookups.
 * Handles:
 * - Display forms: "XAU/USD", "EUR/USD"
 * - Internal forms: "XAUUSD", "EURUSD"
 * - Spaced forms: "XAU USD" (treated as XAUUSD)
 */
function symbolVariants(symbol) {
  if (!symbol) return null;
  const raw = String(symbol || '').toUpperCase();
  // Strip slashes and spaces for canonical internal form (e.g. "XAU/USD", "XAU USD" -> "XAUUSD")
  const noSlashNoSpace = raw.replace(/[\/\s]/g, '');
  const withSlash = noSlashNoSpace.length === 6 ? `${noSlashNoSpace.slice(0, 3)}/${noSlashNoSpace.slice(3)}` : noSlashNoSpace;
  return [...new Set([noSlashNoSpace, withSlash, raw, symbol])];
}

async function listOpen(userId, options = {}) {
  const c = await col();
  const { symbol, limit = 100, accountId } = options;
  const filter = { userId, closedAt: null };
  if (accountId) filter.$or = [{ accountId }, { accountId: { $exists: false } }, { accountId: null }];
  if (symbol) filter.symbol = { $in: symbolVariants(symbol) };
  const list = await c.find(filter).sort({ openedAt: -1 }).limit(limit).toArray();
  return list.map((p) => ({ id: p._id.toString(), ...p, _id: undefined }));
}

async function listClosed(userId, options = {}) {
  const c = await col();
  const { symbol, from, to, limit = 50, accountId } = options;
  const filter = { userId, closedAt: { $ne: null } };
  if (accountId) filter.$or = [{ accountId }, { accountId: { $exists: false } }, { accountId: null }];
  if (symbol) filter.symbol = { $in: symbolVariants(symbol) };
  if (from || to) {
    filter.closedAt = {};
    if (from) filter.closedAt.$gte = new Date(from);
    if (to) filter.closedAt.$lte = new Date(to);
  }
  const list = await c.find(filter).sort({ closedAt: -1 }).limit(limit).toArray();
  return list.map((p) => ({ id: p._id.toString(), ...p, _id: undefined }));
}

/** Open positions by symbol that have takeProfit or stopLoss set (for TP/SL execution) */
async function listOpenBySymbolWithTPLS(symbol) {
  if (!symbol) return [];
  const c = await col();
  const symbols = symbolVariants(symbol);
  const list = await c
    .find({
      closedAt: null,
      symbol: { $in: symbols },
    })
    .toArray();
  return list.map((p) => ({ id: p._id.toString(), ...p, _id: undefined }));
}

/** Top users by open position count (for admin dashboard) */
async function listTopUsersByOpenPositions(limit = 10) {
  const c = await col();
  const pipeline = [
    { $match: { closedAt: null } },
    { $group: { _id: '$userId', count: { $sum: 1 }, totalVolume: { $sum: { $ifNull: ['$volume', 0] } } } },
    { $sort: { count: -1, totalVolume: -1 } },
    { $limit: limit },
    { $project: { userId: '$_id', count: 1, totalVolume: 1, _id: 0 } },
  ];
  const list = await c.aggregate(pipeline).toArray();
  return list.map((x) => ({ userId: x.userId, count: x.count || 0, totalVolume: x.totalVolume || 0 }));
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

export default { create, findById, listOpen, listClosed, listTopUsersByOpenPositions, listOpenBySymbolWithTPLS, update };
