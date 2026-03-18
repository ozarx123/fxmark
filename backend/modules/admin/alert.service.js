/**
 * Alert service — create and manage alerts (fraud, reconciliation, etc.).
 * Alerts do NOT block transactions; they are for visibility and ops.
 */
import alertRepo from './alert.repository.js';

export const ALERT_TYPES = {
  FRAUD_HIGH: 'FRAUD_HIGH',
  RECON_MISMATCH: 'RECON_MISMATCH',
  RAPID_WITHDRAWALS: 'RAPID_WITHDRAWALS',
  REPEATED_FAILED_ATTEMPTS: 'REPEATED_FAILED_ATTEMPTS',
};

export const ALERT_SEVERITY = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL',
};

const SEVERITY_BY_TYPE = {
  [ALERT_TYPES.FRAUD_HIGH]: ALERT_SEVERITY.HIGH,
  [ALERT_TYPES.RECON_MISMATCH]: ALERT_SEVERITY.CRITICAL,
  [ALERT_TYPES.RAPID_WITHDRAWALS]: ALERT_SEVERITY.MEDIUM,
  [ALERT_TYPES.REPEATED_FAILED_ATTEMPTS]: ALERT_SEVERITY.MEDIUM,
};

/**
 * @returns {Promise<string|null>} alert id, or null if deduplicated (unresolved duplicate exists)
 */
async function createAlert({ type, userId, message, metadata = {}, referenceId }) {
  const severity = SEVERITY_BY_TYPE[type] || ALERT_SEVERITY.LOW;
  const ref = referenceId != null && String(referenceId).trim() !== '' ? String(referenceId).trim() : null;
  if (ref) {
    const dup = await alertRepo.findUnresolvedByTypeAndReferenceId(type, ref);
    if (dup) return null;
  }
  const id = await alertRepo.insertOne({
    type,
    severity,
    referenceId: ref,
    userId: userId != null ? String(userId) : undefined,
    message: message || type,
    metadata,
  });
  console.warn(`[alert] type=${type} severity=${severity} ref=${ref || '—'}`, message, userId ?? '');
  return id;
}

async function listAlerts(options = {}) {
  return alertRepo.list(options);
}

async function resolveAlert(id) {
  return alertRepo.updateResolved(id, true);
}

export default {
  createAlert,
  listAlerts,
  resolveAlert,
  ALERT_TYPES,
};
