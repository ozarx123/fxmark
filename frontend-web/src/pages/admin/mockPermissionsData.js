/**
 * Permissions for RBAC. Aligned with FXMARK CRM roles.
 * Replace with API: permissions list, role_permissions.
 */

/** Permission groups and permissions (group.id + permission id = key) */
export const PERMISSION_GROUPS = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    permissions: [
      { id: 'dashboard.view', label: 'View dashboard' },
      { id: 'dashboard.kpi_export', label: 'Export KPIs' },
    ],
  },
  {
    id: 'users',
    label: 'Users & accounts',
    permissions: [
      { id: 'users.view', label: 'View users' },
      { id: 'users.create', label: 'Create users' },
      { id: 'users.edit', label: 'Edit users' },
      { id: 'users.delete', label: 'Delete users' },
      { id: 'users.role_assign', label: 'Assign roles' },
      { id: 'users.approval', label: 'Approve / reject users' },
    ],
  },
  {
    id: 'financials',
    label: 'Financials',
    permissions: [
      { id: 'financials.view', label: 'View financials' },
      { id: 'financials.deposits_approve', label: 'Approve deposits' },
      { id: 'financials.withdrawals_approve', label: 'Approve withdrawals' },
      { id: 'financials.override', label: 'Override withdrawals / commissions' },
      { id: 'financials.reports_export', label: 'Export reports' },
    ],
  },
  {
    id: 'trading_dealing',
    label: 'Trading & dealing',
    permissions: [
      { id: 'trades.view', label: 'View live trades' },
      { id: 'trades.intervene', label: 'Manual intervention' },
      { id: 'exposure.view', label: 'View exposure' },
      { id: 'exposure.hedge', label: 'Manage hedging' },
      { id: 'routing.view', label: 'View A-Book / B-Book routing' },
      { id: 'routing.control', label: 'Control routing' },
    ],
  },
  {
    id: 'risk',
    label: 'Risk',
    permissions: [
      { id: 'risk.view', label: 'View risk & margin' },
      { id: 'risk.config', label: 'Configure stop-out & risk parameters' },
      { id: 'risk.ai_switch', label: 'Control AI risk switch' },
      { id: 'risk.slippage_lots', label: 'Slippage & lot limits' },
    ],
  },
  {
    id: 'compliance',
    label: 'Compliance & KYC',
    permissions: [
      { id: 'kyc.view', label: 'View KYC queue' },
      { id: 'kyc.verify', label: 'Verify / reject KYC' },
      { id: 'compliance.reports', label: 'Compliance reports' },
      { id: 'audit.view', label: 'View audit logs' },
    ],
  },
  {
    id: 'support',
    label: 'Support',
    permissions: [
      { id: 'tickets.view', label: 'View tickets' },
      { id: 'tickets.manage', label: 'Manage tickets' },
      { id: 'tickets.escalate', label: 'Escalate issues' },
    ],
  },
  {
    id: 'ib',
    label: 'IB & commission',
    permissions: [
      { id: 'ib.view_tree', label: 'View referral tree' },
      { id: 'ib.commissions', label: 'View / track commissions' },
      { id: 'ib.withdraw', label: 'Request commission withdrawal' },
      { id: 'ib.assign_codes', label: 'Assign IB codes' },
      { id: 'ib.payout', label: 'IB commission payout' },
    ],
  },
  {
    id: 'pamm',
    label: 'PAMM',
    permissions: [
      { id: 'pamm.view', label: 'View PAMM / investors' },
      { id: 'pamm.manage', label: 'Manage allocation & fees' },
    ],
  },
  {
    id: 'system',
    label: 'System & settings',
    permissions: [
      { id: 'settings.view', label: 'View settings' },
      { id: 'settings.edit', label: 'Edit settings' },
      { id: 'lp.manage', label: 'LP management' },
      { id: 'cron.manage', label: 'Cron / jobs' },
    ],
  },
];

/** Flatten all permission ids */
export function getAllPermissionIds() {
  return PERMISSION_GROUPS.flatMap((g) => g.permissions.map((p) => p.id));
}

/** Default role -> permission map (Super Admin has all; others subset). */
export function getDefaultRolePermissions() {
  const all = getAllPermissionIds();
  return {
    super_admin: all,
    admin: all.filter((id) => !['routing.control', 'lp.manage', 'financials.override'].includes(id)), // most except routing override
    dealing_desk: ['dashboard.view', 'trades.view', 'trades.intervene', 'exposure.view', 'exposure.hedge', 'routing.view'],
    risk_manager: ['dashboard.view', 'risk.view', 'risk.config', 'risk.ai_switch', 'risk.slippage_lots', 'exposure.view', 'trades.view'],
    finance_manager: ['dashboard.view', 'financials.view', 'financials.deposits_approve', 'financials.withdrawals_approve', 'financials.reports_export', 'ib.payout', 'ib.commissions'],
    compliance_officer: ['dashboard.view', 'kyc.view', 'kyc.verify', 'compliance.reports', 'audit.view'],
    support_manager: ['dashboard.view', 'tickets.view', 'tickets.manage', 'tickets.escalate'],
    master_ib: ['ib.view_tree', 'ib.commissions', 'ib.withdraw'],
    sub_ib: ['ib.commissions', 'ib.view_tree'],
    trader: [],
    pamm_manager: ['pamm.view', 'pamm.manage'],
    investor: ['pamm.view'],
  };
}
