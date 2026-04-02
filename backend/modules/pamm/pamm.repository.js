/**
 * Trade Manager / PAMM repository — MongoDB: pamm_managers, pamm_allocations, manager_trades
 */
import { getDb } from '../../config/mongo.js';
import { ObjectId } from 'mongodb';

const MANAGERS_COLLECTION = 'pamm_managers';
const ALLOCATIONS_COLLECTION = 'pamm_allocations';
const TRADES_COLLECTION = 'manager_trades';
const ACCEPTANCE_COLLECTION = 'pamm_investor_acceptance';
const RESERVE_TRANSACTIONS_COLLECTION = 'pamm_reserve_transactions';
const RESERVE_WALLETS_COLLECTION = 'pamm_reserve_wallets';

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

async function acceptanceCol() {
  const db = await getDb();
  return db.collection(ACCEPTANCE_COLLECTION);
}

async function reserveTransactionsCol() {
  const db = await getDb();
  return db.collection(RESERVE_TRANSACTIONS_COLLECTION);
}

async function reserveWalletsCol() {
  const db = await getDb();
  return db.collection(RESERVE_WALLETS_COLLECTION);
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
  if (tradingAccountId == null || tradingAccountId === '') return null;
  const col = await managersCol();
  const idStr = String(tradingAccountId);
  let m = await col.findOne({ tradingAccountId: idStr });
  if (!m && ObjectId.isValid(idStr) && idStr.length === 24) {
    m = await col.findOne({ tradingAccountId: new ObjectId(idStr) });
  }
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
    realizedPnl: 0,
    status: 'active',
    createdAt: now,
    updatedAt: now,
  });
  return insertedId.toString();
}

async function getAllocationById(id, followerId) {
  if (!ObjectId.isValid(id)) return null;
  const col = await allocationsCol();
  const a = await col.findOne({ _id: new ObjectId(id) });
  if (!a) return null;
  if (followerId != null && followerId !== '' && !followerIdMatches(a.followerId, followerId)) {
    return null;
  }
  return { id: a._id.toString(), ...a, _id: undefined, realizedPnl: a.realizedPnl != null ? Number(a.realizedPnl) : 0 };
}

/** Admin: load allocation by id only (caller must verify follower). */
async function getAllocationByIdOnly(allocationId, options = {}) {
  if (!ObjectId.isValid(allocationId)) return null;
  const col = await allocationsCol();
  const q = { _id: new ObjectId(allocationId) };
  const opts = options.session ? { session: options.session } : {};
  const a = await col.findOne(q, opts);
  return a
    ? { id: a._id.toString(), ...a, _id: undefined, realizedPnl: a.realizedPnl != null ? Number(a.realizedPnl) : 0 }
    : null;
}

function followerIdMatches(docFollowerId, userId) {
  const u = String(userId ?? '');
  const f = docFollowerId;
  if (f == null) return false;
  if (String(f) === u) return true;
  try {
    if (ObjectId.isValid(u) && u.length === 24 && f?.equals && f.equals(new ObjectId(u))) return true;
  } catch {
    /* ignore */
  }
  return false;
}

/** Allocations for a user (followerId stored as string or ObjectId). */
async function listAllocationsByFollowerFlexible(userId, options = {}) {
  const col = await allocationsCol();
  const { status, limit = 50 } = options;
  const uid = String(userId ?? '');
  const followerOr = [{ followerId: uid }];
  if (ObjectId.isValid(uid) && uid.length === 24) followerOr.push({ followerId: new ObjectId(uid) });
  const filter = { $or: followerOr };
  if (status) filter.status = status;
  const list = await col.find(filter).sort({ createdAt: -1 }).limit(limit).toArray();
  return list.map((a) => ({
    id: a._id.toString(),
    ...a,
    _id: undefined,
    realizedPnl: a.realizedPnl != null ? Number(a.realizedPnl) : 0,
  }));
}

async function getActiveAllocation(followerId, managerId) {
  const col = await allocationsCol();
  const a = await col.findOne({ followerId, managerId, status: 'active' });
  return a ? { id: a._id.toString(), ...a, _id: undefined, realizedPnl: a.realizedPnl != null ? Number(a.realizedPnl) : 0 } : null;
}

function managerIdMatches(docManagerId, managerId) {
  const u = String(managerId ?? '');
  const f = docManagerId;
  if (f == null) return false;
  if (String(f) === u) return true;
  try {
    if (ObjectId.isValid(u) && u.length === 24 && f?.equals && f.equals(new ObjectId(u))) return true;
  } catch {
    /* ignore */
  }
  return false;
}

function buildFollowerOrConditions(uniqueFollowerIds) {
  const or = [];
  for (const id of uniqueFollowerIds) {
    or.push({ followerId: id });
    if (ObjectId.isValid(id) && id.length === 24) or.push({ followerId: new ObjectId(id) });
  }
  return or;
}

function buildManagerOrConditions(uniqueManagerIds) {
  const or = [];
  for (const id of uniqueManagerIds) {
    or.push({ managerId: id });
    if (ObjectId.isValid(id) && id.length === 24) or.push({ managerId: new ObjectId(id) });
  }
  return or;
}

/**
 * Batch active allocation balances for (followerId, managerId) pairs.
 * One query with $and of follower OR and manager OR, then pair match in memory (no per-pair round trips).
 * @returns {Map<string, number|null>} key `${followerId}:${managerId}` -> allocatedBalance or null
 */
async function getActiveAllocationBalancesForPairs(pairs) {
  const map = new Map();
  if (!pairs?.length) return map;
  const normalized = pairs.map((p) => ({
    followerId: String(p.followerId ?? '').trim(),
    managerId: String(p.managerId ?? '').trim(),
  }));
  const uniqueFollowers = [...new Set(normalized.map((p) => p.followerId).filter(Boolean))];
  const uniqueManagers = [...new Set(normalized.map((p) => p.managerId).filter(Boolean))];
  if (!uniqueFollowers.length || !uniqueManagers.length) return map;

  const col = await allocationsCol();
  const followerOr = buildFollowerOrConditions(uniqueFollowers);
  const managerOr = buildManagerOrConditions(uniqueManagers);
  const docs = await col
    .find({
      status: 'active',
      $and: [{ $or: followerOr }, { $or: managerOr }],
    })
    .toArray();

  for (const p of normalized) {
    const key = `${p.followerId}:${p.managerId}`;
    if (map.has(key)) continue;
    const a = docs.find(
      (d) => followerIdMatches(d.followerId, p.followerId) && managerIdMatches(d.managerId, p.managerId)
    );
    map.set(key, a != null ? Number(a.allocatedBalance) : null);
  }
  return map;
}

async function listAllocationsByFollower(followerId, options = {}) {
  const col = await allocationsCol();
  const { status, limit = 50 } = options;
  const filter = { followerId };
  if (status) filter.status = status;
  const list = await col.find(filter).sort({ createdAt: -1 }).limit(limit).toArray();
  return list.map((a) => ({
    id: a._id.toString(),
    ...a,
    _id: undefined,
    realizedPnl: a.realizedPnl != null ? Number(a.realizedPnl) : 0,
  }));
}

async function listAllocationsByManager(managerId, options = {}) {
  if (managerId == null || managerId === '') return [];
  const col = await allocationsCol();
  const { status, limit = 50 } = options;
  const idStr = String(managerId);
  const filter = idStr.length === 24 && ObjectId.isValid(idStr)
    ? { $or: [{ managerId: idStr }, { managerId: new ObjectId(idStr) }] }
    : { managerId: idStr };
  if (status) filter.status = status;
  const list = await col.find(filter).sort({ createdAt: -1 }).limit(limit).toArray();
  return list.map((a) => ({
    id: a._id.toString(),
    ...a,
    _id: undefined,
    realizedPnl: a.realizedPnl != null ? Number(a.realizedPnl) : 0,
  }));
}

async function updateAllocation(id, update, options = {}) {
  const col = await allocationsCol();
  if (!ObjectId.isValid(id)) return null;
  const opts = { returnDocument: 'after' };
  if (options.session) opts.session = options.session;
  const result = await col.findOneAndUpdate(
    { _id: new ObjectId(id) },
    { $set: { ...update, updatedAt: new Date() } },
    opts
  );
  return result ? { id: result._id.toString(), ...result, _id: undefined } : null;
}

/** Increment realized P&L on an allocation (when PAMM distributes P&L to investor) */
async function incrementAllocationRealizedPnl(allocationId, amount, options = {}) {
  if (!ObjectId.isValid(allocationId)) return null;
  const col = await allocationsCol();
  const opts = { returnDocument: 'after' };
  if (options.session) opts.session = options.session;
  const result = await col.findOneAndUpdate(
    { _id: new ObjectId(allocationId) },
    { $inc: { realizedPnl: Number(amount) || 0 }, $set: { updatedAt: new Date() } },
    opts
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

/** Sum of realized P&L for a fund (all manager_trades). Used for fund growth rate. */
async function getFundCumulativePnl(fundId) {
  const col = await tradesCol();
  const result = await col.aggregate([
    { $match: { managerId: fundId, excludedFromFundMetrics: { $ne: true } } },
    { $group: { _id: null, total: { $sum: '$pnl' } } },
  ]).next();
  return result ? (result.total || 0) : 0;
}

/** Trades for Bull Run: today's PnL sum and monthly PnL by month (year-month key). */
async function getFundTradesPnLByPeriod(fundId) {
  const col = await tradesCol();
  const trades = await col.find({ managerId: fundId }).sort({ createdAt: 1 }).toArray();
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let todayProfit = 0;
  const byMonth = {};
  for (const t of trades) {
    if (t.excludedFromFundMetrics === true) continue;
    const pnl = Number(t.pnl) || 0;
    const created = t.createdAt ? new Date(t.createdAt) : null;
    if (created && created >= todayStart) todayProfit += pnl;
    if (created) {
      const key = `${created.getFullYear()}-${String(created.getMonth() + 1).padStart(2, '0')}`;
      if (!byMonth[key]) byMonth[key] = { sum: 0, month: created.toLocaleString('en-US', { month: 'long' }), year: created.getFullYear() };
      byMonth[key].sum += pnl;
    }
  }
  const monthlyPerformance = Object.entries(byMonth)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-12)
    .map(([, v]) => ({ month: v.month, year: v.year, profit: v.sum, profitPercent: null }));
  return { todayProfit, monthlyPerformance, allTrades: trades };
}

/**
 * After an economic rollback, the trade row stays for history but must not drive investor % / charts.
 * Idempotent: safe to call multiple times.
 */
async function excludeTradeFromFundMetrics(positionId) {
  if (!positionId) return { modifiedCount: 0 };
  const col = await tradesCol();
  const pid = String(positionId);
  const or = [{ positionId: pid }];
  if (ObjectId.isValid(pid) && pid.length === 24) or.push({ positionId: new ObjectId(pid) });
  const now = new Date();
  const r = await col.updateMany(
    { $or: or },
    { $set: { excludedFromFundMetrics: true, excludedFromFundMetricsAt: now } }
  );
  return { modifiedCount: r.modifiedCount };
}

/** Resolve PAMM fund id from a closed position id (manager_trades stores positionId). */
async function getFundIdByPositionId(positionId) {
  if (!positionId) return null;
  const col = await tradesCol();
  const t = await col.findOne({ positionId: String(positionId) });
  return t?.managerId ?? null;
}

/** Increment Bull Run reserve (fundType 'ai'). Uses $inc for reserveBalance on pamm_managers. */
async function incrementFundReserve(fundId, amount, options = {}) {
  if (!ObjectId.isValid(fundId) || !Number.isFinite(amount)) return null;
  const col = await managersCol();
  const opts = { returnDocument: 'after' };
  if (options.session) opts.session = options.session;
  const result = await col.findOneAndUpdate(
    { _id: new ObjectId(fundId) },
    { $inc: { reserveBalance: Number(amount) }, $set: { updatedAt: new Date() } },
    opts
  );
  return result ? (result.reserveBalance != null ? Number(result.reserveBalance) : 0) : null;
}

// ---------- Investor terms acceptance (Bull Run) ----------
/** Record that investor accepted terms for a strategy/fund before following. */
async function recordAcceptance(investorId, strategyId, acceptedTerms, ipAddress) {
  const col = await acceptanceCol();
  const now = new Date();
  await col.insertOne({
    investorId: String(investorId),
    strategyId: String(strategyId),
    acceptedTerms: !!acceptedTerms,
    acceptanceTimestamp: now,
    ipAddress: ipAddress || null,
  });
}

/** Check if investor has already accepted terms for this strategy/fund. */
async function hasAccepted(investorId, strategyId) {
  const col = await acceptanceCol();
  const doc = await col.findOne({
    investorId: String(investorId),
    strategyId: String(strategyId),
    acceptedTerms: true,
  });
  return !!doc;
}

async function listReserveTransactionsByFund(fundId, options = {}) {
  const col = await reserveTransactionsCol();
  const limit = Math.max(1, Math.min(Number(options.limit) || 50, 200));
  const list = await col
    .find({ fundId: String(fundId) })
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();
  return list.map((t) => ({ id: t._id.toString(), ...t, _id: undefined }));
}

async function getReserveWalletByFund(fundId) {
  const col = await reserveWalletsCol();
  const doc = await col.findOne({ fundId: String(fundId), walletType: 'pamm_ai_reserve' });
  return doc
    ? {
        id: doc._id.toString(),
        fundId: String(doc.fundId),
        managerId: String(doc.managerId || ''),
        currency: doc.currency || 'USD',
        walletType: doc.walletType || 'pamm_ai_reserve',
        balance: Number(doc.balance) || 0,
        status: doc.status || 'active',
        createdAt: doc.createdAt || null,
        updatedAt: doc.updatedAt || null,
      }
    : null;
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
  getAllocationByIdOnly,
  followerIdMatches,
  listAllocationsByFollowerFlexible,
  getActiveAllocation,
  getActiveAllocationBalancesForPairs,
  listAllocationsByFollower,
  listAllocationsByManager,
  updateAllocation,
  incrementAllocationRealizedPnl,
  createTrade,
  listTradesByManager,
  getFundCumulativePnl,
  getFundTradesPnLByPeriod,
  excludeTradeFromFundMetrics,
  getFundIdByPositionId,
  incrementFundReserve,
  recordAcceptance,
  hasAccepted,
  listReserveTransactionsByFund,
  getReserveWalletByFund,
};
