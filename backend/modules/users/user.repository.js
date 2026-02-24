import { getDb } from '../../config/mongo.js';
import { ObjectId } from 'mongodb';

const COLLECTION = 'users';

let indexEnsured = false;
async function ensureIndex() {
  if (indexEnsured) return;
  const col = await collection();
  await col.createIndex({ email: 1 }, { unique: true });
  indexEnsured = true;
}

async function collection() {
  const db = await getDb();
  return db.collection(COLLECTION);
}

function generateAccountNo() {
  return 'FX' + String(Math.floor(10000000 + Math.random() * 90000000));
}

async function createOne(doc) {
  await ensureIndex();
  const col = await collection();
  const accountNo = doc.accountNo || generateAccountNo();
  const { insertedId } = await col.insertOne({
    ...doc,
    accountNo,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return insertedId.toString();
}

async function findByEmail(email) {
  const col = await collection();
  const user = await col.findOne({ email: (email || '').toLowerCase().trim() });
  return user ? toUser(user) : null;
}

async function findByAccountNo(accountNo) {
  if (!accountNo || typeof accountNo !== 'string') return null;
  const col = await collection();
  const normalized = accountNo.trim().toUpperCase();
  const user = await col.findOne({ accountNo: normalized });
  return user ? toUser(user) : null;
}

async function ensureAccountNo(userId) {
  const user = await findById(userId);
  if (!user || user.accountNo) return user;
  const col = await collection();
  const accountNo = generateAccountNo();
  if (!ObjectId.isValid(userId)) return user;
  await col.updateOne(
    { _id: new ObjectId(userId) },
    { $set: { accountNo, updatedAt: new Date() } }
  );
  return { ...user, accountNo };
}

async function findById(id) {
  if (!id) return null;
  const col = await collection();
  let _id;
  try {
    _id = ObjectId.isValid(id) ? new ObjectId(id) : null;
  } catch {
    return null;
  }
  if (!_id) return null;
  const user = await col.findOne({ _id });
  return user ? toUser(user) : null;
}

async function updateById(id, update) {
  if (!id) return null;
  const col = await collection();
  const _id = new ObjectId(id);
  const result = await col.findOneAndUpdate(
    { _id },
    { $set: { ...update, updatedAt: new Date() } },
    { returnDocument: 'after' }
  );
  return result ? toUser(result) : null;
}

function toUser(row) {
  if (!row) return null;
  const { _id, passwordHash, ...rest } = row;
  return { id: _id.toString(), ...rest };
}

function toUserWithHash(row) {
  if (!row) return null;
  const { _id, ...rest } = row;
  return { id: _id.toString(), ...rest };
}

async function findByEmailWithPassword(email) {
  const col = await collection();
  const user = await col.findOne({ email: (email || '').toLowerCase().trim() });
  return user ? toUserWithHash(user) : null;
}

/** List users (admin). Excludes passwordHash. Optional role/kycStatus filters. */
async function list(options = {}) {
  const col = await collection();
  const filter = {};
  if (options.role) filter.role = options.role;
  if (options.kycStatus) filter.kycStatus = options.kycStatus;
  if (options.search) {
    filter.email = { $regex: options.search, $options: 'i' };
  }
  const cursor = col.find(filter, { projection: { passwordHash: 0 } }).sort({ createdAt: -1 });
  const limit = Math.min(options.limit || 200, 500);
  const list = await cursor.limit(limit).toArray();
  return list.map((row) => toUser(row));
}

export default {
  collection,
  createOne,
  findByEmail,
  findByAccountNo,
  findById,
  updateById,
  list,
  toUser,
  findByEmailWithPassword,
  ensureAccountNo,
};
