/**
 * Alerts collection — store critical events (fraud, reconciliation, etc.)
 */
import { getDb } from '../../config/mongo.js';

const COLLECTION = 'alerts';

async function col() {
  const db = await getDb();
  return db.collection(COLLECTION);
}

let indexesEnsured = false;
async function ensureIndexes() {
  if (indexesEnsured) return;
  const c = await col();
  await c.createIndex({ type: 1, referenceId: 1 });
  indexesEnsured = true;
}

/** Unresolved alert with same type + referenceId (dedupe key). referenceId must be non-empty string. */
async function findUnresolvedByTypeAndReferenceId(type, referenceId) {
  if (!type || referenceId == null || String(referenceId).trim() === '') return null;
  await ensureIndexes();
  const c = await col();
  return c.findOne({
    type: String(type),
    referenceId: String(referenceId).trim(),
    resolved: { $ne: true },
  });
}

async function insertOne(doc) {
  await ensureIndexes();
  const c = await col();
  const now = new Date();
  const ref =
    doc.referenceId != null && String(doc.referenceId).trim() !== ''
      ? String(doc.referenceId).trim()
      : null;
  const { insertedId } = await c.insertOne({
    ...doc,
    type: doc.type || 'UNKNOWN',
    referenceId: ref,
    severity: doc.severity || 'LOW',
    userId: doc.userId != null ? String(doc.userId) : null,
    message: doc.message || '',
    metadata: doc.metadata && typeof doc.metadata === 'object' ? doc.metadata : {},
    resolved: false,
    createdAt: now,
  });
  return insertedId.toString();
}

async function list(options = {}) {
  const c = await col();
  const { type, resolved, limit = 100 } = options;
  const filter = {};
  if (type) filter.type = type;
  if (typeof resolved === 'boolean') filter.resolved = resolved;
  const list = await c.find(filter).sort({ createdAt: -1 }).limit(limit).toArray();
  return list.map((a) => ({
    id: a._id.toString(),
    type: a.type,
    referenceId: a.referenceId ?? null,
    severity: a.severity || 'LOW',
    userId: a.userId,
    message: a.message,
    metadata: a.metadata || {},
    resolved: !!a.resolved,
    createdAt: a.createdAt,
    resolvedAt: a.resolvedAt,
  }));
}

async function updateResolved(id, resolved) {
  const c = await col();
  const { ObjectId } = await import('mongodb');
  if (!ObjectId.isValid(id)) return null;
  const update = { resolved: !!resolved };
  if (resolved) update.resolvedAt = new Date();
  const result = await c.findOneAndUpdate(
    { _id: new ObjectId(id) },
    { $set: update },
    { returnDocument: 'after' }
  );
  return result;
}

export default { insertOne, list, updateResolved, findUnresolvedByTypeAndReferenceId, ensureIndexes };
