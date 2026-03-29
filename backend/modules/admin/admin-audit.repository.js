/**
 * Persisted admin audit trail (compliance / admin panel).
 */
import { getDb } from '../../config/mongo.js';

const COLLECTION = 'admin_audit_logs';

let indexEnsured = false;

async function col() {
  const db = await getDb();
  return db.collection(COLLECTION);
}

async function ensureIndexes() {
  if (indexEnsured) return;
  const c = await col();
  await c.createIndex({ createdAt: -1 });
  await c.createIndex({ action: 1, createdAt: -1 });
  await c.createIndex({ userId: 1, createdAt: -1 });
  indexEnsured = true;
}

export async function insertAdminAuditLog(doc) {
  await ensureIndexes();
  const c = await col();
  const row = {
    userId: doc.userId != null ? String(doc.userId) : null,
    action: String(doc.action || ''),
    resource: String(doc.resource || ''),
    details: doc.details && typeof doc.details === 'object' ? doc.details : {},
    clientIp: doc.clientIp != null ? String(doc.clientIp) : null,
    createdAt: doc.createdAt instanceof Date ? doc.createdAt : new Date(),
  };
  const { insertedId } = await c.insertOne(row);
  return insertedId.toString();
}

/**
 * @param {{ limit?: number, skip?: number, action?: string, resource?: string, from?: string, to?: string }} opts
 */
export async function listAdminAuditLogs(opts = {}) {
  await ensureIndexes();
  const c = await col();
  const limit = Math.min(Math.max(Number(opts.limit) || 100, 1), 500);
  const skip = Math.max(Number(opts.skip) || 0, 0);
  const q = {};
  if (opts.action) q.action = String(opts.action);
  if (opts.resource) q.resource = String(opts.resource);
  if (opts.from || opts.to) {
    q.createdAt = {};
    if (opts.from) q.createdAt.$gte = new Date(opts.from);
    if (opts.to) q.createdAt.$lte = new Date(opts.to);
  }
  const [items, total] = await Promise.all([
    c.find(q).sort({ createdAt: -1 }).skip(skip).limit(limit).toArray(),
    c.countDocuments(q),
  ]);
  return { items, total };
}

export default { insertAdminAuditLog, listAdminAuditLogs };
