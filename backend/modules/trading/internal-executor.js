/**
 * Internal (B-Book) executor — executes orders inside the broker without sending to LP.
 * Used when execution mode is B_BOOK or when HYBRID rules choose B_BOOK.
 */
import positionsService from './positions.service.js';
import orderRepo from './order.repository.js';

/**
 * Execute a market order internally: open position and mark order filled.
 * Used by ExecutionRouter for B_BOOK path.
 */
export async function executeMarketOrder(order, executionPrice) {
  if (!order?.id || !order?.userId) {
    throw new Error('Invalid order');
  }
  const price = Number(executionPrice);
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error('Invalid execution price');
  }
  const position = await positionsService.openPosition(order.userId, {
    symbol: order.symbol,
    side: order.side,
    volume: order.volume,
    openPrice: price,
    currentPrice: price,
    pnl: 0,
    accountId: order.accountId ?? null,
    takeProfit: order.takeProfit ?? null,
    stopLoss: order.stopLoss ?? null,
  });
  await orderRepo.updateStatus(order.id, order.userId, 'filled', {
    filledVolume: order.volume,
    price,
    positionId: position?.id ?? null,
  }, order.accountId);
  return { positionId: position?.id, executionPrice: price };
}

export default { executeMarketOrder };
