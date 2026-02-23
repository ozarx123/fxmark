/**
 * Mock data for admin PAMM management. Replace with API.
 */

export const PAMM_MANAGER_STATUSES = [
  { value: 'active', label: 'Active' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'pending', label: 'Pending approval' },
];

export const adminPammManagers = [
  {
    id: 1,
    userId: 10,
    name: 'Alpha Growth',
    email: 'pamm.master@example.com',
    strategy: 'Trend following',
    status: 'active',
    aum: 1200000,
    investors: 84,
    performanceFeePercent: 20,
    managementFeePercent: 2,
    pnlPercent: 15.2,
    growthYtd: 18,
    riskScore: 55,
    riskProfile: 'Moderate',
    createdAt: '2024-06-01',
  },
  {
    id: 2,
    userId: 11,
    name: 'Conservative Income',
    email: 'conservative.pamm@example.com',
    strategy: 'Low volatility',
    status: 'active',
    aum: 890000,
    investors: 120,
    performanceFeePercent: 15,
    managementFeePercent: 1.5,
    pnlPercent: 6.8,
    growthYtd: 8.1,
    riskScore: 22,
    riskProfile: 'Conservative',
    createdAt: '2024-03-15',
  },
  {
    id: 3,
    userId: 12,
    name: 'FX Momentum',
    email: 'momentum.pamm@example.com',
    strategy: 'Momentum',
    status: 'active',
    aum: 450000,
    investors: 32,
    performanceFeePercent: 25,
    managementFeePercent: 2.5,
    pnlPercent: -2.1,
    growthYtd: 4.2,
    riskScore: 72,
    riskProfile: 'Aggressive',
    createdAt: '2024-09-01',
  },
  {
    id: 4,
    userId: 13,
    name: 'New Strategy Fund',
    email: 'newfund@example.com',
    strategy: 'Multi-asset',
    status: 'pending',
    aum: 0,
    investors: 0,
    performanceFeePercent: 20,
    managementFeePercent: 2,
    pnlPercent: 0,
    growthYtd: 0,
    riskScore: 0,
    riskProfile: '—',
    createdAt: '2025-02-18',
  },
];

export const adminPammAllocations = [
  { id: 1, managerId: 1, managerName: 'Alpha Growth', investorId: 101, investorEmail: 'inv1@example.com', amount: 50000, sharePercent: 4.2, joinedAt: '2024-08-01', status: 'active' },
  { id: 2, managerId: 1, managerName: 'Alpha Growth', investorId: 102, investorEmail: 'inv2@example.com', amount: 25000, sharePercent: 2.1, joinedAt: '2024-09-15', status: 'active' },
  { id: 3, managerId: 2, managerName: 'Conservative Income', investorId: 103, investorEmail: 'inv3@example.com', amount: 100000, sharePercent: 11.2, joinedAt: '2024-04-01', status: 'active' },
  { id: 4, managerId: 2, managerName: 'Conservative Income', investorId: 101, investorEmail: 'inv1@example.com', amount: 15000, sharePercent: 1.7, joinedAt: '2024-10-01', status: 'active' },
  { id: 5, managerId: 3, managerName: 'FX Momentum', investorId: 104, investorEmail: 'inv4@example.com', amount: 75000, sharePercent: 16.7, joinedAt: '2024-11-01', status: 'active' },
];

export const adminPammDefaults = {
  defaultPerformanceFeePercent: 20,
  defaultManagementFeePercent: 2,
  minAllocationUsd: 100,
  maxAllocationPercentPerManager: 100,
};
