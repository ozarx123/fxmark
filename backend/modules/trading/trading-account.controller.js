/**
 * Trading account controller — list, create, get balance
 */
import tradingAccountService from './trading-account.service.js';

async function listAccounts(req, res, next) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const accounts = await tradingAccountService.listAccounts(userId);
    res.json(accounts);
  } catch (e) {
    next(e);
  }
}

async function createAccount(req, res, next) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const { type, name, balance } = req.body;
    const account = await tradingAccountService.createAccount(userId, { type, name, balance });
    res.status(201).json(account);
  } catch (e) {
    next(e);
  }
}

async function getAccount(req, res, next) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const { accountId } = req.params;
    const account = await tradingAccountService.getAccount(userId, accountId);
    if (!account) return res.status(404).json({ error: 'Account not found' });
    res.json(account);
  } catch (e) {
    next(e);
  }
}

async function getAccountSummary(req, res, next) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const accountId = req.activeAccount?.id;
    if (!accountId) return res.status(400).json({ error: 'No active account. Send X-Account-Id or X-Account-Number.' });
    const summary = await tradingAccountService.getAccountSummary(userId, accountId);
    if (!summary) return res.status(404).json({ error: 'Account not found' });
    res.json(summary);
  } catch (e) {
    next(e);
  }
}

export default { listAccounts, createAccount, getAccount, getAccountSummary };
