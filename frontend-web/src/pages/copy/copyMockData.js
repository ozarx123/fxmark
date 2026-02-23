/**
 * Mock data for Copy Trading UI. Replace with API.
 */

export const COPY_MODE_OPTIONS = [
  { value: 'fixed_lot', label: 'Fixed Lot Copy' },
  { value: 'equity_scaling', label: 'Equity Scaling Copy' },
  { value: 'risk_pct', label: 'Risk % Per Trade Copy' },
  { value: 'capital_balance', label: 'C&B (Capital & Balance Allocation)' },
];

/** Masters discoverable on the platform */
export const discoverMasters = [
  {
    id: 'alex-trend',
    slug: 'alex-trend',
    name: 'Alex Trend',
    strategy: 'Trend following on majors and indices. Disciplined stops, 1–2% risk per trade.',
    status: 'live', // live | paused
    pnlPercent: 24.5,
    growthYtd: 18.2,
    riskScore: 52,
    drawdown: 8.1,
    followers: 342,
    aum: 2100000,
    monthlyPnl: 3.2,
    social: { instagram: '', x: 'https://x.com/alextrend', telegram: '', youtube: '' },
    updatedAt: '2026-02-21T14:00:00Z',
  },
  {
    id: 'sarah-scalp',
    slug: 'sarah-scalp',
    name: 'Sarah Scalp',
    strategy: 'Scalping EUR/USD and GBP/USD. Tight spreads, high frequency.',
    status: 'live',
    pnlPercent: 12.8,
    growthYtd: 14.1,
    riskScore: 68,
    drawdown: 5.2,
    followers: 189,
    aum: 890000,
    monthlyPnl: 1.8,
    social: { instagram: '', x: '', telegram: 'https://t.me/sarahscalp', youtube: '' },
    updatedAt: '2026-02-21T13:30:00Z',
  },
  {
    id: 'mike-swing',
    slug: 'mike-swing',
    name: 'Mike Swing',
    strategy: 'Swing trading with focus on risk-adjusted returns. Max 0.5% risk per trade.',
    status: 'live',
    pnlPercent: 31.2,
    growthYtd: 22.0,
    riskScore: 38,
    drawdown: 4.5,
    followers: 521,
    aum: 3500000,
    monthlyPnl: 2.1,
    social: { instagram: 'https://instagram.com/mikeswing', x: '', telegram: '', youtube: 'https://youtube.com/@mikeswing' },
    updatedAt: '2026-02-21T14:00:00Z',
  },
];

/** Masters I follow (my copy) */
export const myFollowing = [
  {
    id: 'follow-1',
    masterId: 'alex-trend',
    masterSlug: 'alex-trend',
    masterName: 'Alex Trend',
    copyMode: 'risk_pct',
    allocationAmount: 0,
    riskPctPerTrade: 1,
    maxDailyLossPct: 3,
    maxDrawdownPct: 10,
    status: 'active',
    startedAt: '2025-11-01',
    pnl: 420,
    pnlPercent: 8.2,
  },
  {
    id: 'follow-2',
    masterId: 'mike-swing',
    masterSlug: 'mike-swing',
    masterName: 'Mike Swing',
    copyMode: 'capital_balance',
    allocationAmount: 15000,
    riskPctPerTrade: null,
    maxDailyLossPct: 2,
    maxDrawdownPct: 8,
    status: 'active',
    startedAt: '2025-12-15',
    pnl: 890,
    pnlPercent: 5.9,
  },
];

/** My master profile (if I am a master) */
export const myMasterProfile = {
  id: 'my-master',
  slug: 'jordan-fx',
  name: 'Jordan FX',
  strategy: 'Multi-timeframe analysis. Focus on key levels and momentum.',
  status: 'live', // live | paused
  pnlPercent: 19.4,
  growthYtd: 15.1,
  riskScore: 48,
  drawdown: 6.2,
  followers: 127,
  aum: 640000,
  social: {
    instagram: 'https://instagram.com/jordanfx',
    x: 'https://x.com/jordanfx',
    telegram: '',
    youtube: '',
  },
  riskDefaults: {
    spreadFilter: true,
    newsProtection: true,
    maxDailyLossPct: 5,
    maxDrawdownPct: 12,
  },
  acceptNewFollowers: true,
  publicProfile: true,
};

/** Hourly snapshot for public profile (mock) */
export const hourlySnapshot = {
  masterId: 'alex-trend',
  periodStart: '2026-02-21T14:00:00Z',
  pnl: 120,
  closedVolume: 12.5,
  openPositionsCount: 3,
  equityIndex: 102.4,
};
