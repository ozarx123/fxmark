/**
 * Pending orders trigger engine.
 * On each tick, check pending orders for that symbol and execute when price condition is met.
 *
 * BUY_LIMIT:  execute when market price <= order price
 * SELL_LIMIT: execute when market price >= order price
 * BUY_STOP:   execute when market price >= order price
 * SELL_STOP:  execute when market price <= order price
 */
import orderRepo from './order.repository.js';
import positionsService from './positions.service.js';
import { emitOrderTriggered } from '../../src/services/tradeEvents.js';

function isTriggered(orderType, orderPrice, marketPrice) {
  const p = Number(marketPrice);
  const op = Number(orderPrice);
  if (!Number.isFinite(p) || !Number.isFinite(op)) return false;
  switch (orderType) {
    case 'buy_limit':
      return p <= op;
    case 'sell_limit':
      return p >= op;
    case 'buy_stop':
      return p >= op;
    case 'sell_stop':
      return p <= op;
    default:
      return false;
  }
}

/**
 * Check all pending orders for symbol at current price; execute and mark filled when triggered.
 * Called from tick pipeline (e.g. after checkAndExecuteTPLS).
 */
export async function checkAndTriggerPendingOrders(symbol, price) {
  if (!symbol || !Number.isFinite(Number(price))) return;
  const pending = await orderRepo.listPendingBySymbol(symbol);
  if (!pending.length) return;
  const p = Number(price);

  for (const order of pending) {
    if (!isTriggered(order.type, order.price, p)) continue;

    try {
      const position = await positionsService.openPosition(order.userId, {
        symbol: order.symbol,
        side: order.side,
        volume: order.volume,
        openPrice: p,
        currentPrice: p,
        pnl: 0,
        accountId: order.accountId ?? null,
        takeProfit: order.takeProfit ?? null,
        stopLoss: order.stopLoss ?? null,
      });
      await orderRepo.updateStatus(order.id, order.userId, 'filled', { filledVolume: order.volume, price: p }, order.accountId);
      const updatedOrder = await orderRepo.findById(order.id, order.userId, order.accountId);
      await emitOrderTriggered(order.userId, { ...updatedOrder, positionId: position?.id }, order.accountId);
    } catch (e) {
      console.warn('[pendingOrders] Trigger execution failed:', order.id, e.message);
    }
  }
}
export default {
  checkAndTriggerPendingOrders
};