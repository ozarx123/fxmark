/**
 * Trading account service — list, create, get balance
 * PAMM accounts are NOT included in listAccounts (used by header). Fetch via PAMM module.
 */
import tradingAccountRepo from './trading-account.repository.js';

async function listAccounts(userId) {
  let accounts = await tradingAccountRepo.listByUser(userId);
  const hasDemo = accounts.some((a) => a.type === 'demo');
  const hasLive = accounts.some((a) => a.type === 'live');
  if (!hasDemo) await tradingAccountRepo.getOrCreateDefaultDemo(userId);
  if (!hasLive) await tradingAccountRepo.getOrCreateDefaultLive(userId);
  if (!hasDemo || !hasLive) {
    accounts = await tradingAccountRepo.listByUser(userId);
  }
  return accounts.filter((a) => a.type !== 'pamm');
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
};
