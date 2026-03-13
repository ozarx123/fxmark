/**
 * Audit log for execution mode and hybrid rules changes.
 * Persists to MongoDB for compliance and admin visibility.
 */
import { getDb } from '../../config/mongo.js';

const COLLECTION = 'execution_mode_audit';

async function col() {
  const db = await getDb();
  return db.collection(COLLECTION);
}

export async function auditExecutionModeChange({ oldMode, newMode, adminId }) {
  const c = await col();
  await c.insertOne({
    type: 'execution_mode_change',
    oldMode,
    newMode,
    adminId: adminId || null,
    timestamp: new Date(),
  });
}

export async function auditHybridRulesChange({ oldRules, newRules, adminId }) {
  const c = await col();
  await c.insertOne({
    type: 'hybrid_rules_change',
    oldRules,
    newRules,
    adminId: adminId || null,
    timestamp: new Date(),
  });
}

export default { auditExecutionModeChange, auditHybridRulesChange };
