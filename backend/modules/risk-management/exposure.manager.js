/**
 * Exposure manager
 * Aggregate exposure by symbol/client; sync with hedging
 */
async function getExposure(symbol) {
  // TODO: sum open positions by symbol
  return { symbol, long: 0, short: 0 };
}

async function syncExposure() {
  // TODO: recalc and persist; used by exposure.sync job
}

module.exports = { getExposure, syncExposure };
