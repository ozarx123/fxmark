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
import marginService from './margin.service.js';
import { emitOrderTriggered, emitTradeUpdate } from '../../src/services/tradeEvents.js';

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
      if (order.accountId) {
        const marginCheck = await marginService.checkMarginForNewPosition(
          order.userId,
          order.accountId,
          order.symbol,
          order.volume,
          p
        );
        if (!marginCheck.allowed) {
          const reason = String(marginCheck.reason || 'Insufficient margin').slice(0, 500);
          await orderRepo.updateStatus(order.id, order.userId, 'rejected', { rejectReason: reason }, order.accountId);
          emitTradeUpdate(order.userId, order.accountId).catch(() => {});
          // eslint-disable-next-line no-console
          console.warn('[pendingOrders] Trigger rejected (margin):', order.id, reason);
          continue;
        }
      }
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
      await orderRepo.updateStatus(order.id, order.userId, 'filled', {
        filledVolume: order.volume,
        price: p,
        positionId: position?.id ?? null,
      }, order.accountId);
      const updatedOrder = await orderRepo.findById(order.id, order.userId, order.accountId);
      await emitOrderTriggered(order.userId, { ...updatedOrder, positionId: position?.id }, order.accountId);
      emitTradeUpdate(order.userId, order.accountId).catch(() => {});
    } catch (e) {
      const reason = String(e.message || 'Trigger execution failed').slice(0, 500);
      // eslint-disable-next-line no-console
      console.warn('[pendingOrders] Trigger execution failed:', order.id, reason);
      try {
        await orderRepo.updateStatus(order.id, order.userId, 'rejected', { rejectReason: reason }, order.accountId);
        emitTradeUpdate(order.userId, order.accountId).catch(() => {});
      } catch (e2) {
        // eslint-disable-next-line no-console
        console.warn('[pendingOrders] Failed to mark order rejected:', order.id, e2.message);
      }
    }
  }
}
export default {
  checkAndTriggerPendingOrders
};