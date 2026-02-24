/**
 * IB repository — MongoDB: ib_profiles, ib_commissions, ib_payouts
 */
import { getDb } from '../../config/mongo.js';
import { ObjectId } from 'mongodb';

const PROFILES_COLLECTION = 'ib_profiles';
const COMMISSIONS_COLLECTION = 'ib_commissions';
const PAYOUTS_COLLECTION = 'ib_payouts';

async function profilesCol() {
  const db = await getDb();
  return db.collection(PROFILES_COLLECTION);
}

async function commissionsCol() {
  const db = await getDb();
  return db.collection(COMMISSIONS_COLLECTION);
}

async function payoutsCol() {
  const db = await getDb();
  return db.collection(PAYOUTS_COLLECTION);
}

// ---------- IB profiles ----------
async function createProfile(doc) {
  const col = await profilesCol();
  const now = new Date();
  const { insertedId } = await col.insertOne({
    ...doc,
    createdAt: now,
    updatedAt: now,
  });
  return insertedId.toString();
}

async function getProfileByUserId(userId) {
  const col = await profilesCol();
  const p = await col.findOne({ userId });
  return p ? { id: p._id.toString(), ...p, _id: undefined } : null;
}

async function getProfileById(id) {
  if (!ObjectId.isValid(id)) return null;
  const col = await profilesCol();
  const p = await col.findOne({ _id: new ObjectId(id) });
  return p ? { id: p._id.toString(), ...p, _id: undefined } : null;
}

async function updateProfile(userId, update) {
  const col = await profilesCol();
  const result = await col.findOneAndUpdate(
    { userId },
    { $set: { ...update, updatedAt: new Date() } },
    { returnDocument: 'after' }
  );
  return result ? { id: result._id.toString(), ...result, _id: undefined } : null;
}

/** Get hierarchy depth (level) for an IB: 1 = top, 2 = under level 1, etc. */
async function getHierarchyDepth(userId) {
  const col = await profilesCol();
  let level = 1;
  let current = await col.findOne({ userId });
  while (current?.parentId) {
    level += 1;
    current = await col.findOne({ userId: current.parentId });
  }
  return level;
}

// ---------- Commissions ----------
async function createCommission(doc) {
  const col = await commissionsCol();
  const now = new Date();
  const { insertedId } = await col.insertOne({
    ...doc,
    status: 'pending',
    createdAt: now,
  });
  return insertedId.toString();
}

async function listCommissionsByIb(ibId, options = {}) {
  const col = await commissionsCol();
  const { status, from, to, limit = 100 } = options;
  const filter = { ibId };
  if (status) filter.status = status;
  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = new Date(from);
    if (to) filter.createdAt.$lte = new Date(to);
  }
  const list = await col.find(filter).sort({ createdAt: -1 }).limit(limit).toArray();
  return list.map((c) => ({ id: c._id.toString(), ...c, _id: undefined }));
}

async function sumPendingByIb(ibId) {
  const col = await commissionsCol();
  const result = await col.aggregate([
    { $match: { ibId, status: 'pending' } },
    { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
  ]).next();
  return result ? { total: result.total, count: result.count } : { total: 0, count: 0 };
}

async function markCommissionsPaid(ibId, payoutId, commissionIds) {
  const col = await commissionsCol();
  const idList = commissionIds.filter((id) => ObjectId.isValid(id)).map((id) => new ObjectId(id));
  if (idList.length === 0) return 0;
  const result = await col.updateMany(
    { _id: { $in: idList }, ibId, status: 'pending' },
    { $set: { status: 'paid', paidAt: new Date(), payoutId } }
  );
  return result.modifiedCount;
}

async function markAllPendingPaid(ibId, payoutId) {
  const col = await commissionsCol();
  const result = await col.updateMany(
    { ibId, status: 'pending' },
    { $set: { status: 'paid', paidAt: new Date(), payoutId } }
  );
  return result.modifiedCount;
}

// ---------- Payouts ----------
async function createPayout(doc) {
  const col = await payoutsCol();
  const now = new Date();
  const { insertedId } = await col.insertOne({
    ...doc,
    status: 'pending',
    requestedAt: now,
    updatedAt: now,
  });
  return insertedId.toString();
}

async function getPayoutById(id, ibId) {
  if (!ObjectId.isValid(id)) return null;
  const col = await payoutsCol();
  const p = await col.findOne({ _id: new ObjectId(id), ibId });
  return p ? { id: p._id.toString(), ...p, _id: undefined } : null;
}

async function listPayoutsByIb(ibId, options = {}) {
  const col = await payoutsCol();
  const { status, limit = 50 } = options;
  const filter = { ibId };
  if (status) filter.status = status;
  const list = await col.find(filter).sort({ requestedAt: -1 }).limit(limit).toArray();
  return list.map((p) => ({ id: p._id.toString(), ...p, _id: undefined }));
}

async function updatePayoutStatus(id, ibId, status) {
  if (!ObjectId.isValid(id)) return null;
  const col = await payoutsCol();
  const result = await col.findOneAndUpdate(
    { _id: new ObjectId(id), ibId },
    { $set: { status, updatedAt: new Date() } },
    { returnDocument: 'after' }
  );
  return result ? { id: result._id.toString(), ...result, _id: undefined } : null;
}

async function sumPaidByIb(ibId) {
  const col = await payoutsCol();
  const result = await col.aggregate([
    { $match: { ibId, status: 'paid' } },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]).next();
  return result ? result.total : 0;
}

/** List referrals: clients with commission totals, grouped by clientUserId */
async function listReferralsByIb(ibId, options = {}) {
  const db = await getDb();
  const commCol = db.collection(COMMISSIONS_COLLECTION);
  const usersCol = db.collection('users');
  const { limit = 50 } = options;
  const pipeline = [
    { $match: { ibId, clientUserId: { $ne: null, $exists: true } } },
    {
      $group: {
        _id: '$clientUserId',
        totalCommission: { $sum: '$amount' },
        firstCommissionAt: { $min: '$createdAt' },
        tradeCount: { $sum: 1 },
      },
    },
    { $sort: { firstCommissionAt: -1 } },
    { $limit: limit },
  ];
  const refs = await commCol.aggregate(pipeline).toArray();
  const userIds = refs.map((r) => r._id).filter(Boolean);
  const objectIds = userIds.filter((id) => ObjectId.isValid(id)).map((id) => new ObjectId(id));
  const users = objectIds.length ? await usersCol.find({ _id: { $in: objectIds } }).toArray() : [];
  const userMap = Object.fromEntries(users.map((u) => [u._id.toString(), u]));
  return refs.map((r) => ({
    clientUserId: r._id,
    clientEmail: userMap[String(r._id)]?.email || null,
    totalCommission: Math.round(r.totalCommission * 100) / 100,
    firstCommissionAt: r.firstCommissionAt,
    tradeCount: r.tradeCount,
  }));
}

export default {
  createProfile,
  getProfileByUserId,
  getProfileById,
  updateProfile,
  getHierarchyDepth,
  createCommission,
  listCommissionsByIb,
  sumPendingByIb,
  markCommissionsPaid,
  markAllPendingPaid,
  createPayout,
  getPayoutById,
  listPayoutsByIb,
  updatePayoutStatus,
  sumPaidByIb,
  listReferralsByIb,
};
