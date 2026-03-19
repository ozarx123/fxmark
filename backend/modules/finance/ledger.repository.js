/**
 * Ledger repository — MongoDB ledger_entries
 */
import { getDb } from '../../config/mongo.js';
import { ObjectId } from 'mongodb';
import { ACCOUNTS, ENTITY_COMPANY } from './chart-of-accounts.js';

const COLLECTION = 'ledger_entries';
const WALLET_ACCOUNT = ACCOUNTS.WALLET;

/** Entity IDs that represent the company (legacy + current). Query both for company ledger. */
const COMPANY_ENTITY_IDS = [ENTITY_COMPANY, 'SYSTEM_ACCOUNT'];

function entityMatch(entityId) {
  const idStr = entityId != null ? String(entityId) : '';
  const conditions =
    idStr === ENTITY_COMPANY
      ? COMPANY_ENTITY_IDS.map((id) => ({ entityId: id }))
      : [{ entityId: idStr }];
  if (idStr !== ENTITY_COMPANY && idStr.length === 24 && ObjectId.isValid(idStr)) conditions.push({ entityId: new ObjectId(idStr) });
  if (idStr !== ENTITY_COMPANY && /^\d+$/.test(idStr)) conditions.push({ entityId: Number(idStr) });
  return { $or: conditions };
}

async function col() {
  const db = await getDb();
  return db.collection(COLLECTION);
}

let referenceIdIndexEnsured = false;
export async function ensureLedgerReferenceIdIndex() {
  if (referenceIdIndexEnsured) return;
  const c = await col();
  await c.createIndex({ referenceId: 1 });
  referenceIdIndexEnsured = true;
}

/** Insert a single ledger entry */
async function insert(doc) {
  const c = await col();
  const now = new Date();
  const { insertedId } = await c.insertOne({
    ...doc,
    createdAt: now,
  });
  return insertedId.toString();
}

/** Insert multiple entries (for atomic journal). options.session for transaction. */
async function insertMany(docs, options = {}) {
  const c = await col();
  const now = new Date();
  const withTs = docs.map((d) => ({ ...d, createdAt: now }));
  const result = await c.insertMany(withTs, options.session ? { session: options.session } : {});
  return Object.values(result.insertedIds).map((id) => id.toString());
}

/**
 * Idempotency: true if a WALLET ledger entry already exists for this business key.
 * Used to prevent duplicate posting for the same economic event.
 * @param {string} entityId - user/system id
 * @param {string} referenceType - e.g. pamm_dist, admin_credit, deposit
 * @param {string} referenceId - e.g. positionId, txId
 * @param {number} credit - credit amount on wallet leg
 * @param {number} debit - debit amount on wallet leg
 * @param {{ session?: import('mongodb').ClientSession, pammFundId?: string }} [opts]
 */
async function existsWalletEntryForEvent(entityId, referenceType, referenceId, credit, debit, opts = {}) {
  const c = await col();
  const filter = {
    ...entityMatch(entityId),
    accountCode: WALLET_ACCOUNT,
    referenceType: referenceType || null,
    referenceId: referenceId || null,
    credit: Number(credit) || 0,
    debit: Number(debit) || 0,
  };
  if (opts.pammFundId != null) filter.pammFundId = String(opts.pammFundId);
  const doc = await c.findOne(filter, opts.session ? { session: opts.session, projection: { _id: 1 } } : { projection: { _id: 1 } });
  return !!doc;
}

/** List entries for entity, optional filters. For ENTITY_COMPANY includes legacy SYSTEM_ACCOUNT. */
async function listByEntity(entityId, options = {}) {
  const c = await col();
  const { accountCode, from, to, limit = 100, referenceType } = options;
  const filter = { ...entityMatch(entityId) };
  if (accountCode) filter.accountCode = accountCode;
  if (referenceType) filter.referenceType = referenceType;
  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = new Date(from);
    if (to) filter.createdAt.$lte = new Date(to);
  }
  const list = await c.find(filter).sort({ createdAt: -1 }).limit(limit).toArray();
  return list.map((e) => ({ id: e._id.toString(), ...e, _id: undefined }));
}

/** Get balance for account + entity. For ENTITY_COMPANY includes legacy SYSTEM_ACCOUNT. options.session for transactions. */
async function getBalance(entityId, accountCode, asOf = null, options = {}) {
  const c = await col();
  const filter = { ...entityMatch(entityId), accountCode };
  if (asOf) filter.createdAt = { $lte: new Date(asOf) };
  const pipeline = [
    { $match: filter },
    { $group: { _id: null, debit: { $sum: '$debit' }, credit: { $sum: '$credit' } } },
  ];
  const aggOpts = options.session ? { session: options.session } : {};
  const r = await c.aggregate(pipeline, aggOpts).next();
  if (!r) return 0;
  const first = accountCode[0];
  if (first === '1' || first === '5') return (r.debit || 0) - (r.credit || 0);
  return (r.credit || 0) - (r.debit || 0);
}

/** Get balances for all accounts of an entity. For ENTITY_COMPANY includes legacy SYSTEM_ACCOUNT. */
async function getBalancesByEntity(entityId, asOf = null) {
  const c = await col();
  const filter = { ...entityMatch(entityId) };
  if (asOf) filter.createdAt = { $lte: new Date(asOf) };
  const pipeline = [
    { $match: filter },
    { $group: { _id: '$accountCode', debit: { $sum: '$debit' }, credit: { $sum: '$credit' } } },
  ];
  const rows = await c.aggregate(pipeline).toArray();
  const result = {};
  for (const r of rows) {
    const first = r._id[0];
    if (first === '1' || first === '5') {
      result[r._id] = (r.debit || 0) - (r.credit || 0);
    } else {
      result[r._id] = (r.credit || 0) - (r.debit || 0);
    }
  }
  return result;
}

/** List entries by reference (e.g. find all entries for a deposit) */
async function listByReference(referenceType, referenceId) {
  const c = await col();
  const list = await c.find({ referenceType, referenceId }).sort({ createdAt: 1 }).toArray();
  return list.map((e) => ({ id: e._id.toString(), ...e, _id: undefined }));
}

/**
 * Expected wallet balance per user+currency from ledger WALLET account (liability: credits − debits).
 * Read-only aggregation for reconciliation.
 */
async function aggregateWalletExpectedBalancesByUserCurrency() {
  const c = await col();
  const pipeline = [
    { $match: { accountCode: WALLET_ACCOUNT } },
    { $addFields: { entityNorm: { $toString: '$entityId' } } },
    {
      $group: {
        _id: { u: '$entityNorm', cur: { $ifNull: ['$currency', 'USD'] } },
        debit: { $sum: '$debit' },
        credit: { $sum: '$credit' },
      },
    },
    {
      $project: {
        _id: 0,
        userId: '$_id.u',
        currency: '$_id.cur',
        expectedBalance: { $subtract: ['$credit', '$debit'] },
      },
    },
  ];
  return c.aggregate(pipeline).toArray();
}

/** List ledger entries for a PAMM fund (allocation, fee, distribution, manager capital) */
async function listByPammFund(pammFundId, options = {}) {
  const c = await col();
  const { from, to, limit = 200, referenceType } = options;
  const filter = { pammFundId: String(pammFundId) };
  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = new Date(from);
    if (to) filter.createdAt.$lte = new Date(to);
  }
  if (referenceType) filter.referenceType = referenceType;
  const list = await c.find(filter).sort({ createdAt: -1 }).limit(limit).toArray();
  return list.map((e) => ({ id: e._id.toString(), ...e, _id: undefined }));
}

/** Platform-wide: sum debits & credits per account in date range */
async function aggregatePeriodByAccount(from, to) {
  const c = await col();
  const filter = {
    createdAt: {
      $gte: from instanceof Date ? from : new Date(from),
      $lte: to instanceof Date ? to : new Date(to),
    },
  };
  const rows = await c
    .aggregate([
      { $match: filter },
      {
        $group: {
          _id: '$accountCode',
          debit: { $sum: '$debit' },
          credit: { $sum: '$credit' },
          entryCount: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ])
    .toArray();
  return rows.map((r) => ({
    accountCode: r._id,
    debit: r.debit || 0,
    credit: r.credit || 0,
    entryCount: r.entryCount || 0,
  }));
}

/** Cumulative signed balance per account code as of date (entire ledger) */
async function aggregateGlobalTrialBalanceAsOf(asOf) {
  const c = await col();
  const t = asOf instanceof Date ? asOf : new Date(asOf);
  const rows = await c
    .aggregate([
      { $match: { createdAt: { $lte: t } } },
      { $group: { _id: '$accountCode', debit: { $sum: '$debit' }, credit: { $sum: '$credit' } } },
    ])
    .toArray();
  const result = {};
  for (const r of rows) {
    const code = r._id;
    if (!code) continue;
    const first = String(code)[0];
    if (first === '1' || first === '5') result[code] = (r.debit || 0) - (r.credit || 0);
    else result[code] = (r.credit || 0) - (r.debit || 0);
  }
  return result;
}

/** Sum wallet-leg flows in period (e.g. deposits = credits on WALLET with referenceType) */
async function sumWalletFlowInPeriod(from, to, referenceType, side) {
  const c = await col();
  const filter = {
    accountCode: WALLET_ACCOUNT,
    referenceType,
    createdAt: {
      $gte: from instanceof Date ? from : new Date(from),
      $lte: to instanceof Date ? to : new Date(to),
    },
  };
  const field = side === 'debit' ? 'debit' : 'credit';
  const rows = await c
    .aggregate([{ $match: filter }, { $group: { _id: null, total: { $sum: `$${field}` } } }])
    .next();
  return rows?.total || 0;
}

/**
 * Platform-wide ledger lines (admin). accountClass: revenue (^4), expense (^5), pl (4 or 5).
 */
async function listEntriesGlobal(options = {}) {
  const c = await col();
  const {
    from,
    to,
    accountCode,
    referenceType,
    accountClass,
    limit = 200,
  } = options;
  const lim = Math.min(Math.max(Number(limit) || 200, 1), 2000);
  const filter = {};
  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = new Date(from);
    if (to) filter.createdAt.$lte = new Date(to);
  }
  if (accountCode && String(accountCode).trim()) {
    filter.accountCode = String(accountCode).trim();
  } else if (accountClass === 'revenue') {
    filter.accountCode = { $regex: /^4/ };
  } else if (accountClass === 'expense') {
    filter.accountCode = { $regex: /^5/ };
  } else if (accountClass === 'pl') {
    filter.$or = [{ accountCode: { $regex: /^4/ } }, { accountCode: { $regex: /^5/ } }];
  }
  if (referenceType && String(referenceType).trim()) {
    filter.referenceType = String(referenceType).trim();
  }
  const list = await c.find(filter).sort({ createdAt: -1 }).limit(lim).toArray();
  return list.map((e) => ({
    id: e._id.toString(),
    ...e,
    _id: undefined,
  }));
}

export default {
  insert,
  insertMany,
  ensureLedgerReferenceIdIndex,
  existsWalletEntryForEvent,
  listByEntity,
  getBalance,
  getBalancesByEntity,
  listByReference,
  aggregateWalletExpectedBalancesByUserCurrency,
  listByPammFund,
  aggregatePeriodByAccount,
  aggregateGlobalTrialBalanceAsOf,
  sumWalletFlowInPeriod,
  listEntriesGlobal,
};
