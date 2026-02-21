/**
 * Nightly settlement job
 * EOD P&L, ledger close, statements
 */
const logger = require('../utils/logger');

async function run() {
  logger.info('Nightly settlement started');
  // TODO: run reconciliation, generate daily statements
  logger.info('Nightly settlement completed');
}

module.exports = { run };
