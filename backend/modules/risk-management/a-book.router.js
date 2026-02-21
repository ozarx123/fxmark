/**
 * A-Book router
 * Route orders to LP (FIX), pass-through execution
 */
const fixSession = require('../fix-engine/fix.session');

async function route(order) {
  if (!fixSession.getState() === 'connected') {
    throw new Error('FIX session not connected');
  }
  // TODO: send NewOrderSingle via fix.session
  return { routed: true, lp: 'a-book' };
}

module.exports = { route };
