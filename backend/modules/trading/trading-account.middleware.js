/**
 * Resolve active trading account from X-Account-Id or X-Account-Number header.
 * Sets req.activeAccount (or default demo if not specified).
 */
import tradingAccountService from './trading-account.service.js';

export async function resolveTradingAccount(req, res, next) {
  try {
    const userId = req.user?.id;
    if (!userId) return next();
    const accountId = req.headers['x-account-id'];
    const accountNumber = req.headers['x-account-number'];
    const key = accountId || accountNumber || null;
    req.activeAccount = await tradingAccountService.resolveAccount(userId, key);
    next();
  } catch (e) {
    req.activeAccount = null;
    next();
  }
}
