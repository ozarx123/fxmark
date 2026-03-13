/**
 * CRM Integration Service
 * Single source of truth for trading engine: client/account status, permissions, groups.
 * Normalizes user + trading account + trading limits into a trading-safe profile.
 */
import userRepo from '../users/user.repository.js';
import tradingAccountRepo from '../trading/trading-account.repository.js';
import tradingLimitsRepo from '../admin/trading-limits.repository.js';

const DEFAULT_LEVERAGE = 500;
const KYC_APPROVED = 'approved';
const KYC_PENDING = 'pending';
const KYC_REJECTED = 'rejected';

/**
 * Normalize account doc to include CRM defaults when fields are absent.
 */
function normalizeAccount(account) {
  if (!account) return null;
  return {
    ...account,
    accountGroup: account.accountGroup ?? null,
    executionGroup: account.executionGroup ?? null,
    riskGroup: account.riskGroup ?? null,
    leverage: account.leverage != null && Number.isFinite(Number(account.leverage)) ? Number(account.leverage) : DEFAULT_LEVERAGE,
    tradingEnabled: account.tradingEnabled !== false,
    accountBlocked: !!account.accountBlocked,
    canTradeForex: account.canTradeForex !== false,
    canTradeMetals: account.canTradeMetals !== false,
    canTradeCrypto: account.canTradeCrypto !== false,
  };
}

/**
 * Client trading profile (user + limits). Used for user-level checks.
 */
export async function getClientTradingProfile(userId) {
  const [user, limits] = await Promise.all([
    userRepo.findById(userId),
    tradingLimitsRepo.getByUserId(userId),
  ]);
  if (!user) return null;
  return {
    userId: user.id,
    email: user.email,
    role: user.role,
    kycStatus: user.kycStatus || KYC_PENDING,
    blocked: limits?.blocked ?? false,
    maxDailyLoss: limits?.maxDailyLoss ?? null,
    maxDrawdownPercent: limits?.maxDrawdownPercent ?? null,
  };
}

/**
 * Trading account config (CRM fields normalized). Use for order/position logic.
 * @param {string} accountId
 * @param {string} [userId] - optional; if provided, ensures account belongs to user
 */
export async function getTradingAccountConfig(accountId, userId) {
  if (!accountId) return null;
  const account = await tradingAccountRepo.findById(accountId, userId ?? null);
  if (!account) return null;
  return normalizeAccount(account);
}

/**
 * Full trading permissions for an account: client profile + account config merged.
 */
export async function getTradingPermissions(accountId, userId) {
  const account = await tradingAccountRepo.findById(accountId, userId);
  if (!account) return null;
  const profile = await getClientTradingProfile(account.userId);
  if (!profile) return null;
  const config = normalizeAccount(account);
  return {
    ...profile,
    accountId: account.id,
    accountNumber: account.accountNumber,
    type: account.type,
    ...config,
    tradingAllowed: !profile.blocked && !config.accountBlocked && config.tradingEnabled,
    kycAllowsTrading: profile.kycStatus === KYC_APPROVED,
  };
}

/**
 * Execution group for this account (for router/group-level execution mode).
 */
export async function getExecutionGroup(accountId, userId) {
  const config = await getTradingAccountConfig(accountId, userId);
  return config?.executionGroup ?? null;
}

/**
 * Risk group for this account.
 */
export async function getRiskGroup(accountId, userId) {
  const config = await getTradingAccountConfig(accountId, userId);
  return config?.riskGroup ?? null;
}

/**
 * Leverage for this account.
 */
export async function getLeverage(accountId, userId) {
  const config = await getTradingAccountConfig(accountId, userId);
  return config?.leverage ?? DEFAULT_LEVERAGE;
}

/**
 * Symbol category from symbol string (forex, metals, crypto). Used for canTrade* checks.
 */
export function getSymbolCategory(symbol) {
  const s = String(symbol || '').toUpperCase();
  if (s.includes('XAU') || s.includes('GOLD') || s.includes('XAG') || s.includes('SILVER')) return 'metals';
  if (s.includes('BTC') || s.includes('ETH') || s.includes('CRYPTO')) return 'crypto';
  return 'forex';
}

export default {
  getClientTradingProfile,
  getTradingAccountConfig,
  getTradingPermissions,
  getExecutionGroup,
  getRiskGroup,
  getLeverage,
  getSymbolCategory,
  normalizeAccount,
};
