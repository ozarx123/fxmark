/**
 * Hybrid execution rules evaluator.
 * Decides A_BOOK (route to LP) vs B_BOOK (internal execution) per order.
 * Modular for future expansion (news time, symbol tiers, etc.).
 */
import positionRepo from './position.repository.js';
import executionModeService from './execution-mode.service.js';

function normalizeSymbol(s) {
  return String(s || '').replace(/\//g, '').toUpperCase();
}

/**
 * Get total open exposure (volume) per symbol for a user (and optional account).
 */
async function getExposureBySymbol(userId, accountId = null) {
  const positions = await positionRepo.listOpen(userId, { limit: 500, accountId });
  const bySymbol = new Map();
  for (const p of positions) {
    const sym = normalizeSymbol(p.symbol);
    const vol = Number(p.volume) || 0;
    bySymbol.set(sym, (bySymbol.get(sym) || 0) + vol);
  }
  return bySymbol;
}

/**
 * Check if user is "profitable" (simplified: no PnL history check; placeholder for future).
 * For now we don't have a profitableTrader flag per user — can be extended with user metadata or ledger.
 */
async function isProfitableTrader(userId) {
  return false;
}

/**
 * Evaluate hybrid rules and return 'A_BOOK' or 'B_BOOK'.
 * Rules (from settings):
 * - volumeThresholdToABook: if order volume > this → A_BOOK
 * - maxInternalExposurePerSymbol: if current exposure + order volume > this → A_BOOK
 * - profitableTraderToABook: if true and trader is profitable → A_BOOK
 * - newsTimeForceABook: if true and in news window → A_BOOK (not implemented yet)
 */
export async function evaluate(order, context = {}) {
  const rules = await executionModeService.getHybridRules();
  const volumeThreshold = Number(rules.volumeThresholdToABook) ?? 5;
  const maxExposurePerSymbol = Number(rules.maxInternalExposurePerSymbol) ?? 100;
  const profitableToABook = rules.profitableTraderToABook === true;

  const orderVolume = Number(order.volume) || 0;
  const symbol = normalizeSymbol(order.symbol);

  if (orderVolume > volumeThreshold) {
    return 'A_BOOK';
  }

  const exposure = await getExposureBySymbol(order.userId, order.accountId);
  const currentExposure = exposure.get(symbol) || 0;
  if (currentExposure + orderVolume > maxExposurePerSymbol) {
    return 'A_BOOK';
  }

  if (profitableToABook) {
    const profitable = await isProfitableTrader(order.userId);
    if (profitable) return 'A_BOOK';
  }

  return 'B_BOOK';
}

export default { evaluate };
