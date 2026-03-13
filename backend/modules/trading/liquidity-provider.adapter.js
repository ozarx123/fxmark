/**
 * Liquidity provider adapter — abstraction for LP connectivity.
 * Implementations: PrimeXM, OneZero, Integral, LMAX, custom bridges.
 * This stub returns placeholder execution until real LP is connected.
 */
import orderRepo from './order.repository.js';
import positionsService from './positions.service.js';

/**
 * Stub: send order to LP. For now executes internally and returns filled.
 * Replace with real LP client (PrimeXM, OneZero, etc.) when integrated.
 */
export async function sendOrder(order, executionPrice) {
  if (!order?.id || !order?.userId) {
    return { success: false, reason: 'Invalid order', externalId: null };
  }
  const price = executionPrice ?? order.price ?? 0;
  if (!price || !order.symbol || !order.volume || !order.side) {
    return { success: false, reason: 'Missing price/symbol/volume/side', externalId: null };
  }
  try {
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
    await orderRepo.updateStatus(order.id, order.userId, 'filled', { filledVolume: order.volume }, order.accountId);
    return {
      success: true,
      externalId: `stub-${order.id}`,
      status: 'filled',
      executionPrice: price,
      positionId: position?.id,
    };
  } catch (e) {
    return { success: false, reason: e.message || 'Execution failed', externalId: null };
  }
}

/**
 * Stub: cancel order at LP. For now cancels in DB only.
 */
export async function cancelOrder(orderId, userId, accountId = null) {
  await orderRepo.updateStatus(orderId, userId, 'cancelled', {}, accountId);
  return { success: true };
}

/**
 * Stub: modify order at LP. For now updates in DB only.
 */
export async function modifyOrder(orderId, userId, updates, accountId = null) {
  await orderRepo.updateOrder(orderId, userId, updates, accountId);
  return { success: true };
}

/**
 * Stub: get order status from LP. For now returns from DB.
 */
export async function getStatus(orderId, userId, accountId = null) {
  const order = await orderRepo.findById(orderId, userId, accountId);
  return order ? { status: order.status, externalId: null } : null;
}

export default {
  sendOrder,
  cancelOrder,
  modifyOrder,
  getStatus,
};
