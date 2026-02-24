/**
 * Ledger controller — entries, balances, statements
 */
import ledgerService from './ledger.service.js';
import pnlService from './pnl.service.js';
import reconciliationService from './reconciliation.service.js';
import { ACCOUNT_NAMES } from './chart-of-accounts.js';

async function getEntries(req, res, next) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const { accountCode, from, to, limit } = req.query;
    const list = await ledgerService.listEntries(userId, {
      accountCode: accountCode || undefined,
      from: from || undefined,
      to: to || undefined,
      limit: Math.min(parseInt(limit, 10) || 50, 200),
    });
    const withAccountName = list.map((e) => ({ ...e, accountName: ACCOUNT_NAMES[e.accountCode] || e.accountCode }));
    res.json(withAccountName);
  } catch (e) {
    next(e);
  }
}

async function getBalances(req, res, next) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const { asOf } = req.query;
    const balances = await ledgerService.getBalances(userId, asOf || null);
    const withNames = Object.entries(balances).map(([code, balance]) => ({
      accountCode: code,
      accountName: ACCOUNT_NAMES[code] || code,
      balance,
    }));
    res.json(withNames);
  } catch (e) {
    next(e);
  }
}

async function getPnl(req, res, next) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const { from, to } = req.query;
    const pnl = from || to
      ? await pnlService.getPnlForPeriod(userId, from, to)
      : await pnlService.getPnl(userId, from, to);
    res.json(pnl);
  } catch (e) {
    next(e);
  }
}

async function getReconciliation(req, res, next) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const { currency } = req.query;
    const result = await reconciliationService.runReconciliation(userId, currency || 'USD');
    res.json(result);
  } catch (e) {
    next(e);
  }
}

export default {
  getEntries,
  getBalances,
  getPnl,
  getReconciliation,
};
