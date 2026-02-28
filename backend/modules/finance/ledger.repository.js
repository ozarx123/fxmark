/**
 * Ledger repository — MongoDB ledger_entries
 */
import { getDb } from '../../config/mongo.js';
import { ObjectId } from 'mongodb';

const COLLECTION = 'ledger_entries';

async function col() {
  const db = await getDb();
  return db.collection(COLLECTION);
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

/** Insert multiple entries (for atomic journal) */
async function insertMany(docs) {
  const c = await col();
  const now = new Date();
  const withTs = docs.map((d) => ({ ...d, createdAt: now }));
  const result = await c.insertMany(withTs);
  return Object.values(result.insertedIds).map((id) => id.toString());
}

/** List entries for entity, optional filters */
async function listByEntity(entityId, options = {}) {
  const c = await col();
  const { accountCode, from, to, limit = 100, referenceType } = options;
  const filter = { entityId };
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

/** Get balance for account + entity (debits - credits for assets/expenses, credits - debits for liabilities/equity/revenue) */
async function getBalance(entityId, accountCode, asOf = null) {
  const c = await col();
  const uid = entityId != null ? String(entityId) : '';
  const filter = { entityId: uid, accountCode };
  if (asOf) filter.createdAt = { $lte: new Date(asOf) };
  const pipeline = [
    { $match: filter },
    { $group: { _id: null, debit: { $sum: '$debit' }, credit: { $sum: '$credit' } } },
  ];
  const r = await c.aggregate(pipeline).next();
  if (!r) return 0;
  const first = accountCode[0];
  if (first === '1' || first === '5') return (r.debit || 0) - (r.credit || 0);
  return (r.credit || 0) - (r.debit || 0);
}

/** Get balances for all accounts of an entity */
async function getBalancesByEntity(entityId, asOf = null) {
  const c = await col();
  const filter = { entityId };
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

export default {
  insert,
  insertMany,
  listByEntity,
  getBalance,
  getBalancesByEntity,
  listByReference,
  listByPammFund,
};
