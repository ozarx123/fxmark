/**
 * Ledger controller — entries, balances, statements, PAMM fund ledger
 */
import ledgerService from './ledger.service.js';
import pnlService from './pnl.service.js';
import reconciliationService from './reconciliation.service.js';
import { ACCOUNT_NAMES } from './chart-of-accounts.js';
import pammRepo from '../pamm/pamm.repository.js';

async function getEntries(req, res, next) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const { accountCode, from, to, limit, referenceType } = req.query;
    const list = await ledgerService.listEntries(userId, {
      accountCode: accountCode || undefined,
      from: from || undefined,
      to: to || undefined,
      limit: Math.min(parseInt(limit, 10) || 50, 200),
      referenceType: referenceType || undefined,
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

async function getPammFundLedger(req, res, next) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const { fundId } = req.params;
    const fund = await pammRepo.getManagerById(fundId);
    if (!fund) return res.status(404).json({ error: 'PAMM fund not found' });
    if (fund.userId !== userId) return res.status(403).json({ error: 'Not authorized to view this fund ledger' });
    const { from, to, limit, referenceType } = req.query;
    const list = await ledgerService.listLedgerEntriesByPammFund(fundId, {
      from: from || undefined,
      to: to || undefined,
      limit: Math.min(parseInt(limit, 10) || 100, 200),
      referenceType: referenceType || undefined,
    });
    const withAccountName = list.map((e) => ({ ...e, accountName: ACCOUNT_NAMES[e.accountCode] || e.accountCode }));
    res.json(withAccountName);
  } catch (e) {
    next(e);
  }
}

export default {
  getEntries,
  getBalances,
  getPnl,
  getReconciliation,
  getPammFundLedger,
};
