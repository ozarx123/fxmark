/**
 * Order controller
 * Place, cancel, list orders
 */
async function placeOrder(req, res, next) {
  try {
    // TODO: validate symbol, side, volume, type; call execution.service
    res.status(201).json({ orderId: '', status: 'pending' });
  } catch (e) {
    next(e);
  }
}

async function cancelOrder(req, res, next) {
  try {
    // TODO: cancel by id
    res.json({ status: 'cancelled' });
  } catch (e) {
    next(e);
  }
}

async function listOrders(req, res, next) {
  try {
    res.json([]);
  } catch (e) {
    next(e);
  }
}

module.exports = { placeOrder, cancelOrder, listOrders };
