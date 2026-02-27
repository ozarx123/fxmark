/**
 * Trading limits service — enforce block and drawdown limits before trading
 */
import tradingLimitsRepo from './trading-limits.repository.js';
import pnlService from '../finance/pnl.service.js';

/** Get start and end of today (UTC) */
function getTodayRange() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

/**
 * Check if user can trade. Throws if blocked or daily loss limit exceeded.
 * @param {string} userId
 * @param {number} [additionalPnl] - P&L from a pending close (adds to daily before check)
 * @param {boolean} [bypassAdmin] - if true, skip check (for admin actions)
 */
export async function checkTradingAllowed(userId, additionalPnl = 0, bypassAdmin = false) {
  if (bypassAdmin) return;
  const limits = await tradingLimitsRepo.getByUserId(userId);
  if (!limits) return;

  if (limits.blocked) {
    const err = new Error('Trading is blocked for this account. Contact support.');
    err.statusCode = 403;
    throw err;
  }

  const maxDailyLoss = limits.maxDailyLoss;
  if (maxDailyLoss != null && Number.isFinite(maxDailyLoss) && maxDailyLoss > 0) {
    const { start, end } = getTodayRange();
    const { realized } = await pnlService.getPnlForPeriod(userId, start.toISOString(), end.toISOString());
    const dailyPnl = (realized ?? 0) + (additionalPnl ?? 0);
    if (dailyPnl < -maxDailyLoss) {
      const err = new Error(
        `Daily loss limit ($${maxDailyLoss}) exceeded. Current daily P&L: $${(realized ?? 0).toFixed(2)}.`
      );
      err.statusCode = 403;
      throw err;
    }
  }
}
