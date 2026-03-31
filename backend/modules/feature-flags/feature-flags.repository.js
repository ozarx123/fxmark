import { getDb } from '../../config/mongo.js';

const COLLECTION = 'feature_flags';
const GLOBAL_SCOPE = 'global';

async function col() {
  const db = await getDb();
  return db.collection(COLLECTION);
}

async function getGlobalFlags() {
  const c = await col();
  const doc = await c.findOne({ scope: GLOBAL_SCOPE });
  return doc?.flags || {};
}

async function setGlobalFlags(flags) {
  const c = await col();
  await c.updateOne(
    { scope: GLOBAL_SCOPE },
    { $set: { flags: { ...(flags || {}) }, updatedAt: new Date() } },
    { upsert: true }
  );
  const doc = await c.findOne({ scope: GLOBAL_SCOPE });
  return doc?.flags || {};
}

export default {
  getGlobalFlags,
  setGlobalFlags,
};
