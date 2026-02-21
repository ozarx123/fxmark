/**
 * PAMM performance fee cron
 * Calculate and deduct performance fee (e.g. monthly)
 */
const performanceFeeService = require('../modules/pamm/performance.fee.service');

async function run() {
  // TODO: list managers, calculate fee, deduct
}

module.exports = { run };
