/**
 * Mock data for Admin Users page.
 * Roles aligned with FXMARK CRM Users & Roles Documentation v1.0.
 * Replace with API: users table, roles, balances, trade counts.
 */

/** All system roles with descriptions (RBAC) */
export const ROLES = [
  { value: 'super_admin', label: 'Super Admin', category: 'internal', description: 'Full system access, A/B-Book routing, LP management, AI engine, override withdrawals/commissions, audit logs.' },
  { value: 'admin', label: 'Admin', category: 'internal', description: 'Manage clients and accounts, approve deposits/withdrawals, assign IB codes, PAMM, financial and trading reports.' },
  { value: 'dealing_desk', label: 'Dealing Desk', category: 'internal', description: 'Monitor live trades, manage exposure and hedging, manual intervention.' },
  { value: 'risk_manager', label: 'Risk Manager', category: 'internal', description: 'Monitor exposure and margin, configure stop-out and risk parameters, AI risk switch, slippage and lot limits.' },
  { value: 'finance_manager', label: 'Finance Manager', category: 'internal', description: 'Deposits and withdrawals, IB commission calculation and payout, revenue and profit reports, accounting export.' },
  { value: 'compliance_officer', label: 'Compliance Officer', category: 'internal', description: 'KYC/AML verification, monitor suspicious activities, compliance reports, audit logs.' },
  { value: 'support_manager', label: 'Support Manager', category: 'internal', description: 'Client tickets, WhatsApp/Telegram support, escalate technical issues.' },
  { value: 'master_ib', label: 'Master IB', category: 'ib', description: 'View referral tree, multi-level commissions, request commission withdrawal.' },
  { value: 'sub_ib', label: 'Sub IB', category: 'ib', description: 'View direct referrals, track commission earnings.' },
  { value: 'trader', label: 'Trader / Client', category: 'client', description: 'Deposit and withdraw, trading history and P&L, AI trading or PAMM, account statements.' },
  { value: 'pamm_manager', label: 'PAMM Manager', category: 'client', description: 'View investor list and total capital, allocation percentages, performance fees.' },
  { value: 'investor', label: 'Investor (View Only)', category: 'client', description: 'Personal P&L and performance, monthly reports. No broker internal data.' },
];

export const APPROVAL_STATUSES = [
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
];

export const initialUsers = [
  { id: 1, email: 'john.doe@example.com', name: 'John Doe', role: 'trader', approvalStatus: 'approved', balance: 12500, numberOfTrades: 142, createdAt: '2025-01-15' },
  { id: 2, email: 'jane.smith@example.com', name: 'Jane Smith', role: 'trader', approvalStatus: 'approved', balance: 8200, numberOfTrades: 89, createdAt: '2025-01-20' },
  { id: 3, email: 'ib.alpha@partner.com', name: 'IB Alpha', role: 'master_ib', approvalStatus: 'approved', balance: 0, numberOfTrades: 0, createdAt: '2024-12-01' },
  { id: 4, email: 'mike.wilson@example.com', name: 'Mike Wilson', role: 'trader', approvalStatus: 'pending', balance: 2500, numberOfTrades: 12, createdAt: '2025-02-18' },
  { id: 5, email: 'sarah.support@fxmark.com', name: 'Sarah Support', role: 'support_manager', approvalStatus: 'approved', balance: 0, numberOfTrades: 0, createdAt: '2024-11-10' },
  { id: 6, email: 'alex.trader@example.com', name: 'Alex Trader', role: 'trader', approvalStatus: 'approved', balance: 45600, numberOfTrades: 320, createdAt: '2025-02-01' },
  { id: 7, email: 'ib.beta@partner.com', name: 'IB Beta', role: 'sub_ib', approvalStatus: 'pending', balance: 0, numberOfTrades: 0, createdAt: '2025-02-10' },
  { id: 8, email: 'finance@fxmark.com', name: 'Finance Team', role: 'finance_manager', approvalStatus: 'approved', balance: 0, numberOfTrades: 0, createdAt: '2024-10-01' },
  { id: 9, email: 'compliance@fxmark.com', name: 'Compliance Officer', role: 'compliance_officer', approvalStatus: 'approved', balance: 0, numberOfTrades: 0, createdAt: '2024-10-01' },
  { id: 10, email: 'pamm.master@example.com', name: 'PAMM Master', role: 'pamm_manager', approvalStatus: 'approved', balance: 0, numberOfTrades: 0, createdAt: '2025-01-05' },
];
