/**
 * Mock data for PAMM manager page (my fund, my investors). Replace with API.
 */

export const FUND_TYPE_OPTIONS = [
  { value: 'growth', label: 'Growth' },
  { value: 'income', label: 'Income' },
  { value: 'balanced', label: 'Balanced' },
  { value: 'aggressive', label: 'Aggressive' },
  { value: 'conservative', label: 'Conservative' },
];

export const myFundDefault = {
  id: 1,
  name: 'Alpha Growth',
  fundType: 'growth',
  strategy: 'Trend following with disciplined risk management. Focus on major pairs and key levels.',
  status: 'open', // open | closed
  performanceFeePercent: 20,
  managementFeePercent: 2,
  fundSize: 2000000,
  currentDeposit: 50000,
  aum: 1200000,
  investors: 84,
  pnlPercent: 15.2,
  growthYtd: 18,
  riskScore: 55,
  riskProfile: 'Moderate',
  createdAt: '2024-06-01',
};

/** List of manager's funds. Replace with API. */
export const myFunds = [
  myFundDefault,
  {
    id: 2,
    name: 'Income Plus',
    fundType: 'income',
    strategy: 'Lower volatility, steady returns from carry and range strategies.',
    status: 'open',
    performanceFeePercent: 15,
    managementFeePercent: 1.5,
    fundSize: 500000,
    currentDeposit: 25000,
    aum: 320000,
    investors: 22,
    pnlPercent: 6.8,
    growthYtd: 8,
    riskScore: 35,
    riskProfile: 'Conservative',
    createdAt: '2024-09-15',
  },
];

export const myInvestors = [
  { id: 1, email: 'inv1@example.com', name: 'Investor One', amount: 50000, sharePercent: 4.2, joinedAt: '2024-08-01', status: 'active' },
  { id: 2, email: 'inv2@example.com', name: 'Investor Two', amount: 25000, sharePercent: 2.1, joinedAt: '2024-09-15', status: 'active' },
  { id: 3, email: 'inv3@example.com', name: 'Investor Three', amount: 75000, sharePercent: 6.25, joinedAt: '2024-07-10', status: 'active' },
  { id: 4, email: 'inv4@example.com', name: 'Investor Four', amount: 15000, sharePercent: 1.25, joinedAt: '2024-10-01', status: 'active' },
];

export const FUND_STATUS_OPTIONS = [
  { value: 'open', label: 'Open (accepting investors)' },
  { value: 'closed', label: 'Closed' },
];

/** Equity curve / performance chart (indexed from 100). Replace with API. */
export const managerPerformanceChartSeed = [
  { time: '09:00', value: 100 },
  { time: '10:00', value: 100.2 },
  { time: '11:00', value: 99.8 },
  { time: '12:00', value: 101.1 },
  { time: '13:00', value: 102.3 },
  { time: '14:00', value: 101.5 },
  { time: '15:00', value: 102.8 },
  { time: '16:00', value: 103.2 },
  { time: '17:00', value: 102.9 },
  { time: '18:00', value: 103.5 },
];

/** Recent trades for the fund. Replace with API. */
export const managerRecentTrades = [
  { id: 1, time: '18:42:15', symbol: 'EUR/USD', type: 'buy', lots: 0.5, entryPrice: 1.0842, exitPrice: 1.0851, pnl: 45, status: 'closed' },
  { id: 2, time: '18:38:02', symbol: 'XAU/USD', type: 'sell', lots: 0.1, entryPrice: 2622.50, exitPrice: 2620.20, pnl: 23, status: 'closed' },
  { id: 3, time: '18:35:44', symbol: 'GBP/USD', type: 'buy', lots: 0.25, entryPrice: 1.2655, exitPrice: null, pnl: null, status: 'open' },
  { id: 4, time: '18:28:11', symbol: 'EUR/USD', type: 'sell', lots: 1.0, entryPrice: 1.0860, exitPrice: 1.0848, pnl: 120, status: 'closed' },
  { id: 5, time: '18:22:33', symbol: 'USD/JPY', type: 'buy', lots: 0.5, entryPrice: 150.12, exitPrice: 150.28, pnl: 80, status: 'closed' },
];

/** Empty fund for create form. Replace with API default or leave blank. */
export const emptyFund = {
  id: null,
  name: '',
  fundType: 'growth',
  strategy: '',
  status: 'open',
  performanceFeePercent: 20,
  managementFeePercent: 2,
  fundSize: 0,
  currentDeposit: 0,
  aum: 0,
  investors: 0,
  pnlPercent: 0,
  growthYtd: 0,
  riskScore: 0,
  riskProfile: '—',
  createdAt: null,
};
