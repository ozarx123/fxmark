/**
 * Finance reports controller — daily/monthly statements from ledger
 */
import ledgerService from './ledger.service.js';
import pnlService from './pnl.service.js';
import { ACCOUNT_NAMES } from './chart-of-accounts.js';

async function dailyReport(req, res, next) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const entries = await ledgerService.listEntries(userId, {
      from: today.toISOString(),
      to: tomorrow.toISOString(),
      limit: 500,
    });
    const balances = await ledgerService.getBalances(userId, tomorrow.toISOString());
    const pnl = await pnlService.getPnlForPeriod(userId, today.toISOString(), tomorrow.toISOString());
    res.json({
      period: 'daily',
      date: today.toISOString().slice(0, 10),
      entries: entries.map((e) => ({ ...e, accountName: ACCOUNT_NAMES[e.accountCode] || e.accountCode })),
      balances: Object.entries(balances).map(([code, bal]) => ({ accountCode: code, accountName: ACCOUNT_NAMES[code] || code, balance: bal })),
      pnl,
    });
  } catch (e) {
    next(e);
  }
}

async function monthlyReport(req, res, next) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const { year, month } = req.query;
    const y = parseInt(year, 10) || new Date().getFullYear();
    const m = parseInt(month, 10) || new Date().getMonth() + 1;
    const from = new Date(y, m - 1, 1);
    const to = new Date(y, m, 0, 23, 59, 59, 999);
    const entries = await ledgerService.listEntries(userId, {
      from: from.toISOString(),
      to: to.toISOString(),
      limit: 1000,
    });
    const balances = await ledgerService.getBalances(userId, to.toISOString());
    const pnl = await pnlService.getPnlForPeriod(userId, from.toISOString(), to.toISOString());
    res.json({
      period: 'monthly',
      year: y,
      month: m,
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
      entries: entries.map((e) => ({ ...e, accountName: ACCOUNT_NAMES[e.accountCode] || e.accountCode })),
      balances: Object.entries(balances).map(([code, bal]) => ({ accountCode: code, accountName: ACCOUNT_NAMES[code] || code, balance: bal })),
      pnl,
    });
  } catch (e) {
    next(e);
  }
}

async function statement(req, res, next) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const { from, to, accountCode, limit } = req.query;
    const fromDate = from ? new Date(from) : new Date(new Date().setDate(new Date().getDate() - 30));
    const toDate = to ? new Date(to) : new Date();
    fromDate.setHours(0, 0, 0, 0);
    toDate.setHours(23, 59, 59, 999);
    const entries = await ledgerService.listEntries(userId, {
      from: fromDate.toISOString(),
      to: toDate.toISOString(),
      accountCode: accountCode || undefined,
      limit: Math.min(parseInt(limit, 10) || 500, 2000),
    });
    const balances = await ledgerService.getBalances(userId, toDate.toISOString());
    const pnl = await pnlService.getPnlForPeriod(userId, fromDate.toISOString(), toDate.toISOString());
    const withNames = entries.map((e) => ({ ...e, accountName: ACCOUNT_NAMES[e.accountCode] || e.accountCode }));
    res.json({
      from: fromDate.toISOString().slice(0, 10),
      to: toDate.toISOString().slice(0, 10),
      entries: withNames,
      balances: Object.entries(balances).map(([code, bal]) => ({ accountCode: code, accountName: ACCOUNT_NAMES[code] || code, balance: bal })),
      pnl,
    });
  } catch (e) {
    next(e);
  }
}

export default { dailyReport, monthlyReport, statement };
