/**
 * IB repository — MongoDB: ib_profiles, ib_commissions, ib_payouts
 */
import { randomBytes } from 'crypto';
import { getDb } from '../../config/mongo.js';
import { ObjectId } from 'mongodb';
import userRepo from '../users/user.repository.js';
import pammRepo from '../pamm/pamm.repository.js';

function generateReferralCode() {
  return randomBytes(9)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
    .slice(0, 12);
}

const PROFILES_COLLECTION = 'ib_profiles';
const COMMISSIONS_COLLECTION = 'ib_commissions';
const PAYOUTS_COLLECTION = 'ib_payouts';
const SETTINGS_COLLECTION = 'ib_settings';
const SETTINGS_ID = 'default';
const PAMM_IB_COMMISSION_SETTINGS_ID = 'pamm_ib_commission';
const PAMM_IB_COMMISSION_LOGS_COLLECTION = 'pamm_ib_commission_logs';
const PAMM_INVESTOR_DAILY_PROFIT_COLLECTION = 'pamm_investor_daily_profit';
const COMPANY_COMMISSION_POOL_COLLECTION = 'company_commission_pool';

function getTodayUtcString() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

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

async function settingsCol() {
  const db = await getDb();
  return db.collection(SETTINGS_COLLECTION);
}

// ---------- IB profiles ----------
async function createProfile(doc) {
  const col = await profilesCol();
  const now = new Date();
  let referralCode = doc.referralCode;
  if (!referralCode) {
    referralCode = generateReferralCode();
    for (let i = 0; i < 5; i++) {
          const existing = await col.findOne({ referralCode });
          if (!existing) break;
          referralCode = generateReferralCode();
        }
  }
  const { insertedId } = await col.insertOne({
    ...doc,
    referralCode,
    createdAt: now,
    updatedAt: now,
  });
  return insertedId.toString();
}

/** Get IB profile by referral code (for share/referral links) */
async function getProfileByReferralCode(referralCode) {
  const code = typeof referralCode === 'string' ? referralCode.trim() : '';
  if (!code) return null;
  const col = await profilesCol();
  const p = await col.findOne({ referralCode: code });
  return p ? { id: p._id.toString(), ...p, _id: undefined } : null;
}

async function getProfileByUserId(userId) {
  if (userId == null) return null;
  const col = await profilesCol();
  const idStr = String(userId).trim();
  let p = await col.findOne({ userId: idStr });
  if (!p && ObjectId.isValid(idStr) && idStr.length === 24) {
    p = await col.findOne({ userId: new ObjectId(idStr) });
  }
  if (!p) return null;
  if (!p.referralCode) {
    const referralCode = generateReferralCode();
    const existing = await col.findOne({ referralCode });
    if (!existing) {
      await col.updateOne({ _id: p._id }, { $set: { referralCode, updatedAt: new Date() } });
      p = await col.findOne({ _id: p._id });
    }
  }
  return p ? { id: p._id.toString(), ...p, _id: undefined } : null;
}

async function getProfileById(id) {
  if (!ObjectId.isValid(id)) return null;
  const col = await profilesCol();
  let p = await col.findOne({ _id: new ObjectId(id) });
  if (!p) return null;
  if (!p.referralCode) {
    const referralCode = generateReferralCode();
    const existing = await col.findOne({ referralCode });
    if (!existing) {
      await col.updateOne({ _id: new ObjectId(id) }, { $set: { referralCode, updatedAt: new Date() } });
      p = await col.findOne({ _id: new ObjectId(id) });
    }
  }
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

/** List all IB profiles (admin) */
async function listAllProfiles(options = {}) {
  const col = await profilesCol();
  const { limit = 200 } = options;
  const list = await col.find({}).sort({ createdAt: -1 }).limit(limit).toArray();
  return list.map((p) => ({ id: p._id.toString(), ...p, _id: undefined }));
}

/** List commissions across all IBs (admin). Optional filter by ibId, status. */
async function listCommissionsAll(options = {}) {
  const col = await commissionsCol();
  const { ibId, status, limit = 200 } = options;
  const filter = {};
  if (ibId) filter.ibId = ibId;
  if (status) filter.status = status;
  const list = await col.find(filter).sort({ createdAt: -1 }).limit(limit).toArray();
  return list.map((c) => ({ id: c._id.toString(), ...c, _id: undefined }));
}

/** Get IB commission settings (default rates by level) */
async function getSettings() {
  const col = await settingsCol();
  const doc = await col.findOne({ _id: SETTINGS_ID });
  return doc ? doc.ratePerLotByLevel || null : null;
}

/** Update IB commission settings */
async function updateSettings(ratePerLotByLevel) {
  const col = await settingsCol();
  await col.updateOne(
    { _id: SETTINGS_ID },
    { $set: { ratePerLotByLevel, updatedAt: new Date() } },
    { upsert: true }
  );
  return ratePerLotByLevel;
}

/** Admin: rates + optional default house IB (user id with ib_profiles). */
async function getIbSettingsForAdmin() {
  const col = await settingsCol();
  const doc = await col.findOne({ _id: SETTINGS_ID });
  const storedRates = doc?.ratePerLotByLevel || null;
  const defaults = { 1: 7, 2: 5, 3: 3, 4: 2, 5: 1 };
  const envFallback = (process.env.DEFAULT_IB_REFERRER_USER_ID || '').trim();
  let defaultReferrerUserId = null;
  if (doc?.defaultReferrerUserId != null && String(doc.defaultReferrerUserId).trim() !== '') {
    defaultReferrerUserId = String(doc.defaultReferrerUserId).trim();
  }
  return {
    ratePerLotByLevel: storedRates || defaults,
    defaultReferrerUserId,
    defaultReferrerUsesEnvFallback: !defaultReferrerUserId && !!envFallback,
    envDefaultReferrerUserId: envFallback || null,
  };
}

/**
 * Merge partial IB settings (admin).
 * defaultReferrerUserId: string sets value; null or '' clears stored override (env may still apply).
 */
async function updateIbSettingsMerged({ ratePerLotByLevel, defaultReferrerUserId } = {}) {
  const col = await settingsCol();
  const $set = { updatedAt: new Date() };
  const $unset = {};
  if (ratePerLotByLevel != null && typeof ratePerLotByLevel === 'object') {
    $set.ratePerLotByLevel = ratePerLotByLevel;
  }
  if (defaultReferrerUserId !== undefined) {
    if (defaultReferrerUserId === null || defaultReferrerUserId === '') {
      $unset.defaultReferrerUserId = '';
    } else {
      $set.defaultReferrerUserId = String(defaultReferrerUserId).trim();
    }
  }
  const updateOp = { $set };
  if (Object.keys($unset).length) updateOp.$unset = $unset;
  await col.updateOne({ _id: SETTINGS_ID }, updateOp, { upsert: true });
  return getIbSettingsForAdmin();
}

/**
 * Effective default IB user id for direct signups: DB default, else env; must resolve to users + ib_profiles.
 */
async function resolveEffectiveDefaultReferrerUserId() {
  const col = await settingsCol();
  const doc = await col.findOne({ _id: SETTINGS_ID });
  let raw = '';
  if (doc?.defaultReferrerUserId != null && String(doc.defaultReferrerUserId).trim() !== '') {
    raw = String(doc.defaultReferrerUserId).trim();
  } else {
    raw = (process.env.DEFAULT_IB_REFERRER_USER_ID || '').trim();
  }
  if (!raw) return null;
  const ibProfile =
    (await getProfileByUserId(raw)) || (await getProfileByReferralCode(raw)) || (await getProfileById(raw));
  if (!ibProfile?.userId) {
    console.warn(
      `[ib] Default referrer "${raw}" is not a valid IB (no ib_profiles match). Direct signups get no referrer.`
    );
    return null;
  }
  const uid = String(ibProfile.userId);
  const user = await userRepo.findById(uid);
  if (!user) {
    console.warn(`[ib] Default referrer user "${uid}" not found in users. Direct signups get no referrer.`);
    return null;
  }
  return uid;
}

/** Update ib_profiles.parentId for an IB user (string/ObjectId userId in document). */
async function updateIbParentByUserId(ibUserId, parentUserId) {
  const col = await profilesCol();
  const idStr = String(ibUserId).trim();
  const filter =
    ObjectId.isValid(idStr) && idStr.length === 24
      ? { $or: [{ userId: idStr }, { userId: new ObjectId(idStr) }] }
      : { userId: idStr };
  const parentVal =
    parentUserId == null || parentUserId === '' ? null : String(parentUserId).trim();
  const result = await col.findOneAndUpdate(
    filter,
    { $set: { parentId: parentVal, updatedAt: new Date() } },
    { returnDocument: 'after' }
  );
  return result ? { id: result._id.toString(), ...result, _id: undefined } : null;
}

// ---------- PAMM Bull Run investor IB commission (active capital × level %) ----------
const PAMM_IB_DEFAULT_LEVELS = {
  1: { daily_payout_percent: 0.25, status: 'enabled' },
  2: { daily_payout_percent: 0.15, status: 'enabled' },
  3: { daily_payout_percent: 0.10, status: 'enabled' },
};

async function pammIbCommissionLogsCol() {
  const db = await getDb();
  return db.collection(PAMM_IB_COMMISSION_LOGS_COLLECTION);
}

let pammIbPayoutIndexEnsured = false;
async function ensurePammIbPayoutUniqueIndex() {
  if (pammIbPayoutIndexEnsured) return;
  const col = await pammIbCommissionLogsCol();
  try {
    await col.createIndex(
      { trade_id: 1, investor_id: 1, ib_id: 1, level_number: 1 },
      {
        unique: true,
        name: 'pamm_ib_payout_trade_investor_ib_level',
        partialFilterExpression: { commission_amount: { $gte: 0.001 } },
      }
    );
  } catch (e) {
    if (e?.code !== 11000) console.warn('[ib] pamm_ib payout unique index:', e.message);
  }
  try {
    await col.createIndex(
      { investor_id: 1, created_at: -1 },
      { name: 'pamm_ib_commission_investor_created' }
    );
  } catch (e) {
    if (e?.code !== 11000) console.warn('[ib] pamm_ib commission investor index:', e.message);
  }
  pammIbPayoutIndexEnsured = true;
}

/** Paid PAMM IB row for this trade / investor / IB / level (commission_amount >= 0.001). */
async function findPammIbPayoutLog(tradeId, investorId, ibId, levelNumber) {
  await ensurePammIbPayoutUniqueIndex();
  const col = await pammIbCommissionLogsCol();
  return col.findOne({
    trade_id: tradeId,
    investor_id: String(investorId),
    ib_id: String(ibId),
    level_number: levelNumber,
    commission_amount: { $gte: 0.001 },
  });
}

/** Get PAMM investor IB commission settings (levels 1–3 only). */
async function getPammIbCommissionSettings() {
  const col = await settingsCol();
  const doc = await col.findOne({ _id: PAMM_IB_COMMISSION_SETTINGS_ID });
  if (!doc || !doc.levels) return { levels: { ...PAMM_IB_DEFAULT_LEVELS } };
  const levels = { ...PAMM_IB_DEFAULT_LEVELS };
  for (const [k, v] of Object.entries(doc.levels || {})) {
    const levelNum = parseInt(k, 10);
    if (levelNum >= 1 && levelNum <= 3 && v && typeof v === 'object') {
      levels[levelNum] = {
        daily_payout_percent: Number(v.daily_payout_percent) ?? PAMM_IB_DEFAULT_LEVELS[levelNum]?.daily_payout_percent ?? 0,
        status: v.status === 'disabled' ? 'disabled' : 'enabled',
        updated_by: v.updated_by || null,
        updated_at: v.updated_at || null,
      };
    }
  }
  return { levels };
}

/** Update PAMM investor IB commission settings. levels: { 1: { daily_payout_percent, status }, 2: {...}, 3: {...} }, updatedBy: userId */
async function updatePammIbCommissionSettings(levels, updatedBy) {
  const col = await settingsCol();
  const now = new Date();
  const normalized = {};
  for (const [k, v] of Object.entries(levels || {})) {
    const levelNum = parseInt(k, 10);
    if (levelNum < 1 || levelNum > 3) continue;
    const percent = Number(v?.daily_payout_percent);
    const status = v?.status === 'disabled' ? 'disabled' : 'enabled';
    normalized[levelNum] = {
      daily_payout_percent: Number.isFinite(percent) ? percent : (PAMM_IB_DEFAULT_LEVELS[levelNum]?.daily_payout_percent ?? 0),
      status,
      updated_by: updatedBy || null,
      updated_at: now,
    };
  }
  const doc = await col.findOne({ _id: PAMM_IB_COMMISSION_SETTINGS_ID });
  const merged = doc?.levels ? { ...doc.levels } : { ...PAMM_IB_DEFAULT_LEVELS };
  for (const [k, val] of Object.entries(normalized)) merged[k] = val;
  await col.updateOne(
    { _id: PAMM_IB_COMMISSION_SETTINGS_ID },
    { $set: { levels: merged, updatedAt: now } },
    { upsert: true }
  );
  return getPammIbCommissionSettings();
}

/** List PAMM IB commission logs for a trade (position id). */
async function listPammIbCommissionLogsByTradeId(tradeId) {
  if (!tradeId) return [];
  const col = await pammIbCommissionLogsCol();
  const tid = String(tradeId);
  const or = [{ trade_id: tid }];
  if (ObjectId.isValid(tid) && tid.length === 24) or.push({ trade_id: new ObjectId(tid) });
  const list = await col.find({ $or: or }).toArray();
  return list;
}

/** Delete PAMM IB commission logs for a trade (after wallet/ledger rollback). */
async function deletePammIbCommissionLogsByTradeId(tradeId, options = {}) {
  if (!tradeId) return { deletedCount: 0 };
  const col = await pammIbCommissionLogsCol();
  const tid = String(tradeId);
  const or = [{ trade_id: tid }];
  if (ObjectId.isValid(tid) && tid.length === 24) or.push({ trade_id: new ObjectId(tid) });
  const opts = options.session ? { session: options.session } : {};
  const r = await col.deleteMany({ $or: or }, opts);
  return { deletedCount: r.deletedCount };
}

/** Remove company commission pool rows tied to a trade (IB cap overflow). */
async function deleteCompanyCommissionPoolByTradeId(tradeId, options = {}) {
  if (!tradeId) return { deletedCount: 0 };
  const db = await getDb();
  const col = db.collection(COMPANY_COMMISSION_POOL_COLLECTION);
  const tid = String(tradeId);
  const or = [{ trade_id: tid }];
  if (ObjectId.isValid(tid) && tid.length === 24) or.push({ trade_id: new ObjectId(tid) });
  const opts = options.session ? { session: options.session } : {};
  const r = await col.deleteMany({ $or: or }, opts);
  return { deletedCount: r.deletedCount };
}

/** Create PAMM IB commission log entry. */
async function createPammIbCommissionLog(doc) {
  await ensurePammIbPayoutUniqueIndex();
  const col = await pammIbCommissionLogsCol();
  const toInsert = { ...doc, created_at: new Date() };
  const { insertedId } = await col.insertOne(toInsert);
  return insertedId.toString();
}

/** Insert overflow from PAMM IB daily cap into company commission pool. */
async function createCompanyCommissionPoolEntry(doc) {
  const db = await getDb();
  const col = db.collection(COMPANY_COMMISSION_POOL_COLLECTION);
  const toInsert = { ...doc, created_at: doc.created_at || new Date() };
  const { insertedId } = await col.insertOne(toInsert);
  return insertedId.toString();
}

/**
 * List company commission pool (common pool) entries — overflow from PAMM IB daily cap.
 * @param {object} options - { from?: Date, to?: Date, limit?: number }
 * @returns {Promise<{ entries: object[], totalAmount: number }>}
 */
async function listCompanyCommissionPoolEntries(options = {}) {
  const db = await getDb();
  const col = db.collection(COMPANY_COMMISSION_POOL_COLLECTION);
  const { from, to, limit = 500 } = options;
  const filter = {};
  if (from != null || to != null) {
    filter.created_at = {};
    if (from != null) filter.created_at.$gte = new Date(from);
    if (to != null) filter.created_at.$lte = new Date(to);
  }
  const list = await col
    .find(filter)
    .sort({ created_at: -1 })
    .limit(limit)
    .toArray();
  const entries = list.map((c) => ({
    id: c._id?.toString(),
    source: c.source,
    ib_id: c.ib_id,
    investor_id: c.investor_id,
    trade_id: c.trade_id,
    level_number: c.level_number,
    amount: c.amount,
    created_at: c.created_at,
  }));
  const totalAmount = list.reduce((s, c) => s + (Number(c.amount) || 0), 0);
  return { entries, totalAmount: Math.round(totalAmount * 100) / 100 };
}

async function pammInvestorDailyProfitCol() {
  const db = await getDb();
  return db.collection(PAMM_INVESTOR_DAILY_PROFIT_COLLECTION);
}

/**
 * Increment today's credited profit for an investor (Bull Run). Used for progressive IB payout.
 * @param {string} investorId - normalized user id
 * @param {number} amount - profit credited this trade
 * @returns {Promise<number>} new total credited today for this investor
 */
async function incrementPammInvestorDailyCreditedProfit(investorId, amount, options = {}) {
  if (!investorId || amount == null) return 0;
  const col = await pammInvestorDailyProfitCol();
  const todayStr = getTodayUtcString();
  const inc = Number(amount) || 0;
  const opts = { upsert: true, returnDocument: 'after' };
  if (options.session) opts.session = options.session;
  const result = await col.findOneAndUpdate(
    { investor_id: String(investorId), date_utc: todayStr },
    { $inc: { credited_profit: inc } },
    opts
  );
  return Number(result?.credited_profit) ?? 0;
}

/**
 * Get today's total credited profit for an investor (Bull Run). UTC day.
 */
async function getPammInvestorDailyCreditedProfit(investorId) {
  if (!investorId) return 0;
  const col = await pammInvestorDailyProfitCol();
  const todayStr = getTodayUtcString();
  const doc = await col.findOne({ investor_id: String(investorId), date_utc: todayStr });
  return Number(doc?.credited_profit) ?? 0;
}

/**
 * Sum of PAMM IB commission already paid today for (investor, ib). UTC day. Used for progressive cap.
 */
async function getPammIbCommissionPaidToday(investorId, ibId) {
  if (!investorId || !ibId) return 0;
  const col = await pammIbCommissionLogsCol();
  const now = new Date();
  const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000 - 1);
  const idStr = String(investorId);
  const ibStr = String(ibId);
  const investorOr = ObjectId.isValid(idStr) && idStr.length === 24
    ? [{ investor_id: idStr }, { investor_id: new ObjectId(idStr) }]
    : [{ investor_id: idStr }];
  const ibOr = ObjectId.isValid(ibStr) && ibStr.length === 24
    ? [{ ib_id: ibStr }, { ib_id: new ObjectId(ibStr) }]
    : [{ ib_id: ibStr }];
  const result = await col.aggregate([
    {
      $match: {
        $and: [
          { $or: investorOr },
          { $or: ibOr },
          { created_at: { $gte: startOfDay, $lte: endOfDay } },
        ],
      },
    },
    { $group: { _id: null, total: { $sum: '$commission_amount' } } },
  ]).next();
  return result ? Math.round((result.total || 0) * 100) / 100 : 0;
}

/**
 * List PAMM IB commission log entries, optionally filtered by date.
 * @param {object} options - { from?: Date, to?: Date, limit?: number }. If from/to omitted, uses today (UTC).
 * @returns {Promise<object[]>} Logs with id, ib_id, investor_id, pool_id, trade_id, active_capital_base, commission_percent, commission_amount, level_number, created_at
 */
async function listPammIbCommissionLogs(options = {}) {
  const col = await pammIbCommissionLogsCol();
  const { from, to, limit = 500 } = options;
  const filter = {};
  if (from != null || to != null) {
    filter.created_at = {};
    if (from != null) filter.created_at.$gte = new Date(from);
    if (to != null) filter.created_at.$lte = new Date(to);
  } else {
    const now = new Date();
    const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000 - 1);
    filter.created_at = { $gte: startOfDay, $lte: endOfDay };
  }
  const list = await col
    .find(filter)
    .sort({ created_at: -1 })
    .limit(limit)
    .toArray();
  return list.map((c) => ({
    id: c._id?.toString(),
    ib_id: c.ib_id,
    investor_id: c.investor_id,
    pool_id: c.pool_id,
    trade_id: c.trade_id,
    active_capital_base: c.active_capital_base,
    commission_percent: c.commission_percent,
    commission_amount: c.commission_amount,
    level_number: c.level_number,
    created_at: c.created_at,
  }));
}

/**
 * List PAMM IB commission logs for a specific IB (for IB dashboard).
 * @param {string} ibId - IB user id
 * @param {object} options - { from?: Date, to?: Date, limit?: number }. Default last 30 days if from/to omitted.
 * @returns {Promise<object[]>} Same shape as listPammIbCommissionLogs
 */
async function listPammIbCommissionLogsForIb(ibId, options = {}) {
  if (!ibId) return [];
  const col = await pammIbCommissionLogsCol();
  const { from, to, limit = 200 } = options;
  const idStr = String(ibId).trim();
  const orConditions = [{ ib_id: idStr }];
  if (ObjectId.isValid(idStr) && idStr.length === 24) {
    orConditions.push({ ib_id: new ObjectId(idStr) });
  }
  const filter = { $or: orConditions };
  if (from != null || to != null) {
    filter.created_at = {};
    if (from != null) filter.created_at.$gte = new Date(from);
    if (to != null) filter.created_at.$lte = new Date(to);
  } else {
    const now = new Date();
    const startOfTodayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const start = new Date(startOfTodayUtc.getTime() - 30 * 24 * 60 * 60 * 1000);
    const endWithBuffer = new Date(now.getTime() + 60 * 1000);
    filter.created_at = { $gte: start, $lte: endWithBuffer };
  }
  const list = await col
    .find(filter)
    .sort({ created_at: -1 })
    .limit(limit)
    .toArray();
  return list.map((c) => ({
    id: c._id?.toString(),
    ib_id: c.ib_id != null ? String(c.ib_id) : undefined,
    investor_id: c.investor_id != null ? String(c.investor_id) : undefined,
    pool_id: c.pool_id,
    trade_id: c.trade_id,
    active_capital_base: c.active_capital_base,
    commission_percent: c.commission_percent,
    commission_amount: c.commission_amount,
    level_number: c.level_number,
    created_at: c.created_at,
  }));
}

/** IB dashboard: hide PAMM commission rows before this instant (UTC). Override with options.startDate (ISO). */
const PAMM_IB_DASHBOARD_MIN_CREATED_AT = new Date('2026-03-30T00:00:00.000Z');

/**
 * Merge IB dashboard date options with minimum visible date. Does not change listPammIbCommissionLogsForIb behavior when called without these options (e.g. audit scripts).
 * @param {object} options - { from?, to?, limit?, startDate? }
 */
function resolvePammIbDashboardCommissionQueryOptions(options = {}) {
  const minStart =
    options.startDate != null && !Number.isNaN(new Date(options.startDate).getTime())
      ? new Date(options.startDate)
      : PAMM_IB_DASHBOARD_MIN_CREATED_AT;

  const limit = options.limit != null ? Math.min(Number(options.limit) || 200, 200) : 200;

  const rawFrom = options.from;
  const rawTo = options.to;

  if (rawFrom != null || rawTo != null) {
    const from = rawFrom != null ? new Date(rawFrom) : minStart;
    const effectiveFrom = from.getTime() < minStart.getTime() ? minStart : from;
    const out = { limit, from: effectiveFrom };
    if (rawTo != null) out.to = new Date(rawTo);
    return out;
  }

  const now = new Date();
  const startOfTodayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const windowStart = new Date(startOfTodayUtc.getTime() - 30 * 24 * 60 * 60 * 1000);
  const effectiveFrom = windowStart.getTime() < minStart.getTime() ? minStart : windowStart;
  const endWithBuffer = new Date(now.getTime() + 60 * 1000);
  return { limit, from: effectiveFrom, to: endWithBuffer };
}

/**
 * PAMM IB commission rows for dashboard with investor + invested amount (read-only enrichment).
 * @returns {{ total30d: number, commissions: object[] }}
 */
async function listPammIbCommissionLogsWithInvestorDetails(ibId, options = {}) {
  await ensurePammIbPayoutUniqueIndex();
  const queryOpts = resolvePammIbDashboardCommissionQueryOptions(options);
  const logs = await listPammIbCommissionLogsForIb(ibId, queryOpts);
  if (!logs.length) {
    return { total30d: 0, commissions: [] };
  }

  const investorIds = [...new Set(logs.map((l) => l.investor_id).filter(Boolean))];
  const pairKeys = new Map();
  for (const l of logs) {
    if (l.investor_id && l.pool_id != null) {
      const k = `${l.investor_id}:${String(l.pool_id)}`;
      if (!pairKeys.has(k)) {
        pairKeys.set(k, { followerId: l.investor_id, managerId: String(l.pool_id) });
      }
    }
  }
  const pairs = [...pairKeys.values()];

  const [userMap, allocMap] = await Promise.all([
    userRepo.findManyByIds(investorIds),
    pammRepo.getActiveAllocationBalancesForPairs(pairs),
  ]);

  const commissions = logs.map((c) => {
    const invId = c.investor_id;
    const u = invId ? userMap.get(invId) : null;
    const investorAccountNumber = u?.accountNo != null ? u.accountNo : null;
    const poolKey = invId != null && c.pool_id != null ? `${invId}:${String(c.pool_id)}` : null;
    let invested = poolKey ? allocMap.get(poolKey) : null;
    if (invested == null || Number.isNaN(invested)) {
      invested = c.active_capital_base != null ? Number(c.active_capital_base) : 0;
    } else {
      invested = Number(invested);
    }
    const amt = Number(c.commission_amount ?? 0);
    const levNum = c.level_number;
    const levLabel = levNum != null && Number.isFinite(Number(levNum)) ? `L${levNum}` : '—';
    const created = c.created_at instanceof Date ? c.created_at : new Date(c.created_at);
    return {
      id: c.id,
      date: created.toISOString(),
      level: levLabel,
      commissionAmount: Math.round(amt * 100) / 100,
      investedAmount: Math.round(invested * 100) / 100,
      investorAccountNumber,
      investor: {
        id: invId || '',
        accountNumber: investorAccountNumber,
      },
    };
  });

  const total30d = commissions
    .filter((x) => x.commissionAmount > 0)
    .reduce((s, x) => s + x.commissionAmount, 0);

  return { total30d: Math.round(total30d * 100) / 100, commissions };
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

/**
 * Resolve a PAMM followerId to the canonical user _id string for IB chain lookup.
 * Handles ObjectId/string mismatch so getUplineChainForClient receives users._id.
 * @param {*} followerId - alloc.followerId (may be ObjectId or string)
 * @returns {Promise<string|null>} String(user._id) or null if user not found
 */
async function resolveUserIdFromFollowerId(followerId) {
  if (followerId == null) return null;
  const idStr = String(followerId).trim();
  if (!idStr) return null;
  const db = await getDb();
  const usersCol = db.collection('users');
  let user = null;
  if (ObjectId.isValid(idStr) && idStr.length === 24) {
    user = await usersCol.findOne({ _id: new ObjectId(idStr) }, { projection: { _id: 1 } });
  }
  if (!user) {
    user = await usersCol.findOne({ _id: idStr }, { projection: { _id: 1 } });
  }
  return user ? String(user._id) : null;
}

/**
 * Get IB upline chain for a client (trader): [direct referrer, parent IB, grandparent IB, ...].
 * @param {string} clientUserId - user who traded (must have referrerId in users)
 * @returns {Promise<string[]>} IB userIds from direct to top
 */
async function getUplineChainForClient(clientUserId) {
  if (!clientUserId) return [];
  const db = await getDb();
  const usersCol = db.collection('users');
  const idStr = String(clientUserId);
  let user = null;
  if (ObjectId.isValid(idStr) && idStr.length === 24) {
    user = await usersCol.findOne({ _id: new ObjectId(idStr) }, { projection: { referrerId: 1 } });
  }
  if (!user) {
    user = await usersCol.findOne({ _id: idStr }, { projection: { referrerId: 1 } });
  }
  if (!user?.referrerId) return [];
  const chain = [];
  const visited = new Set();
  let currentId = user.referrerId != null ? String(user.referrerId) : null;
  const col = await profilesCol();
  while (currentId) {
    if (visited.has(currentId)) break;
    visited.add(currentId);
    const profileQuery = currentId.length === 24 && ObjectId.isValid(currentId)
      ? { $or: [{ userId: currentId }, { userId: new ObjectId(currentId) }] }
      : { userId: currentId };
    const profile = await col.findOne(profileQuery);
    if (!profile) break;
    const uid = profile.userId != null ? String(profile.userId) : '';
    if (!uid || chain.includes(uid)) break;
    chain.push(uid);
    currentId = profile.parentId != null ? String(profile.parentId) : null;
    if (currentId && (visited.has(currentId) || chain.includes(currentId))) break;
  }
  return chain;
}

// ---------- Commissions ----------
async function createCommission(doc, options = {}) {
  const col = await commissionsCol();
  const now = new Date();
  const insertOpts = options.session ? { session: options.session } : {};
  const { insertedId } = await col.insertOne(
    {
      ...doc,
      status: 'pending',
      createdAt: now,
    },
    insertOpts
  );
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

/** Platform-wide pending IB commission (company obligation) */
async function sumAllPendingCommissions() {
  const col = await commissionsCol();
  const result = await col
    .aggregate([
      { $match: { status: 'pending' } },
      { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
    ])
    .next();
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

/** Count users who signed up with this IB's referral link (referrerId = ibId) */
async function countReferralsByIb(ibId) {
  const db = await getDb();
  const usersCol = db.collection('users');
  return usersCol.countDocuments({ referrerId: ibId });
}

/** List referral joinings: users who signed up with this IB's ref link, with joinedAt */
async function listReferralJoiningsByIb(ibId, options = {}) {
  const db = await getDb();
  const usersCol = db.collection('users');
  const { limit = 50 } = options;
  const list = await usersCol
    .find({ referrerId: ibId }, { projection: { email: 1, name: 1, createdAt: 1 } })
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();
  return list.map((u) => ({
    clientUserId: u._id.toString(),
    clientEmail: u.email || null,
    clientName: u.name || null,
    joinedAt: u.createdAt,
  }));
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
    joinedAt: userMap[String(r._id)]?.createdAt || null,
    totalCommission: Math.round(r.totalCommission * 100) / 100,
    firstCommissionAt: r.firstCommissionAt,
    tradeCount: r.tradeCount,
  }));
}

export default {
  createProfile,
  getProfileByUserId,
  getProfileById,
  getProfileByReferralCode,
  updateProfile,
  getHierarchyDepth,
  resolveUserIdFromFollowerId,
  getUplineChainForClient,
  createCommission,
  listCommissionsByIb,
  listCommissionsAll,
  sumPendingByIb,
  sumAllPendingCommissions,
  markCommissionsPaid,
  markAllPendingPaid,
  createPayout,
  getPayoutById,
  listPayoutsByIb,
  updatePayoutStatus,
  sumPaidByIb,
  countReferralsByIb,
  listReferralJoiningsByIb,
  listReferralsByIb,
  listAllProfiles,
  getSettings,
  updateSettings,
  getIbSettingsForAdmin,
  updateIbSettingsMerged,
  resolveEffectiveDefaultReferrerUserId,
  updateIbParentByUserId,
  getPammIbCommissionSettings,
  updatePammIbCommissionSettings,
  createPammIbCommissionLog,
  listPammIbCommissionLogsByTradeId,
  deletePammIbCommissionLogsByTradeId,
  deleteCompanyCommissionPoolByTradeId,
  findPammIbPayoutLog,
  createCompanyCommissionPoolEntry,
  listCompanyCommissionPoolEntries,
  listPammIbCommissionLogs,
  listPammIbCommissionLogsForIb,
  listPammIbCommissionLogsWithInvestorDetails,
  incrementPammInvestorDailyCreditedProfit,
  getPammInvestorDailyCreditedProfit,
  getPammIbCommissionPaidToday,
};
