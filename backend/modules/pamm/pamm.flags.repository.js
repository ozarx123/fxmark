/**
 * PAMM feature flags repository — MongoDB: pamm_feature_flags
 * Schema (global scope for now):
 * { scope: 'global', flags: { [flagId]: boolean }, updatedAt }
 */
import { getDb } from '../../config/mongo.js';

const COLLECTION = 'pamm_feature_flags';

async function col() {
  const db = await getDb();
  return db.collection(COLLECTION);
}

async function getGlobalFlags() {
  const c = await col();
  const doc = await c.findOne({ scope: 'global' });
  return doc?.flags || {};
}

async function setGlobalFlags(flags) {
  const c = await col();
  await c.updateOne(
    { scope: 'global' },
    { $set: { flags: { ...(flags || {}) }, updatedAt: new Date() } },
    { upsert: true },
  );
  const doc = await c.findOne({ scope: 'global' });
  return doc?.flags || {};
}

async function getFlag(flagId, fallback = false) {
  const flags = await getGlobalFlags();
  if (Object.prototype.hasOwnProperty.call(flags, flagId)) {
    return !!flags[flagId];
  }
  return fallback;
}

export default {
  getGlobalFlags,
  setGlobalFlags,
  getFlag,
};

