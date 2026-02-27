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
    });
  } catch (e) {
    console.warn('[tradeEvents] emitTradeUpdate failed:', e.message);
  }
}
