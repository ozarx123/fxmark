/**
 * Position repository — MongoDB positions collection
 */
import { randomUUID } from 'crypto';
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

function userIdOrMatch(userId) {
  const uid = String(userId);
  return ObjectId.isValid(uid) && uid.length === 24
    ? [{ userId: uid }, { userId: new ObjectId(uid) }]
    : [{ userId: uid }];
}

/** After this many ms in "processing", another run may reclaim (crash). Set > max distribution duration to avoid overlap. */
const DEFAULT_PAMM_DIST_STALE_MS = 600000;

/**
 * Atomically start or reclaim a PAMM distribution run.
 * - completed / legacy pammDistributionProcessed → cannot start
 * - processing + fresh heartbeat → concurrent run blocked (multi-instance safe)
 * - processing + stale heartbeat (or legacy no-heartbeat + stale startedAt) → reclaim
 * - idle/failed/missing status → claim with new ownerId
 * @returns {{ started: boolean, ownerId?: string, reason: string }}
 */
async function tryStartPammDistribution(positionId, userId) {
  if (!ObjectId.isValid(positionId) || userId == null) {
    return { started: false, reason: 'invalid_args' };
  }
  const staleMs = Math.max(
    60_000,
    parseInt(process.env.PAMM_DISTRIBUTION_STALE_MS || String(DEFAULT_PAMM_DIST_STALE_MS), 10) || DEFAULT_PAMM_DIST_STALE_MS
  );
  const staleBefore = new Date(Date.now() - staleMs);
  const ownerId = randomUUID();
  const now = new Date();
  const c = await col();
  const userOr = userIdOrMatch(userId);

  const processingStale = {
    pammDistributionStatus: 'processing',
    $or: [
      { pammDistributionHeartbeatAt: { $lt: staleBefore } },
      {
        $and: [
          {
            $or: [
              { pammDistributionHeartbeatAt: { $exists: false } },
              { pammDistributionHeartbeatAt: null },
            ],
          },
          { pammDistributionStartedAt: { $lt: staleBefore } },
        ],
      },
    ],
  };

  const updated = await c.findOneAndUpdate(
    {
      _id: new ObjectId(positionId),
      $and: [
        { $or: userOr },
        {
          $nor: [{ pammDistributionStatus: 'completed' }, { pammDistributionProcessed: true }],
        },
        {
          $or: [
            { pammDistributionStatus: { $exists: false } },
            { pammDistributionStatus: null },
            { pammDistributionStatus: 'idle' },
            { pammDistributionStatus: 'failed' },
            processingStale,
          ],
        },
      ],
    },
    {
      $set: {
        pammDistributionStatus: 'processing',
        pammDistributionStartedAt: now,
        pammDistributionOwnerId: ownerId,
        pammDistributionHeartbeatAt: now,
        pammDistributionError: null,
        pammDistributionStats: { totalUsers: 0, successCount: 0, failedCount: 0 },
        pammDistributionFailedUserIds: [],
        updatedAt: now,
      },
    },
    { returnDocument: 'after' }
  );

  if (updated) {
    return { started: true, ownerId, reason: 'started' };
  }

  const doc = await c.findOne(
    { _id: new ObjectId(positionId), $or: userOr },
    {
      projection: {
        pammDistributionStatus: 1,
        pammDistributionProcessed: 1,
        pammDistributionStartedAt: 1,
        pammDistributionHeartbeatAt: 1,
      },
    }
  );
  if (!doc) return { started: false, reason: 'position_not_found' };
  if (doc.pammDistributionStatus === 'completed' || doc.pammDistributionProcessed === true) {
    return { started: false, reason: 'completed' };
  }
  if (doc.pammDistributionStatus === 'processing') {
    return { started: false, reason: 'processing_active' };
  }
  return { started: false, reason: 'not_eligible' };
}

async function touchPammDistributionHeartbeat(positionId, userId, ownerId) {
  if (!ObjectId.isValid(positionId) || userId == null || !ownerId) return;
  const c = await col();
  await c.updateOne(
    {
      _id: new ObjectId(positionId),
      $or: userIdOrMatch(userId),
      pammDistributionOwnerId: String(ownerId),
      pammDistributionStatus: 'processing',
    },
    { $set: { pammDistributionHeartbeatAt: new Date(), updatedAt: new Date() } }
  );
}

async function setPammDistributionStats(positionId, userId, ownerId, stats) {
  if (!ObjectId.isValid(positionId) || userId == null || !ownerId) return;
  const c = await col();
  const failedUserIds = Array.isArray(stats.failedUserIds)
    ? stats.failedUserIds.slice(0, 50).map(String)
    : [];
  await c.updateOne(
    {
      _id: new ObjectId(positionId),
      $or: userIdOrMatch(userId),
      pammDistributionOwnerId: String(ownerId),
      pammDistributionStatus: 'processing',
    },
    {
      $set: {
        pammDistributionStats: {
          totalUsers: Number(stats.totalUsers) || 0,
          successCount: Number(stats.successCount) || 0,
          failedCount: Number(stats.failedCount) || 0,
        },
        pammDistributionFailedUserIds: failedUserIds,
        updatedAt: new Date(),
      },
    }
  );
}

async function markPammDistributionCompleted(positionId, userId, ownerId) {
  if (!ObjectId.isValid(positionId) || userId == null || !ownerId) return;
  const c = await col();
  const now = new Date();
  await c.updateOne(
    {
      _id: new ObjectId(positionId),
      $or: userIdOrMatch(userId),
      pammDistributionOwnerId: String(ownerId),
      pammDistributionStatus: 'processing',
    },
    {
      $set: {
        pammDistributionStatus: 'completed',
        pammDistributionCompletedAt: now,
        pammDistributionProcessed: true,
        pammDistributionError: null,
        pammDistributionHeartbeatAt: now,
        updatedAt: now,
      },
    }
  );
}

async function markPammDistributionFailed(positionId, userId, errorMessage, ownerId) {
  if (!ObjectId.isValid(positionId) || userId == null) return;
  const c = await col();
  const msg = String(errorMessage || 'unknown').slice(0, 500);
  const filter = {
    _id: new ObjectId(positionId),
    $or: userIdOrMatch(userId),
    pammDistributionStatus: 'processing',
  };
  if (ownerId) filter.pammDistributionOwnerId = String(ownerId);
  const now = new Date();
  await c.updateOne(filter, {
    $set: {
      pammDistributionStatus: 'failed',
      pammDistributionError: msg,
      pammDistributionHeartbeatAt: now,
      updatedAt: now,
    },
  });
}

export default {
  create,
  findById,
  listOpen,
  listClosed,
  listTopUsersByOpenPositions,
  listOpenBySymbolWithTPLS,
  update,
  tryStartPammDistribution,
  touchPammDistributionHeartbeat,
  setPammDistributionStats,
  markPammDistributionCompleted,
  markPammDistributionFailed,
};
