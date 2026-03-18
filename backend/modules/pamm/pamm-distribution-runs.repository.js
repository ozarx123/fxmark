/**
 * Audit log for PAMM distribution runs (read-heavy, admin visibility).
 */
import { getDb } from '../../config/mongo.js';
import { ObjectId } from 'mongodb';

const COLLECTION = 'pamm_distribution_runs';

async function col() {
  const db = await getDb();
  return db.collection(COLLECTION);
}

export async function createRun(doc) {
  const c = await col();
  const now = new Date();
  const { insertedId } = await c.insertOne({
    positionId: String(doc.positionId),
    managerId: String(doc.managerId || ''),
    fundId: String(doc.fundId || ''),
    ownerId: String(doc.ownerId),
    status: 'processing',
    startedAt: now,
    lastHeartbeatAt: now,
    totalUsers: 0,
    successCount: 0,
    failedCount: 0,
    failedUserIds: [],
    error: null,
    completedAt: null,
  });
  return insertedId.toString();
}

export async function updateRunProgress(runId, patch) {
  if (!runId || !ObjectId.isValid(runId)) return;
  const c = await col();
  const $set = {};
  if (patch.totalUsers != null) $set.totalUsers = patch.totalUsers;
  if (patch.successCount != null) $set.successCount = patch.successCount;
  if (patch.failedCount != null) $set.failedCount = patch.failedCount;
  if (Array.isArray(patch.failedUserIds)) $set.failedUserIds = patch.failedUserIds.slice(0, 50);
  if (patch.lastHeartbeatAt) $set.lastHeartbeatAt = patch.lastHeartbeatAt;
  if (Object.keys($set).length === 0) return;
  await c.updateOne({ _id: new ObjectId(runId) }, { $set });
}

export async function touchRunHeartbeat(runId) {
  if (!runId || !ObjectId.isValid(runId)) return;
  const c = await col();
  await c.updateOne(
    { _id: new ObjectId(runId) },
    { $set: { lastHeartbeatAt: new Date() } }
  );
}

export async function finalizeRun(runId, status, extra = {}) {
  if (!runId || !ObjectId.isValid(runId)) return;
  const c = await col();
  const $set = {
    status: status === 'completed' ? 'completed' : 'failed',
    completedAt: new Date(),
    lastHeartbeatAt: new Date(),
  };
  if (extra.successCount != null) $set.successCount = extra.successCount;
  if (extra.failedCount != null) $set.failedCount = extra.failedCount;
  if (Array.isArray(extra.failedUserIds)) $set.failedUserIds = extra.failedUserIds.slice(0, 50);
  if (extra.error != null) $set.error = String(extra.error).slice(0, 1000);
  if (extra.totalUsers != null) $set.totalUsers = extra.totalUsers;
  await c.updateOne({ _id: new ObjectId(runId) }, { $set });
}

export async function listRuns(limit = 50) {
  const c = await col();
  const list = await c.find({}).sort({ startedAt: -1 }).limit(Math.min(limit, 200)).toArray();
  return list.map((r) => ({
    id: r._id.toString(),
    positionId: r.positionId,
    managerId: r.managerId,
    fundId: r.fundId,
    ownerId: r.ownerId,
    status: r.status,
    startedAt: r.startedAt,
    completedAt: r.completedAt,
    lastHeartbeatAt: r.lastHeartbeatAt,
    totalUsers: r.totalUsers ?? 0,
    successCount: r.successCount ?? 0,
    failedCount: r.failedCount ?? 0,
    failedUserIds: r.failedUserIds || [],
    error: r.error || null,
  }));
}

export async function findRunsByPositionId(positionId) {
  if (!positionId) return [];
  const c = await col();
  const list = await c
    .find({ positionId: String(positionId) })
    .sort({ startedAt: -1 })
    .limit(50)
    .toArray();
  return list.map((r) => ({
    id: r._id.toString(),
    positionId: r.positionId,
    managerId: r.managerId,
    fundId: r.fundId,
    ownerId: r.ownerId,
    status: r.status,
    startedAt: r.startedAt,
    completedAt: r.completedAt,
    lastHeartbeatAt: r.lastHeartbeatAt,
    totalUsers: r.totalUsers ?? 0,
    successCount: r.successCount ?? 0,
    failedCount: r.failedCount ?? 0,
    failedUserIds: r.failedUserIds || [],
    error: r.error || null,
  }));
}

export default {
  createRun,
  updateRunProgress,
  touchRunHeartbeat,
  finalizeRun,
  listRuns,
  findRunsByPositionId,
};
