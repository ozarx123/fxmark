/**
 * Order service — place, cancel, list orders (persisted in MongoDB)
 * Market orders with executionPrice are immediately filled and create a position.
 */
import orderRepo from './order.repository.js';
import positionsService from './positions.service.js';

const SIDES = ['buy', 'sell'];
const TYPES = ['market', 'limit'];
const STATUSES = ['pending', 'placed', 'filled', 'partial', 'cancelled', 'rejected'];

function validatePlace(symbol, side, volume, type, price) {
  if (!symbol || typeof symbol !== 'string' || !symbol.trim()) {
    const err = new Error('Symbol is required');
    err.statusCode = 400;
    throw err;
  }
  if (!SIDES.includes((side || '').toLowerCase())) {
    const err = new Error('Side must be buy or sell');
    err.statusCode = 400;
    throw err;
  }
  const vol = Number(volume);
  if (Number.isNaN(vol) || vol <= 0) {
    const err = new Error('Volume must be a positive number');
    err.statusCode = 400;
    throw err;
  }
  const t = (type || 'market').toLowerCase();
  if (!TYPES.includes(t)) {
    const err = new Error('Type must be market or limit');
    err.statusCode = 400;
    throw err;
  }
  if (t === 'limit') {
    const p = Number(price);
    if (Number.isNaN(p) || p <= 0) {
      const err = new Error('Price is required for limit orders');
      err.statusCode = 400;
      throw err;
    }
  }
  return { symbol: symbol.trim().toUpperCase(), side: side.toLowerCase(), volume: vol, type: t, price: t === 'limit' ? Number(price) : null };
}

async function placeOrder(userId, body, accountId = null) {
  const { symbol, side, volume, type, price } = validatePlace(
    body.symbol,
    body.side,
    body.volume,
    body.type,
    body.price
  );
  const execPriceRaw = type === 'market' && body.executionPrice != null ? body.executionPrice : null;
  const execPrice = execPriceRaw != null ? Number(execPriceRaw) : null;
  const hasValidExecPrice = execPrice != null && !Number.isNaN(execPrice) && execPrice > 0;

  const orderDoc = {
    userId,
    symbol,
    side,
    volume,
    type,
    price: price || null,
    status: 'pending',
    filledVolume: 0,
  };
  if (accountId) orderDoc.accountId = accountId;

  const orderId = await orderRepo.create(orderDoc);

  if (type === 'market' && hasValidExecPrice) {
    const position = await positionsService.openPosition(userId, {
      symbol,
      side,
      volume,
      openPrice: execPrice,
      currentPrice: execPrice,
      pnl: 0,
      accountId,
    });
    await orderRepo.updateStatus(orderId, userId, 'filled', { filledVolume: volume }, accountId);
    const order = await orderRepo.findById(orderId, userId, accountId);
    return { orderId, status: 'filled', order, positionId: position?.id };
  }

  const order = await orderRepo.findById(orderId, userId, accountId);
  return { orderId, status: 'pending', order };
}

async function cancelOrder(userId, orderId, accountId = null) {
  const order = await orderRepo.findById(orderId, userId, accountId);
  if (!order) {
    const err = new Error('Order not found');
    err.statusCode = 404;
    throw err;
  }
  if (!['pending', 'placed', 'partial'].includes(order.status)) {
    const err = new Error(`Order cannot be cancelled (status: ${order.status})`);
    err.statusCode = 400;
    throw err;
  }
  await orderRepo.updateStatus(orderId, userId, 'cancelled', {}, accountId);
  return { status: 'cancelled' };
}

async function listOrders(userId, options = {}) {
  return orderRepo.listByUser(userId, options);
}

async function getOrder(userId, orderId, accountId = null) {
  return orderRepo.findById(orderId, userId, accountId);
}

export default { placeOrder, cancelOrder, listOrders, getOrder };
