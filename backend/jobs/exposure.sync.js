/**
 * Exposure sync job
 * Recalc exposure by symbol; feed hedging
 */
const exposureManager = require('../modules/risk-management/exposure.manager');

async function run() {
  await exposureManager.syncExposure();
}

module.exports = { run };
