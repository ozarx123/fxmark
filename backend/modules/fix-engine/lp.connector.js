/**
 * Liquidity provider connector
 * Per-LP FIX session, credentials, reconnect
 */
const fixSession = require('./fix.session');

function createConnector(lpConfig) {
  return {
    connect: () => fixSession.connect(),
    disconnect: () => fixSession.disconnect(),
    sendOrder: (order) => fixSession.send(order),
  };
}

module.exports = { createConnector };
