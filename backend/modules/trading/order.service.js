/**
 * Order service — place, cancel, list orders (persisted in MongoDB)
 * Market orders with executionPrice are routed through ExecutionRouter (A_BOOK/B_BOOK/HYBRID).
 * CRM trading permission validator runs before any order (client, account, KYC, symbol, daily loss).
 */
import orderRepo from './order.repository.js';
import executionRouter from './execution-router.js';
import { validateTradingPermission } from './trading-permission.validator.js';

const SIDES = ['buy', 'sell'];
const MARKET = 'market';
const LIMIT = 'limit';
const PENDING_TYPES = ['buy_limit', 'sell_limit', 'buy_stop', 'sell_stop'];
const TYPES = [MARKET, LIMIT, ...PENDING_TYPES];
const STATUSES = ['pending', 'placed', 'filled', 'partial', 'cancelled', 'rejected'];

function normalizeOrderType(type) {
  const t = String(type || '').toLowerCase().replace(/\s/g, '_');
  if (t === 'buy_limit' || t === 'buylimit') return 'buy_limit';
  if (t === 'sell_limit' || t === 'selllimit') return 'sell_limit';
  if (t === 'buy_stop' || t === 'buystop') return 'buy_stop';
  if (t === 'sell_stop' || t === 'sellstop') return 'sell_stop';
  if (t === 'limit') return 'limit';
  return t || 'market';
}

function validatePlace(symbol, side, volume, type, price, stopLoss, takeProfit) {
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
  const t = normalizeOrderType(type);
  if (!TYPES.includes(t)) {
    const err = new Error(`Type must be one of: market, limit, buy_limit, sell_limit, buy_stop, sell_stop`);
    err.statusCode = 400;
    throw err;
  }
  const isPending = PENDING_TYPES.includes(t);
  const isLimit = t === LIMIT || t === 'buy_limit' || t === 'sell_limit';
  if (isPending || isLimit) {
    const p = Number(price);
    if (Number.isNaN(p) || p <= 0) {
      const err = new Error('Price is required for limit and stop orders');
      err.statusCode = 400;
      throw err;
    }
  }
  const sl = stopLoss != null && stopLoss !== '' ? Number(stopLoss) : null;
  const tp = takeProfit != null && takeProfit !== '' ? Number(takeProfit) : null;
  return {
    symbol: symbol.trim().replace(/\//g, '').toUpperCase(),
    side: side.toLowerCase(),
    volume: vol,
    type: t,
    price: isPending || isLimit ? Number(price) : null,
    stopLoss: Number.isFinite(sl) ? sl : null,
    takeProfit: Number.isFinite(tp) ? tp : null,
  };
}

async function placeOrder(userId, body, accountId = null) {
  const { symbol, side, volume, type, price, stopLoss, takeProfit } = validatePlace(
    body.symbol,
    body.side,
    body.volume,
    body.type,
    body.price,
    body.stopLoss,
    body.takeProfit
  );
  const execPriceRaw = type === MARKET && body.executionPrice != null ? body.executionPrice : null;
  const execPrice = execPriceRaw != null ? Number(execPriceRaw) : null;
  const hasValidExecPrice = execPrice != null && !Number.isNaN(execPrice) && execPrice > 0;
  const isPendingType = PENDING_TYPES.includes(type);

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
  if (stopLoss != null) orderDoc.stopLoss = stopLoss;
  if (takeProfit != null) orderDoc.takeProfit = takeProfit;
  if (type === MARKET && hasValidExecPrice) orderDoc.price = execPrice;

  await validateTradingPermission(userId, accountId, { symbol, volume });

  // Market orders require execution price; reject before creating order
  if (type === MARKET && !hasValidExecPrice) {
    const err = new Error('Market orders require a current price. Please wait for the price feed or provide execution price.');
    err.statusCode = 400;
    throw err;
  }

  const orderId = await orderRepo.create(orderDoc);
  console.log('[orders] order created', { orderId, symbol: orderDoc.symbol, side: orderDoc.side, volume: orderDoc.volume, type: orderDoc.type });

  // Market order with execution price → route through execution layer (A_BOOK / B_BOOK / HYBRID)
  if (type === MARKET && hasValidExecPrice) {
    const order = await orderRepo.findById(orderId, userId, accountId);
    const result = await executionRouter.route(order, execPrice);
    console.log('[orders] execution route result', { orderId, path: result.path, success: result.success, positionId: result.positionId, reason: result.reason });
    if (result.success) {
      const updatedOrder = await orderRepo.findById(orderId, userId, accountId);
      return { orderId, status: 'filled', order: updatedOrder, positionId: result.positionId };
    }
    const err = new Error(result.reason || 'Execution failed');
    err.statusCode = 502;
    throw err;
  }

  // Pending orders (buy_limit, sell_limit, buy_stop, sell_stop) → stored for trigger engine
  if (isPendingType) {
    const order = await orderRepo.findById(orderId, userId, accountId);
    return { orderId, status: 'pending', order };
  }

  // Legacy limit (no immediate fill)
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
  const pendingStatuses = ['pending', 'placed', 'partial'];
  if (!pendingStatuses.includes(order.status)) {
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

async function updateOrderPrice(userId, orderId, price, accountId = null) {
  const order = await orderRepo.findById(orderId, userId, accountId);
  if (!order) {
    const err = new Error('Order not found');
    err.statusCode = 404;
    throw err;
  }
  if (!PENDING_TYPES.includes(order.type)) {
    const err = new Error('Only pending orders can have price modified');
    err.statusCode = 400;
    throw err;
  }
  if (!['pending', 'placed'].includes(order.status)) {
    const err = new Error(`Order cannot be modified (status: ${order.status})`);
    err.statusCode = 400;
    throw err;
  }
  const p = Number(price);
  if (!Number.isFinite(p) || p <= 0) {
    const err = new Error('Price must be a positive number');
    err.statusCode = 400;
    throw err;
  }
  return orderRepo.updateOrder(orderId, userId, { price: p }, accountId);
}

export default { placeOrder, cancelOrder, listOrders, getOrder, updateOrderPrice };
