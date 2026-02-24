/**
 * Trading account repository — multiple accounts per user
 */
import { getDb } from '../../config/mongo.js';
import { ObjectId } from 'mongodb';

const COLLECTION = 'trading_accounts';

function generateAccountNumber() {
  const n = Math.floor(10000000 + Math.random() * 90000000);
  return `FX-${n}`;
}

function generatePammAccountNumber() {
  const n = Math.floor(1000000 + Math.random() * 9000000);
  return `PAMM-${n}`;
}

async function col() {
  const db = await getDb();
  return db.collection(COLLECTION);
}

async function ensureIndex() {
  const c = await col();
  await c.createIndex({ userId: 1, accountNumber: 1 }, { unique: true });
  await c.createIndex({ accountNumber: 1 }, { unique: true });
  await c.createIndex({ pammManagerId: 1, type: 1 }, { sparse: true });
}

async function create(doc) {
  await ensureIndex();
  const c = await col();
  const genFn = doc.type === 'pamm' ? generatePammAccountNumber : generateAccountNumber;
  const accountNumber = doc.accountNumber || genFn();
  const existing = await c.findOne({ accountNumber });
  if (existing) return create({ ...doc, accountNumber: genFn() });
  const now = new Date();
  const defaultBalance = doc.type === 'pamm' ? (doc.balance ?? 0) : (doc.type === 'demo' ? 10000 : 0);
  const insertDoc = {
    userId: doc.userId,
    accountNumber,
    type: doc.type || 'demo',
    balance: doc.balance ?? defaultBalance,
    currency: doc.currency || 'USD',
    name: doc.name || null,
    createdAt: now,
    updatedAt: now,
  };
  if (doc.type === 'pamm' && doc.pammManagerId) {
    insertDoc.pammManagerId = doc.pammManagerId;
  }
  const { insertedId } = await c.insertOne(insertDoc);
  return insertedId.toString();
}

async function findById(id, userId) {
  if (!ObjectId.isValid(id)) return null;
  const c = await col();
  const a = await c.findOne({ _id: new ObjectId(id), userId });
  return a ? { id: a._id.toString(), ...a, _id: undefined } : null;
}

async function findByAccountNumber(accountNumber, userId) {
  const c = await col();
  const a = await c.findOne({ accountNumber, userId });
  return a ? { id: a._id.toString(), ...a, _id: undefined } : null;
}

async function listByUser(userId) {
  const c = await col();
  const list = await c.find({ userId }).sort({ createdAt: 1 }).toArray();
  return list.map((a) => ({ id: a._id.toString(), ...a, _id: undefined }));
}

async function findByPammManagerId(pammManagerId) {
  const c = await col();
  const a = await c.findOne({ pammManagerId, type: 'pamm' });
  return a ? { id: a._id.toString(), ...a, _id: undefined } : null;
}

async function updateBalance(id, userId, delta) {
  if (!ObjectId.isValid(id)) return null;
  const c = await col();
  const result = await c.findOneAndUpdate(
    { _id: new ObjectId(id), userId },
    { $inc: { balance: delta }, $set: { updatedAt: new Date() } },
    { returnDocument: 'after' }
  );
  return result ? { id: result._id.toString(), ...result, _id: undefined } : null;
}

async function getOrCreateDefaultDemo(userId) {
  const c = await col();
  let demo = await c.findOne({ userId, type: 'demo' });
  if (!demo) {
    const accountNumber = generateAccountNumber();
    const existing = await c.findOne({ accountNumber });
    const finalNumber = existing ? generateAccountNumber() : accountNumber;
    const { insertedId } = await c.insertOne({
      userId,
      accountNumber: finalNumber,
      type: 'demo',
      balance: 10000,
      currency: 'USD',
      name: 'Demo Account',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    demo = await c.findOne({ _id: insertedId });
  }
  return demo ? { id: demo._id.toString(), ...demo, _id: undefined } : null;
}

async function getOrCreateDefaultLive(userId) {
  const c = await col();
  let live = await c.findOne({ userId, type: 'live' });
  if (!live) {
    const accountNumber = generateAccountNumber();
    const existing = await c.findOne({ accountNumber });
    const finalNumber = existing ? generateAccountNumber() : accountNumber;
    const { insertedId } = await c.insertOne({
      userId,
      accountNumber: finalNumber,
      type: 'live',
      balance: 0,
      currency: 'USD',
      name: 'Live Account',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    live = await c.findOne({ _id: insertedId });
  }
  return live ? { id: live._id.toString(), ...live, _id: undefined } : null;
}

export default {
  create,
  findById,
  findByAccountNumber,
  findByPammManagerId,
  listByUser,
  updateBalance,
  getOrCreateDefaultDemo,
  getOrCreateDefaultLive,
};
