/**
 * Admin: platform-wide (company) financial view from ledger + IB commissions
 */
import ledgerRepo from '../finance/ledger.repository.js';
import { ACCOUNT_NAMES, ACCOUNTS, ENTITY_COMPANY, getAccountType } from '../finance/chart-of-accounts.js';
import ibRepo from '../ib/ib.repository.js';

function parseRange(from, to) {
  const fromD = from ? new Date(from) : new Date(Date.now() - 30 * 864e5);
  const toD = to ? new Date(to) : new Date();
  fromD.setHours(0, 0, 0, 0);
  toD.setHours(23, 59, 59, 999);
  return { fromD, toD };
}

export async function getCompanyFinancials(query) {
  const { fromD, toD } = parseRange(query.from, query.to);

  const [periodRows, balanceEnd, ibPending, depositsPeriod, withdrawalsPeriod, companyCashBank] = await Promise.all([
    ledgerRepo.aggregatePeriodByAccount(fromD, toD),
    ledgerRepo.aggregateGlobalTrialBalanceAsOf(toD),
    ibRepo.sumAllPendingCommissions(),
    ledgerRepo.sumWalletFlowInPeriod(fromD, toD, 'deposit', 'credit'),
    ledgerRepo.sumWalletFlowInPeriod(fromD, toD, 'withdrawal', 'debit'),
    ledgerRepo.getBalance(ENTITY_COMPANY, ACCOUNTS.CASH_BANK, toD),
  ]);

  const periodActivity = periodRows.map((r) => ({
    accountCode: r.accountCode,
    accountName: ACCOUNT_NAMES[r.accountCode] || r.accountCode,
    debit: r.debit,
    credit: r.credit,
    entryCount: r.entryCount,
  }));

  const cashBankGlobal = balanceEnd[ACCOUNTS.CASH_BANK] ?? 0;
  const cashBank = Number(companyCashBank) ?? 0; // company-entity 1200 only (matches Company super wallet)

  const balanceRows = Object.entries(balanceEnd).map(([code, balance]) => ({
    accountCode: code,
    accountName: ACCOUNT_NAMES[code] || code,
    balance: code === ACCOUNTS.CASH_BANK ? cashBank : balance,
    type: getAccountType(code),
  }));
  balanceRows.sort((a, b) => a.accountCode.localeCompare(b.accountCode));

  const assets = balanceRows.filter((x) => x.type === 'asset');
  const liabilities = balanceRows.filter((x) => x.type === 'liability');
  const equity = balanceRows.filter((x) => x.type === 'equity');

  let revenuePeriod = 0;
  let expensePeriod = 0;
  const incomeLines = [];
  const expenseLines = [];
  for (const r of periodRows) {
    const code = r.accountCode;
    if (!code) continue;
    const name = ACCOUNT_NAMES[code] || code;
    if (code[0] === '4') {
      const net = (r.credit || 0) - (r.debit || 0);
      revenuePeriod += net;
      if (Math.abs(net) > 0.001 || r.entryCount) incomeLines.push({ label: name, value: net });
    }
    if (code[0] === '5') {
      const net = (r.debit || 0) - (r.credit || 0);
      expensePeriod += net;
      if (Math.abs(net) > 0.001 || r.entryCount) expenseLines.push({ label: name, value: net });
    }
  }

  const clientWalletLiability = balanceEnd[ACCOUNTS.WALLET] ?? 0;
  const receivables = balanceEnd[ACCOUNTS.RECEIVABLES] ?? 0;

  return {
    period: {
      from: fromD.toISOString().slice(0, 10),
      to: toD.toISOString().slice(0, 10),
      asOf: toD.toISOString().slice(0, 10),
    },
    summary: {
      clientWalletLiabilityUsd: Math.round(clientWalletLiability * 100) / 100,
      companyCashBankUsd: Math.round(cashBank * 100) / 100,
      companyCashBankPlatformTotalUsd: Math.round(cashBankGlobal * 100) / 100,
      receivablesUsd: Math.round(receivables * 100) / 100,
      depositsInPeriodUsd: Math.round(depositsPeriod * 100) / 100,
      withdrawalsInPeriodUsd: Math.round(withdrawalsPeriod * 100) / 100,
      ibCommissionPendingUsd: Math.round((ibPending.total || 0) * 100) / 100,
      ibCommissionPendingCount: ibPending.count || 0,
      revenueRecognizedPeriodUsd: Math.round(revenuePeriod * 100) / 100,
      expensesRecognizedPeriodUsd: Math.round(expensePeriod * 100) / 100,
      netOperatingPeriodUsd: Math.round((revenuePeriod - expensePeriod) * 100) / 100,
    },
    periodActivity,
    balanceSheet: { assets, liabilities, equity },
    pl: {
      income: incomeLines,
      expenses: expenseLines,
      totalIncome: revenuePeriod,
      totalExpenses: expensePeriod,
      netPnL: revenuePeriod - expensePeriod,
    },
    note:
      'Figures aggregate the full platform ledger (all clients). Client wallet total is a company liability.',
  };
}
