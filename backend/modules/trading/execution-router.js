/**
 * Execution router — central routing for all executable orders.
 * Every new order that requires immediate execution passes through this router.
 * Mode: A_BOOK → LP adapter, B_BOOK → internal executor, HYBRID → rules then one of the two.
 * Per-account execution group is available via crmIntegration.getExecutionGroup(order.accountId, order.userId)
 * for future group-level execution mode overrides.
 */
import executionModeService from './execution-mode.service.js';
import hybridRulesEvaluator from './hybrid-rules.evaluator.js';
import lpAdapter from './liquidity-provider.adapter.js';
import internalExecutor from './internal-executor.js';

/**
 * Resolve effective execution path: A_BOOK or B_BOOK.
 */
async function resolvePath(order, executionPrice) {
  const { executionMode } = await executionModeService.getExecutionMode();
  if (executionMode === 'A_BOOK') return 'A_BOOK';
  if (executionMode === 'B_BOOK') return 'B_BOOK';
  if (executionMode === 'HYBRID') {
    return hybridRulesEvaluator.evaluate(order, { executionPrice });
  }
  return 'B_BOOK';
}

/**
 * Route an order for execution. Call after order is created in DB.
 * Only used for orders that are executable immediately (e.g. market order with execution price).
 * For pending orders, no routing — they are filled later by pending order engine.
 *
 * @param {Object} order - order document with id, userId, symbol, side, volume, type, accountId, etc.
 * @param {number} executionPrice - price at which to execute (e.g. market price)
 * @returns {Promise<{ positionId?, executionPrice?, success, reason? }>}
 */
export async function route(order, executionPrice) {
  const path = await resolvePath(order, executionPrice);

  if (path === 'A_BOOK') {
    const result = await lpAdapter.sendOrder(order, executionPrice);
    if (result.success && result.positionId) {
      return { success: true, positionId: result.positionId, executionPrice: result.executionPrice, path: 'A_BOOK' };
    }
    if (result.success) {
      return { success: true, executionPrice: result.executionPrice, path: 'A_BOOK' };
    }
    return { success: false, reason: result.reason || 'LP execution failed', path: 'A_BOOK' };
  }

  if (path === 'B_BOOK') {
    try {
      const result = await internalExecutor.executeMarketOrder(order, executionPrice);
      return { success: true, positionId: result.positionId, executionPrice: result.executionPrice, path: 'B_BOOK' };
    } catch (e) {
      return { success: false, reason: e.message || 'Internal execution failed', path: 'B_BOOK' };
    }
  }

  return { success: false, reason: 'Unknown path' };
}

export default { route, resolvePath };
