/**
 * Admin permissions / RBAC
 * Check role for admin actions
 */
const ROLES = { admin: 1, support: 2, finance: 3 };

function can(user, action) {
  const role = user?.role;
  return role === 'admin' || role === 'superadmin';
}

module.exports = { can, ROLES };
