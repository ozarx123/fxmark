/**
 * IB commission cron
 * Aggregate and accrue commission for IBs
 */
const commissionEngine = require('../modules/ib/commission.engine');

async function run() {
  // TODO: list trades in period, calculate commission per IB, accrue
}

module.exports = { run };
