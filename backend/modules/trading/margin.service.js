/**
 * Margin — free margin vs required margin for new exposure (pre-trade).
 */
import tradingAccountService from './trading-account.service.js';

function getContractSize(symbol) {
  const s = String(symbol || '').toUpperCase();
  return s.includes('XAU') || s === 'GOLD' ? 100 : 100000;
}

/** Snapshot aligned with GET /trading/account-summary (balance, equity incl. floating PnL, margin fields). */
export async function getMargin(userId, accountId) {
  const summary = await tradingAccountService.getAccountSummary(userId, accountId);
  if (!summary) {
    return {
      balance: 0,
      equity: 0,
      marginUsed: 0,
      freeMargin: 0,
      marginLevel: null,
    };
  }
  return {
    balance: summary.balance,
    equity: summary.equity,
    marginUsed: summary.marginUsed,
    freeMargin: summary.freeMargin,
    marginLevel: summary.marginLevel,
  };
}

/**
 * Check if account has enough free margin to open `volume` lots at `openPrice`.
 * @returns {{ allowed: boolean, reason?: string, requiredMargin?: number, freeMargin?: number }}
 */
export async function checkMarginForNewPosition(userId, accountId, symbol, volume, openPrice) {
  if (!userId || !accountId) {
    return { allowed: false, reason: 'Trading account is required for margin check' };
  }
  const account = await tradingAccountService.getAccount(userId, accountId);
  if (!account) {
    return { allowed: false, reason: 'Account not found' };
  }
  const summary = await tradingAccountService.getAccountSummary(userId, accountId);
  if (!summary) {
    return { allowed: false, reason: 'Could not load account summary' };
  }
  const leverage = Math.max(1, Number(account.leverage) || 100);
  const price = Number(openPrice);
  const vol = Number(volume);
  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(vol) || vol <= 0) {
    return { allowed: false, reason: 'Invalid price or volume for margin check' };
  }
  const contractSize = getContractSize(symbol);
  const requiredMargin = (vol * contractSize * price) / leverage;
  const freeMargin = Number(summary.freeMargin) || 0;
  const eps = 1e-6;
  if (requiredMargin > freeMargin + eps) {
    return {
      allowed: false,
      reason: `Insufficient free margin. Required ~${requiredMargin.toFixed(2)} USD, available ${freeMargin.toFixed(2)} USD`,
      requiredMargin,
      freeMargin,
    };
  }
  return { allowed: true, requiredMargin, freeMargin };
}

/** Legacy name — prefer checkMarginForNewPosition */
export async function checkMargin(userId, accountId, symbol, volume, openPrice) {
  return checkMarginForNewPosition(userId, accountId, symbol, volume, openPrice);
}

export default { getMargin, checkMargin, checkMarginForNewPosition };
