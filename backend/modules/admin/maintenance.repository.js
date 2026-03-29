/**
 * Platform maintenance — MongoDB `settings` collection.
 */
import { getDb } from '../../config/mongo.js';

const COLLECTION = 'settings';
const DOC_KEY = 'platform_maintenance';

async function col() {
  const db = await getDb();
  return db.collection(COLLECTION);
}

const DEFAULT_MESSAGE = 'We are performing scheduled maintenance. Please try again shortly.';

export async function getDocument() {
  const c = await col();
  return c.findOne({ key: DOC_KEY });
}

export async function upsert(doc) {
  const c = await col();
  const now = new Date();
  const payload = {
    key: DOC_KEY,
    enabled: !!doc.enabled,
    message: typeof doc.message === 'string' ? doc.message.slice(0, 2000) : DEFAULT_MESSAGE,
    scheduleEnabled: !!doc.scheduleEnabled,
    scheduleStart: doc.scheduleStart instanceof Date ? doc.scheduleStart : doc.scheduleStart ? new Date(doc.scheduleStart) : null,
    scheduleEnd: doc.scheduleEnd instanceof Date ? doc.scheduleEnd : doc.scheduleEnd ? new Date(doc.scheduleEnd) : null,
    updatedAt: now,
    updatedBy: doc.updatedBy != null ? String(doc.updatedBy) : null,
  };
  await c.updateOne({ key: DOC_KEY }, { $set: payload }, { upsert: true });
  return payload;
}

export function defaultMessage() {
  return DEFAULT_MESSAGE;
}

export default { getDocument, upsert, defaultMessage };
