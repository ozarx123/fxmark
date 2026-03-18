/**
 * Trading account service — list, create, get balance, account summary
 * PAMM accounts are included so Bull Run fund managers can trade using the fund's live account.
 */
import tradingAccountRepo from './trading-account.repository.js';
import positionsService from './positions.service.js';
import walletRepo from '../wallet/wallet.repository.js';

/** Contract size for margin: XAU/GOLD 100 oz, forex 100k units. */
function getContractSize(symbol) {
  const s = String(symbol || '').toUpperCase();
  return (s.includes('XAU') || s === 'GOLD') ? 100 : 100000;
}

/**
 * Get account summary (balance, equity, marginUsed, freeMargin, marginLevel).
 * Used by GET /trading/account-summary.
 * - Demo: balance/equity from trading_accounts (DB).
 * - Live: balance/equity from wallet (DB) so terminal shows real funds.
 * Equity = balance server-side (floating PnL would require live prices).
 */
async function getAccountSummary(userId, accountId) {
  const account = await getAccount(userId, accountId);
  if (!account) return null;

  let balance = Number(account.balance) ?? 0;
  if (account.type === 'live') {
    try {
      const wallet = await walletRepo.getOrCreateWallet(userId, account.currency || 'USD');
      balance = Number(wallet.balance) ?? 0;
    } catch (e) {
      // keep balance 0 if wallet fetch fails
    }
  }

  const leverage = Math.max(1, Number(account.leverage) || 100);
  const positions = await positionsService.getOpenPositions(userId, { accountId, limit: 500 });
  let marginUsed = 0;
  for (const pos of positions) {
    const openPrice = Number(pos.openPrice ?? pos.open_price) || 0;
    const volume = Number(pos.volume ?? pos.lots) || 0;
    if (openPrice && volume) {
      const contractSize = getContractSize(pos.symbol);
      marginUsed += (volume * contractSize * openPrice) / leverage;
    }
  }
  const equity = balance;
  const freeMargin = Math.max(0, equity - marginUsed);
  const marginLevel = marginUsed > 0 ? (equity / marginUsed) * 100 : null;
  return {
    balance,
    equity,
    marginUsed,
    freeMargin,
    marginLevel,
  };
}

async function listAccounts(userId) {
  let accounts = await tradingAccountRepo.listByUser(userId);
  const hasDemo = accounts.some((a) => a.type === 'demo');
  const hasLive = accounts.some((a) => a.type === 'live');
  if (!hasDemo) await tradingAccountRepo.getOrCreateDefaultDemo(userId);
  if (!hasLive) await tradingAccountRepo.getOrCreateDefaultLive(userId);
  if (!hasDemo || !hasLive) {
    accounts = await tradingAccountRepo.listByUser(userId);
  }
  return accounts;
}

async function getOrCreateDefaultDemo(userId) {
  return tradingAccountRepo.getOrCreateDefaultDemo(userId);
}

async function createAccount(userId, { type = 'demo', name, balance }) {
  if (type === 'pamm') {
    const err = new Error('PAMM accounts are created automatically when you register as a manager');
    err.statusCode = 400;
    throw err;
  }
  const bal = type === 'demo' ? (balance ?? 10000) : (balance ?? 0);
  const id = await tradingAccountRepo.create({
    userId,
    type: type || 'demo',
    balance: bal,
    name: name || `Account ${type}`,
  });
  return tradingAccountRepo.findById(id, userId);
}

async function getAccount(userId, accountId) {
  return tradingAccountRepo.findById(accountId, userId);
}

async function getAccountByNumber(userId, accountNumber) {
  return tradingAccountRepo.findByAccountNumber(accountNumber, userId);
}

async function resolveAccount(userId, accountIdOrNumber) {
  if (!accountIdOrNumber) return getOrCreateDefaultDemo(userId);
  if (accountIdOrNumber.startsWith('FX-') || accountIdOrNumber.startsWith('PAMM-')) {
    return getAccountByNumber(userId, accountIdOrNumber);
  }
  return getAccount(userId, accountIdOrNumber);
}

export default {
  listAccounts,
  getOrCreateDefaultDemo,
  createAccount,
  getAccount,
  getAccountByNumber,
  resolveAccount,
  getAccountSummary,
};
