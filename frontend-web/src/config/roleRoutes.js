/**
 * Role-based route access. Aligned with FXMARK RBAC (Admin Users roles).
 * Use with ProtectedRoute and for conditional nav links.
 */

/** Roles that can access the Admin panel (/admin/*) */
export const ADMIN_ROLES = [
  'super_admin',
  'admin',
  'dealing_desk',
  'risk_manager',
  'finance_manager',
  'compliance_officer',
  'support_manager',
];

/** Roles that can access PAMM Manager (/pamm/manager) */
export const PAMM_MANAGER_ROLES = [
  'pamm_manager',
  ...ADMIN_ROLES,
];

/** Roles that can access IB section (/ib) */
export const IB_ROLES = [
  'master_ib',
  'sub_ib',
  ...ADMIN_ROLES,
];

/** Roles that can access Copy Manager (/copy/manager) – masters; for now any authenticated can view, restrict later if needed */
export const COPY_MANAGER_ROLES = [
  'trader',
  'pamm_manager',
  'investor',
  'master_ib',
  'sub_ib',
  ...ADMIN_ROLES,
];

/** All client app roles (dashboard, wallet, trading, etc.) – any authenticated user */
export const CLIENT_ROLES = [
  'super_admin',
  'admin',
  'dealing_desk',
  'risk_manager',
  'finance_manager',
  'compliance_officer',
  'support_manager',
  'master_ib',
  'sub_ib',
  'trader',
  'pamm_manager',
  'investor',
];

/** Check if a role is allowed for a set of allowed roles */
export function hasRole(userRole, allowedRoles) {
  if (!userRole || !allowedRoles?.length) return false;
  return allowedRoles.includes(userRole);
}
