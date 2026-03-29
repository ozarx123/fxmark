/**
 * Platform environment overrides — MongoDB `settings` collection.
 * Values are merged into process.env after Mongo connects (see platform-env.service).
 */
import { getDb } from '../../config/mongo.js';

const COLLECTION = 'settings';
const DOC_KEY = 'platform_env_overrides';

async function col() {
  const db = await getDb();
  return db.collection(COLLECTION);
}

export async function getDocument() {
  const c = await col();
  return c.findOne({ key: DOC_KEY });
}

/** @returns {Promise<Record<string, { value: string, updatedAt: Date, updatedBy: string|null }>>} */
export async function getEntries() {
  const doc = await getDocument();
  const raw = doc?.entries;
  if (!raw || typeof raw !== 'object') return {};
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    if (v && typeof v === 'object' && typeof v.value === 'string') {
      out[k] = {
        value: v.value,
        updatedAt: v.updatedAt || null,
        updatedBy: v.updatedBy != null ? String(v.updatedBy) : null,
      };
    }
  }
  return out;
}

export async function setEntry(envKey, value, updatedBy = null) {
  const c = await col();
  const doc = await c.findOne({ key: DOC_KEY });
  const entries = { ...(doc?.entries || {}) };
  entries[envKey] = {
    value: String(value),
    updatedAt: new Date(),
    updatedBy: updatedBy != null ? String(updatedBy) : null,
  };
  await c.updateOne(
    { key: DOC_KEY },
    { $set: { key: DOC_KEY, entries, updatedAt: new Date() } },
    { upsert: true }
  );
}

export async function deleteEntry(envKey) {
  const c = await col();
  const doc = await c.findOne({ key: DOC_KEY });
  if (!doc?.entries || typeof doc.entries !== 'object') return;
  const entries = { ...doc.entries };
  delete entries[envKey];
  await c.updateOne({ key: DOC_KEY }, { $set: { entries, updatedAt: new Date() } });
}

export default { getDocument, getEntries, setEntry, deleteEntry };
