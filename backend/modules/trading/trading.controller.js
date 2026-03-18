/**
 * Trading controller — orders and positions
 */
import orderService from './order.service.js';
import positionsService from './positions.service.js';
import { emitTradeUpdate, emitOrderCreated, emitOrderCancelled } from '../../src/services/tradeEvents.js';

// ---------- Orders ----------
async function placeOrder(req, res, next) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const accountId = req.activeAccount?.id ?? req.body.accountId;
    console.log('[orders] placeOrder request', { userId, accountId, body: req.body });
    const result = await orderService.placeOrder(userId, req.body, accountId);
    console.log('[orders] placeOrder result', { orderId: result.orderId, status: result.status, positionId: result.positionId });
    if (result.order) emitOrderCreated(userId, result.order, accountId);
    emitTradeUpdate(userId, accountId).catch(() => {});
    res.status(201).json(result);
  } catch (e) {
    if (e.statusCode) return next(e);
    const wrapped = new Error('Trading execution failed. Please try again or contact support.');
    wrapped.statusCode = 500;
    wrapped.cause = e;
    next(wrapped);
  }
}

async function cancelOrder(req, res, next) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const { orderId } = req.params;
    const accountId = req.activeAccount?.id;
    console.log('[orders] cancelOrder', { userId, orderId, accountId });
    const result = await orderService.cancelOrder(userId, orderId, accountId);
    console.log('[orders] cancelOrder result', { orderId, status: result.status });
    emitOrderCancelled(userId, orderId, accountId);
    emitTradeUpdate(userId, accountId).catch(() => {});
    res.json(result);
  } catch (e) {
    next(e);
  }
}

async function listOrders(req, res, next) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const status = req.query.status;
    const symbol = req.query.symbol;
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
    const accountId = req.activeAccount?.id;
    const list = await orderService.listOrders(userId, { status, symbol, limit, accountId });
    res.json(list);
  } catch (e) {
    next(e);
  }
}

async function getOrder(req, res, next) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const { orderId } = req.params;
    const accountId = req.activeAccount?.id;
    const order = await orderService.getOrder(userId, orderId, accountId);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json(order);
  } catch (e) {
    next(e);
  }
}

async function updateOrder(req, res, next) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const { orderId } = req.params;
    const { price } = req.body;
    const accountId = req.activeAccount?.id;
    const order = await orderService.updateOrderPrice(userId, orderId, price, accountId);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    emitTradeUpdate(userId, accountId).catch(() => {});
    res.json(order);
  } catch (e) {
    if (e.statusCode) return next(e);
    next(e);
  }
}

// ---------- Positions ----------
async function getOpenPositions(req, res, next) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const symbol = req.query.symbol;
    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 200);
    const accountId = req.activeAccount?.id;
    const list = await positionsService.getOpenPositions(userId, { symbol, limit, accountId });
    res.json(list);
  } catch (e) {
    next(e);
  }
}

async function getClosedPositions(req, res, next) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const { from, to, symbol, limit } = req.query;
    const accountId = req.activeAccount?.id;
    const list = await positionsService.getClosedPositions(userId, {
      from,
      to,
      symbol,
      limit: Math.min(parseInt(limit, 10) || 50, 100),
      accountId,
    });
    res.json(list);
  } catch (e) {
    next(e);
  }
}

async function getPosition(req, res, next) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const { positionId } = req.params;
    const accountId = req.activeAccount?.id;
    const position = await positionsService.getPosition(userId, positionId, accountId);
    if (!position) return res.status(404).json({ error: 'Position not found' });
    res.json(position);
  } catch (e) {
    next(e);
  }
}

async function closePosition(req, res, next) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const { positionId } = req.params;
    const { volume, pnl, closePrice } = req.body;
    const accountId = req.activeAccount?.id;
    // Diagnostic: log which account the middleware resolved (missing X-Account-Id => default demo)
    console.log('[trading] closePosition', { userId, positionId, activeAccountId: accountId, activeAccountType: req.activeAccount?.type ?? null });
    const result = await positionsService.closePosition(userId, positionId, { volume, pnl, closePrice, accountId });
    emitTradeUpdate(userId, null).catch(() => {});
    res.json(result);
  } catch (e) {
    next(e);
  }
}

async function updatePositionTPLS(req, res, next) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const { positionId } = req.params;
    const { takeProfit, stopLoss } = req.body;
    const accountId = req.activeAccount?.id;
    const position = await positionsService.updatePositionTPLS(userId, positionId, { takeProfit, stopLoss }, accountId);
    emitTradeUpdate(userId, null).catch(() => {});
    res.json(position);
  } catch (e) {
    next(e);
  }
}

export default {
  placeOrder,
  cancelOrder,
  listOrders,
  getOrder,
  updateOrder,
  getOpenPositions,
  getClosedPositions,
  getPosition,
  closePosition,
  updatePositionTPLS,
};
