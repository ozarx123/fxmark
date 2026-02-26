/**
 * Chart of accounts — groupings for UI display (mirrors backend)
 */
export const ACCOUNT_GROUPS = [
  {
    id: 'assets',
    label: 'Assets',
    codes: ['1200', '1300'],
    names: { '1200': 'Cash/Bank', '1300': 'Receivables' },
  },
  {
    id: 'liabilities',
    label: 'Liabilities',
    codes: ['2110', '2100', '2200', '2300', '2400', '2500', '2600', '2700'],
    names: {
      '2110': 'Wallet',
      '2100': 'Client Funds',
      '2200': 'Payables',
      '2300': 'Withdrawals Payable',
      '2400': 'Accrued Commissions',
      '2500': 'Refunds Payable',
      '2600': 'Regulatory Reserves',
      '2700': 'Margin Liabilities',
    },
  },
  {
    id: 'equity',
    label: 'Equity',
    codes: ['3100'],
    names: { '3100': 'Retained Earnings' },
  },
  {
    id: 'revenue',
    label: 'Revenue',
    codes: ['4100', '4200', '4300'],
    names: { '4100': 'Trading P&L', '4200': 'Commission Income', '4300': 'PAMM Fees' },
  },
  {
    id: 'expenses',
    label: 'Expenses',
    codes: ['5100', '5200', '5300', '5400', '5500', '5600', '5700', '5800', '5900'],
    names: {
      '5100': 'Commission Paid',
      '5200': 'Trading Loss',
      '5300': 'Platform Fees',
      '5400': 'Bank/Processing Fees',
      '5500': 'Software & Infrastructure',
      '5600': 'Marketing & Acquisition',
      '5700': 'Compliance & Legal',
      '5800': 'Salaries & Benefits',
      '5900': 'Miscellaneous',
    },
  },
];

export function getAccountName(code, balances = []) {
  for (const g of ACCOUNT_GROUPS) {
    if (g.names[code]) return g.names[code];
  }
  const b = balances.find((x) => x.accountCode === code);
  return b?.accountName || code;
}

export function groupBalancesByType(balances) {
  return ACCOUNT_GROUPS.map((g) => ({
    ...g,
    accounts: g.codes
      .map((code) => {
        const b = balances.find((x) => x.accountCode === code);
        return b ? { ...b, accountName: g.names[code] || b.accountName } : { accountCode: code, accountName: g.names[code], balance: 0 };
      })
      .filter((a) => Math.abs(a.balance ?? 0) > 0.001 || a.accountCode === '2110'),
  })).filter((g) => g.accounts.length > 0);
}
