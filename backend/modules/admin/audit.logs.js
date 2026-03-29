/**
 * Audit logs — file logger + MongoDB admin_audit_logs for admin panel / compliance.
 */
import logger from '../../utils/logger.js';
import * as adminAuditRepo from './admin-audit.repository.js';

/**
 * @param {string|null} userId - acting admin user id
 * @param {string} action - stable action key
 * @param {string} resource - resource type or id prefix
 * @param {object} [details]
 * @param {{ clientIp?: string|null }} [meta]
 */
export function log(userId, action, resource, details = {}, meta = {}) {
  const clientIp = meta.clientIp != null ? String(meta.clientIp) : null;
  logger.info('audit', { userId, action, resource, ...details, clientIp });
  adminAuditRepo
    .insertAdminAuditLog({
      userId,
      action,
      resource,
      details: details && typeof details === 'object' ? details : {},
      clientIp,
    })
    .catch((e) => logger.error('[audit] persist failed', { message: e?.message, action }));
}

export default { log };
