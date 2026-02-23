/**
 * Auth helpers for role derivation (mock/dev when API does not return role).
 */

export function ensureUserRole(user, email) {
  if (!user) return user;
  if (user.role) return user;
  const e = (email || user.email || '').toLowerCase();
  if (e.includes('admin') || e.includes('super.admin')) return { ...user, role: e.includes('super') ? 'super_admin' : 'admin' };
  if (e.includes('pamm')) return { ...user, role: 'pamm_manager' };
  if (e.includes('ib.') || e.includes('ib@')) return { ...user, role: 'master_ib' };
  if (e.includes('finance')) return { ...user, role: 'finance_manager' };
  if (e.includes('compliance')) return { ...user, role: 'compliance_officer' };
  if (e.includes('support')) return { ...user, role: 'support_manager' };
  return { ...user, role: 'trader' };
}
