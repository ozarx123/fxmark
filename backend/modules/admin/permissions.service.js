/**
 * Admin permissions / RBAC
 * Check role for admin actions
 */
const ROLES = { admin: 1, support: 2, finance: 3 };

function can(user, action) {
  // TODO: map action to permission, check user.role
  return user?.role === 'admin';
}

module.exports = { can, ROLES };
