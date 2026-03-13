/**
 * Broker execution settings — persistent storage in MongoDB.
 * Single document keyed by "broker_execution_settings".
 */
import { getDb } from '../../config/mongo.js';

const KEY = 'broker_execution_settings';
const COLLECTION = 'settings';

async function col() {
  const db = await getDb();
  return db.collection(COLLECTION);
}

const DEFAULT = {
  key: KEY,
  executionMode: 'A_BOOK',
  hybridRules: {
    maxInternalExposurePerSymbol: 100,
    volumeThresholdToABook: 5,
    profitableTraderToABook: true,
    newsTimeForceABook: false,
  },
  updatedBy: null,
  updatedAt: new Date(),
};

export async function get() {
  const c = await col();
  const doc = await c.findOne({ key: KEY });
  return doc ? { ...DEFAULT, ...doc } : { ...DEFAULT };
}

export async function set(update, updatedBy = null) {
  const c = await col();
  const current = await get();
  const now = new Date();
  const doc = {
    key: KEY,
    executionMode: update.executionMode !== undefined ? update.executionMode : current.executionMode,
    hybridRules: { ...current.hybridRules, ...(update.hybridRules || {}) },
    updatedBy: updatedBy ?? null,
    updatedAt: now,
  };
  await c.updateOne(
    { key: KEY },
    { $set: doc },
    { upsert: true }
  );
  return doc;
}

export default { get, set };
