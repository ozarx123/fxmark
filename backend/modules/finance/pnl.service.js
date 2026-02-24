/**
 * P&L service — realized/unrealized P&L by user, period (from ledger)
 */
import ledgerRepo from './ledger.repository.js';
import { ACCOUNTS } from './chart-of-accounts.js';

async function getPnl(userId, from, to) {
  const balances = await ledgerRepo.getBalancesByEntity(userId, to);
  const walletBalance = balances[ACCOUNTS.WALLET] ?? 0;
  const tradingPnl = balances[ACCOUNTS.TRADING_PNL] ?? 0;
  const receivables = balances[ACCOUNTS.RECEIVABLES] ?? 0;

  return {
    realized: tradingPnl,
    unrealized: 0,
    walletBalance,
    tradingPnl,
    receivables,
    currency: 'USD',
  };
}

/** Get P&L for date range from ledger entries */
async function getPnlForPeriod(userId, from, to) {
  const entries = await ledgerRepo.listByEntity(userId, { from, to, limit: 1000 });
  let tradingPnl = 0;
  for (const e of entries) {
    if (e.accountCode === ACCOUNTS.TRADING_PNL) {
      tradingPnl += (e.credit || 0) - (e.debit || 0);
    }
  }
  return { realized: tradingPnl, unrealized: 0, currency: 'USD' };
}

export default { getPnl, getPnlForPeriod };
