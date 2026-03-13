/**
 * Trading permission validator
 * Runs before order execution: client, account, KYC, block, symbol category, leverage.
 * Uses CRM integration as source of truth. Complements checkTradingAllowed (daily loss / drawdown).
 */
import crmIntegration from '../crm/crmIntegration.service.js';
import { checkTradingAllowed } from '../admin/trading-limits.service.js';

/**
 * Validate that the client and (if provided) account are allowed to trade.
 * Throws with statusCode and message on failure. Logs rejection reason.
 * Call this before placing an order; then call checkTradingAllowed for daily loss.
 *
 * @param {string} userId
 * @param {string|null} accountId - optional; if provided, account-level checks run
 * @param {{ symbol?: string, volume?: number }} context - for symbol category and future use
 */
export async function validateTradingPermission(userId, accountId, context = {}) {
  const { symbol } = context;
  const logMod = await import('../../utils/logger.js');
  const logger = logMod.default || logMod;

  const profile = await crmIntegration.getClientTradingProfile(userId);
  if (!profile) {
    logger.warn('Trading permission rejected: client not found', { userId, accountId });
    const err = new Error('Account not found. Please contact support.');
    err.statusCode = 404;
    throw err;
  }

  if (profile.blocked) {
    logger.warn('Trading permission rejected: account blocked', { userId, accountId });
    const err = new Error('Trading is blocked for this account. Contact support.');
    err.statusCode = 403;
    throw err;
  }

  // Allow trading when KYC approved or pending (pending = not yet verified, common for demo/dev)
  const kycBlocked = profile.kycStatus === 'rejected' || profile.kycStatus === 'denied';
  if (kycBlocked) {
    logger.warn('Trading permission rejected: KYC rejected', { userId, kycStatus: profile.kycStatus });
    const err = new Error('Trading is not allowed. Identity verification was not approved.');
    err.statusCode = 403;
    throw err;
  }

  if (accountId) {
    const permissions = await crmIntegration.getTradingPermissions(accountId, userId);
    if (!permissions) {
      logger.warn('Trading permission rejected: trading account not found', { userId, accountId });
      const err = new Error('Trading account not found.');
      err.statusCode = 404;
      throw err;
    }

    if (permissions.accountBlocked || !permissions.tradingEnabled) {
      logger.warn('Trading permission rejected: account disabled or blocked', { userId, accountId });
      const err = new Error('Trading is disabled for this account. Contact support.');
      err.statusCode = 403;
      throw err;
    }

    if (!permissions.tradingAllowed) {
      const err = new Error('Trading is not allowed for this account.');
      err.statusCode = 403;
      throw err;
    }

    if (symbol) {
      const category = crmIntegration.getSymbolCategory(symbol);
      const allowed =
        (category === 'forex' && permissions.canTradeForex) ||
        (category === 'metals' && permissions.canTradeMetals) ||
        (category === 'crypto' && permissions.canTradeCrypto);
      if (!allowed) {
        logger.warn('Trading permission rejected: symbol category not allowed', { userId, accountId, symbol, category });
        const err = new Error(`Trading for ${category} is not allowed on this account.`);
        err.statusCode = 403;
        throw err;
      }
    }

    if (permissions.leverage != null && Number.isFinite(permissions.leverage) && permissions.leverage <= 0) {
      logger.warn('Trading permission rejected: no leverage', { userId, accountId });
      const err = new Error('Trading is not allowed: leverage not set.');
      err.statusCode = 403;
      throw err;
    }
  }

  await checkTradingAllowed(userId);
}

export default { validateTradingPermission };
