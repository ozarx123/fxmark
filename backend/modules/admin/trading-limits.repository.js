/**
 * User trading limits — block status, drawdown limits (admin-set)
 */
import { getDb } from '../../config/mongo.js';

const COLLECTION = 'user_trading_limits';

async function col() {
  const db = await getDb();
  return db.collection(COLLECTION);
}

async function getByUserId(userId) {
  const c = await col();
  const doc = await c.findOne({ userId: String(userId) });
  return doc ? { ...doc, id: doc._id?.toString() } : null;
}

async function upsert(userId, data) {
  const c = await col();
  const now = new Date();
  const { blocked, maxDrawdownPercent, maxDailyLoss } = data;
  const set = { updatedAt: now };
  if (blocked !== undefined) set.blocked = !!blocked;
  if (maxDrawdownPercent !== undefined) set.maxDrawdownPercent = Number(maxDrawdownPercent);
  if (maxDailyLoss !== undefined) set.maxDailyLoss = Number(maxDailyLoss);
  const result = await c.findOneAndUpdate(
    { userId: String(userId) },
    { $set: set, $setOnInsert: { userId: String(userId) } },
    { upsert: true, returnDocument: 'after' }
  );
  return result ? { ...result, id: result._id?.toString() } : null;
}

export default { getByUserId, upsert };
