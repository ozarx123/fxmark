/**
 * Audit logs
 * Log admin actions for compliance
 */
const logger = require('../../utils/logger');

function log(userId, action, resource, details = {}) {
  logger.info('audit', { userId, action, resource, ...details });
}

module.exports = { log };
