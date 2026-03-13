/**
 * Audit logs
 * Log admin actions for compliance
 */
import logger from '../../utils/logger.js';

export function log(userId, action, resource, details = {}) {
  logger.info('audit', { userId, action, resource, ...details });
}

export default { log };
