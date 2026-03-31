/**
 * Persist NOWPayments deposit orders (idempotency + audit).
 */
import { getDb } from '../../config/mongo.js';

const COLLECTION = 'nowpayments_orders';

let indexesEnsured = false;

async function col() {
  const db = await getDb();
  return db.collection(COLLECTION);
}

async function ensureIndexes() {
  if (indexesEnsured) return;
  const c = await col();
  try {
    await c.createIndex({ orderId: 1 }, { unique: true });
    await c.createIndex({ paymentId: 1 }, { unique: true, sparse: true });
    await c.createIndex({ depositTransactionId: 1 });
    await c.createIndex({ userId: 1, createdAt: -1 });
    await c.createIndex({ payAddress: 1, createdAt: -1 });
  } catch (e) {
    console.warn('[nowpayments] index ensure:', e.message);
  }
  indexesEnsured = true;
}

export async function insertOrder(doc) {
  await ensureIndexes();
  const c = await col();
  const row = {
    ...doc,
    network: 'BEP20',
    credited: false,
    credited_at: null,
    processed_at: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  await c.insertOne(row);
  return row;
}

export async function findByOrderId(orderId) {
  await ensureIndexes();
  const c = await col();
  return c.findOne({ orderId: String(orderId) });
}

export async function updateByOrderId(orderId, $set) {
  await ensureIndexes();
  const c = await col();
  await c.updateOne(
    { orderId: String(orderId) },
    { $set: { ...$set, updatedAt: new Date() } }
  );
}

export async function markRejected(orderId, reason, extra = {}) {
  await updateByOrderId(orderId, {
    status: 'rejected',
    rejectReason: String(reason || 'rejected'),
    processedAt: new Date(),
    processed_at: new Date(),
    ...extra,
  });
}

export async function markExpired(orderId, extra = {}) {
  await updateByOrderId(orderId, {
    status: 'expired',
    internalStatus: 'expired',
    processedAt: new Date(),
    processed_at: new Date(),
    ...extra,
  });
}

/**
 * Claim credit for this order inside a Mongo session transaction (first writer wins).
 * @returns {Promise<object|null>} Order doc after update, or null if already credited / missing
 */
export async function claimCreditForOrder(orderId, session) {
  await ensureIndexes();
  const c = await col();
  const opts = { returnDocument: 'after' };
  if (session) opts.session = session;
  const r = await c.findOneAndUpdate(
    {
      orderId: String(orderId),
      creditedAt: { $exists: false },
      status: { $ne: 'finished' },
    },
    {
      $set: {
        credited: true,
        creditedAt: new Date(),
        credited_at: new Date(),
        processedAt: new Date(),
        processed_at: new Date(),
        status: 'finished',
        internalStatus: 'completed',
        updatedAt: new Date(),
      },
    },
    opts
  );
  return r || null;
}

export async function findByPaymentId(paymentId) {
  await ensureIndexes();
  const c = await col();
  const pid = Number(paymentId);
  if (!Number.isFinite(pid)) return null;
  return c.findOne({ paymentId: pid });
}

export async function countRecentByPayAddress(payAddress, windowMs = 24 * 60 * 60 * 1000) {
  const addr = String(payAddress || '').trim();
  if (!addr) return 0;
  await ensureIndexes();
  const c = await col();
  const since = new Date(Date.now() - Math.max(60_000, Number(windowMs) || 0));
  return c.countDocuments({
    payAddress: addr,
    createdAt: { $gte: since },
  });
}

/** Read-only scan for ops reconciliation (no mutations). */
export async function listOrdersForReconciliation(limit = 500) {
  await ensureIndexes();
  const c = await col();
  const n = Math.min(Math.max(Number(limit) || 500, 1), 2000);
  return c.find({}).sort({ updatedAt: -1 }).limit(n).toArray();
}

export async function countRecentSmallDeposits(userId, smallAmountUsd = 25, windowMs = 2 * 60 * 60 * 1000) {
  await ensureIndexes();
  const c = await col();
  const since = new Date(Date.now() - Math.max(60_000, Number(windowMs) || 0));
  return c.countDocuments({
    userId: String(userId),
    amountUsd: { $lte: Number(smallAmountUsd) },
    createdAt: { $gte: since },
  });
}
