/**
 * FIX message router
 * Route orders to correct LP session by symbol/session
 */
function routeOrder(order) {
  // TODO: select session/LP by symbol from config
  return { sessionId: 'default', order };
}

function routeExecutionReport(msg) {
  // TODO: map FIX ExecReport to internal order update
  return { orderId: msg.ClOrdID, status: msg.OrdStatus };
}

module.exports = { routeOrder, routeExecutionReport };
