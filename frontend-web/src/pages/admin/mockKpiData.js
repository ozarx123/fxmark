/**
 * Mock KPI data for Admin CRM Dashboard.
 * Replace with API calls to kpi_daily_summary, kpi_daily_by_ib, kpi_daily_by_symbol_group.
 */

function lastDays(n) {
  const d = [];
  for (let i = n - 1; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    d.push(date.toISOString().slice(0, 10));
  }
  return d;
}

const days30 = lastDays(30);

export const kpiDailySummary = days30.map((date, i) => ({
  date,
  leads: 12 + Math.floor(Math.random() * 20) - (i > 25 ? 5 : 0),
  verifiedUsers: 8 + Math.floor(Math.random() * 10),
  ftd: 3 + Math.floor(Math.random() * 6),
  ftdAmount: 15000 + Math.floor(Math.random() * 25000),
  deposits: 45000 + Math.floor(Math.random() * 60000),
  withdrawals: 20000 + Math.floor(Math.random() * 30000),
  lots: Number((120 + Math.random() * 80).toFixed(1)),
  closedTrades: 80 + Math.floor(Math.random() * 120),
  revenue: 1200 + Math.floor(Math.random() * 2000),
  activeTraders7d: 45 + Math.floor(Math.random() * 30),
  activeTraders30d: 120 + Math.floor(Math.random() * 50),
}));

export const todayKpis = {
  leads: 18,
  verifiedUsers: 12,
  ftdCount: 5,
  ftdAmount: 28500,
  deposits: 52000,
  withdrawals: 24000,
  lots: 145.2,
  closedTrades: 98,
  revenue: 1850,
  activeTraders7d: 52,
  activeTraders30d: 142,
  leadToFtdRate: 12.5,
  arpu: 420,
  negativeBalanceCount: 2,
  pendingWithdrawals: 8500,
  withdrawalApprovalRate: 94,
  aBookRatio: 62,
  bBookRatio: 38,
};

export const topIbs = [
  { id: 1, name: 'IB_Alpha', leads: 45, ftd: 12, deposits: 125000, lots: 320, revenue: 4200 },
  { id: 2, name: 'IB_Beta', leads: 38, ftd: 9, deposits: 98000, lots: 280, revenue: 3500 },
  { id: 3, name: 'IB_Gamma', leads: 29, ftd: 7, deposits: 72000, lots: 195, revenue: 2400 },
  { id: 4, name: 'IB_Delta', leads: 22, ftd: 5, deposits: 55000, lots: 140, revenue: 1800 },
  { id: 5, name: 'IB_Epsilon', leads: 18, ftd: 4, deposits: 41000, lots: 98, revenue: 1200 },
];

export const topCountries = [
  { country: 'United Kingdom', leads: 85, ftd: 22, deposits: 280000 },
  { country: 'Germany', leads: 62, ftd: 16, deposits: 195000 },
  { country: 'France', leads: 48, ftd: 11, deposits: 142000 },
  { country: 'Spain', leads: 35, ftd: 8, deposits: 98000 },
  { country: 'Italy', leads: 28, ftd: 6, deposits: 72000 },
];

export const symbolBreakdown = [
  { symbolGroup: 'XAUUSD', lots: 420.5, revenue: 5200 },
  { symbolGroup: 'FX Majors', lots: 380.2, revenue: 3100 },
];

/** Overview tab: high-level metrics (period-based, e.g. last 30d) */
export const overviewMetrics = {
  totalDeposits: 2845000,
  totalUsers: 12480,
  dailyAvgDeposits: 94833,
  avgWithdrawals: 28500,
  userGrowthPercent: 12.4,
  compliantResolution: 98,
  compliantResolvedCount: 245,
  compliantTotal: 250,
  commissionPending: 42500,
};

/** Top performers (IBs / sales / support) for Overview */
export const topPerformers = [
  { rank: 1, name: 'IB_Alpha', type: 'IB', metric: 'Deposits', value: 125000 },
  { rank: 2, name: 'IB_Beta', type: 'IB', metric: 'Deposits', value: 98000 },
  { rank: 3, name: 'IB_Gamma', type: 'IB', metric: 'Deposits', value: 72000 },
  { rank: 4, name: 'Sarah M.', type: 'Support', metric: 'Tickets resolved', value: 156 },
  { rank: 5, name: 'James K.', type: 'Sales', metric: 'FTD', value: 28 },
];
