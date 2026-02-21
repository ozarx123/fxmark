/**
 * Mock data for client PAMM page. Replace with API.
 */

export const pammSummary = {
  totalInvested: 25000,
  currentValue: 26850,
  totalPnl: 1850,
  pnlPercent: 7.4,
  growthYtd: 12.2,
  growthMtd: 2.1,
  riskScore: 42,
  riskProfile: 'Moderate',
  currentDrawdown: -3.2,
  maxDrawdown: -8.5,
  openPnl: 320,
  closedPnl: 1530,
};

export const equityCurveData = [
  { month: 'Aug', value: 100 },
  { month: 'Sep', value: 102 },
  { month: 'Oct', value: 98 },
  { month: 'Nov', value: 105 },
  { month: 'Dec', value: 108 },
  { month: 'Jan', value: 112 },
  { month: 'Feb', value: 107.4 },
];

export const availableManagers = [
  { id: 1, name: 'Alpha Growth', strategy: 'Trend following', pnlPercent: 15.2, growthYtd: 18, riskScore: 55, riskProfile: 'Moderate', drawdown: -5.2, aum: 1200000, investors: 84 },
  { id: 2, name: 'Conservative Income', strategy: 'Low volatility', pnlPercent: 6.8, growthYtd: 8.1, riskScore: 22, riskProfile: 'Conservative', drawdown: -1.8, aum: 890000, investors: 120 },
  { id: 3, name: 'FX Momentum', strategy: 'Momentum', pnlPercent: -2.1, growthYtd: 4.2, riskScore: 72, riskProfile: 'Aggressive', drawdown: -12.5, aum: 450000, investors: 32 },
];

export const myAllocations = [
  { id: 1, managerId: 1, managerName: 'Alpha Growth', amount: 15000, sharePercent: 2.1, pnl: 850, pnlPercent: 5.67, growthPercent: 6.2, riskScore: 55, status: 'Active' },
  { id: 2, managerId: 2, managerName: 'Conservative Income', amount: 10000, sharePercent: 1.2, pnl: 420, pnlPercent: 4.2, growthPercent: 4.1, riskScore: 22, status: 'Active' },
];
