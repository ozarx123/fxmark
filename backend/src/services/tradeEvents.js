/**
 * Trade events — emit position/order updates to users via Socket.IO.
 * Replaces internal REST polling with WebSocket push from pool.
 */
import { getTradeIo } from '../websocket.js';
import positionsService from '../../modules/trading/positions.service.js';
import orderService from '../../modules/trading/order.service.js';

function userRoom(userId) {
  return `user:${String(userId)}`;
}

/**
 * Emit full trade snapshot to user (positions, orders).
 * Called after any trade mutation.
 */
export async function emitTradeUpdate(userId, accountId = null) {
  const io = getTradeIo();
  if (!io) return;
  try {
    const [positions, orders] = await Promise.all([
      positionsService.getOpenPositions(userId, { limit: 200, accountId }),
      orderService.listOrders(userId, { limit: 100, accountId }),
    ]);
    const pendingOrders = orders.filter((o) => ['pending', 'placed', 'partial'].includes(o.status || ''));
    io.to(userRoom(userId)).emit('trade:update', {
      positions,
      orders: pendingOrders,
      at: new Date().toISOString(),
      accountId: accountId != null ? String(accountId) : null,
    });
  } catch (e) {
    console.warn('[tradeEvents] emitTradeUpdate failed:', e.message);
  }
}

/**
 * Emit order_created (new pending/market order placed).
 */
export function emitOrderCreated(userId, order, accountId = null) {
  const io = getTradeIo();
  if (!io) return;
  io.to(userRoom(userId)).emit('order_created', { order, accountId, at: new Date().toISOString() });
  io.to(userRoom(userId)).emit('order_update', { event: 'order_created', order, accountId });
}

/**
 * Emit order_triggered (pending order filled by price engine).
 */
export function emitOrderTriggered(userId, payload, accountId = null) {
  const io = getTradeIo();
  if (!io) return;
  io.to(userRoom(userId)).emit('order_triggered', payload);
  io.to(userRoom(userId)).emit('order_update', { event: 'order_triggered', ...payload, accountId });
}

/**
 * Emit order_cancelled.
 */
export function emitOrderCancelled(userId, orderId, accountId = null) {
  const io = getTradeIo();
  if (!io) return;
  io.to(userRoom(userId)).emit('order_cancelled', { orderId, accountId, at: new Date().toISOString() });
  io.to(userRoom(userId)).emit('order_update', { event: 'order_cancelled', orderId, accountId });
}

/**
 * Emit a risk_event (e.g. TP/SL triggered, forced close).
 */
export function emitRiskEvent(userId, payload) {
  const io = getTradeIo();
  if (!io) return;
  io.to(userRoom(userId)).emit('risk_event', {
    ...payload,
    at: payload?.at || new Date().toISOString(),
  });
}
