/**
 * Mock data for Admin Financials page.
 * Replace with API: finance_transactions, payouts, reports.
 */

export const financialSummary = {
  totalDeposits: 2845000,
  totalWithdrawals: 1820000,
  totalRevenue: 125400,
  totalEarnings: 98200,
  commissionPending: 42500,
  netBalance: 1025000,
  depositCount: 3420,
  withdrawalCount: 1890,
};

/** P&L (Profit & Loss) for the period */
export const profitLoss = {
  income: [
    { label: 'Trading revenue (B-Book)', value: 85400 },
    { label: 'Spread / Markup', value: 22100 },
    { label: 'Other income', value: 2900 },
  ],
  expenses: [
    { label: 'Commission paid (IB)', value: 18500 },
    { label: 'Execution costs', value: 4200 },
    { label: 'Operations & platform', value: 8400 },
  ],
  totalIncome: 110400,
  totalExpenses: 31100,
  netPnL: 79300,
};

/** Balance sheet snapshot */
export const balanceSheet = {
  assets: [
    { label: 'Cash & equivalents', value: 1250000 },
    { label: 'Client balances (segregated)', value: 985000 },
    { label: 'Receivables', value: 42500 },
  ],
  liabilities: [
    { label: 'Pending withdrawals', value: 28500 },
    { label: 'Commission payable', value: 42500 },
    { label: 'Client funds (liability)', value: 985000 },
  ],
  equity: [
    { label: 'Retained earnings', value: 182000 },
    { label: 'Current period P&L', value: 79300 },
  ],
  totalAssets: 2277500,
  totalLiabilities: 1056000,
  totalEquity: 261300,
};

export const pendingPayouts = [
  { id: 'PO-1001', type: 'Commission', recipient: 'IB_Alpha', amount: 4200, requestedAt: '2025-02-20', status: 'Pending approval' },
  { id: 'PO-1002', type: 'Commission', recipient: 'IB_Beta', amount: 3500, requestedAt: '2025-02-20', status: 'Pending approval' },
  { id: 'PO-1003', type: 'Commission', recipient: 'IB_Gamma', amount: 2400, requestedAt: '2025-02-19', status: 'Pending approval' },
  { id: 'PO-1004', type: 'Withdrawal', recipient: 'Client #8821', amount: 15000, requestedAt: '2025-02-21', status: 'In review' },
  { id: 'PO-1005', type: 'Withdrawal', recipient: 'Client #9102', amount: 8500, requestedAt: '2025-02-21', status: 'In review' },
];

export const payoutHistory = [
  { id: 'PO-0998', type: 'Commission', recipient: 'IB_Delta', amount: 1800, paidAt: '2025-02-18', status: 'Paid' },
  { id: 'PO-0997', type: 'Commission', recipient: 'IB_Epsilon', amount: 1200, paidAt: '2025-02-18', status: 'Paid' },
  { id: 'PO-0996', type: 'Withdrawal', recipient: 'Client #7754', amount: 22000, paidAt: '2025-02-17', status: 'Paid' },
  { id: 'PO-0995', type: 'Commission', recipient: 'IB_Alpha', amount: 4100, paidAt: '2025-02-15', status: 'Paid' },
  { id: 'PO-0994', type: 'Withdrawal', recipient: 'Client #6621', amount: 5000, paidAt: '2025-02-14', status: 'Paid' },
];

/** Broker P&L dashboard: Spread, Commission, LP Cost */
export const brokerPnl = {
  spread: 22100,
  commission: 18500,
  lpCost: 14200,
  netBrokerRevenue: 26400,
};

/** Exposure dashboard: Buy/Sell per symbol (lots or notional) */
export const exposureBySymbol = [
  { symbol: 'XAUUSD', buyLots: 125.5, sellLots: 98.2, netExposure: 27.3 },
  { symbol: 'EURUSD', buyLots: 85.0, sellLots: 92.0, netExposure: -7.0 },
  { symbol: 'GBPUSD', buyLots: 42.0, sellLots: 38.5, netExposure: 3.5 },
  { symbol: 'USDJPY', buyLots: 65.0, sellLots: 70.0, netExposure: -5.0 },
];

export const reportTypes = [
  { value: 'financial_summary', label: 'Financial summary' },
  { value: 'pnl', label: 'P&L (Profit & Loss)' },
  { value: 'balance_sheet', label: 'Balance sheet' },
  { value: 'daily_summary', label: 'Daily summary' },
  { value: 'monthly_summary', label: 'Monthly summary' },
  { value: 'cash_flow', label: 'Cash flow' },
  { value: 'deposits', label: 'Deposits' },
  { value: 'withdrawals', label: 'Withdrawals' },
  { value: 'withdrawal_approvals', label: 'Withdrawal approval log' },
  { value: 'payouts', label: 'Payouts & commission' },
  { value: 'ib_commission', label: 'IB commission breakdown' },
  { value: 'revenue', label: 'Revenue' },
  { value: 'revenue_by_symbol', label: 'Revenue by symbol' },
  { value: 'earnings', label: 'Total earnings' },
  { value: 'client_activity', label: 'Client activity' },
  { value: 'fee_report', label: 'Fees & charges' },
  { value: 'reconciliation', label: 'Reconciliation' },
];
