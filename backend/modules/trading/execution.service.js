/**
 * Execution service
 * Send order to FIX/LP, handle fills
 */
async function executeOrder(userId, order) {
  // TODO: margin check, route to fix-engine or risk router, persist
  return { orderId: '', status: 'sent' };
}

async function cancelOrder(orderId) {
  // TODO: send cancel to LP, update state
  return { status: 'cancelled' };
}

module.exports = { executeOrder, cancelOrder };
