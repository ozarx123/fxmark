import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { hasRole } from '../config/roleRoutes';

/**
 * Protects routes by auth and optional role.
 * - requireAuth: if true (default), redirect to /auth when not logged in
 * - allowedRoles: if set, user.role must be in this array else redirect to redirectTo
 * - redirectTo: where to send unauthorized users (default '/dashboard')
 * - skipProfileCheck: if true, do not redirect incomplete profiles to /auth/profile-setup
 */
export default function ProtectedRoute({
  children,
  requireAuth = true,
  allowedRoles = null,
  redirectTo = '/dashboard',
  skipProfileCheck = false,
}) {
  const { user, isAuthenticated } = useAuth();
  const location = useLocation();

  if (requireAuth && !isAuthenticated) {
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  if (!skipProfileCheck && isAuthenticated && user?.profileComplete !== true) {
    return <Navigate to="/auth/profile-setup" replace />;
  }

  if (allowedRoles?.length && !hasRole(user?.role, allowedRoles)) {
    return <Navigate to={redirectTo} replace />;
  }

  return children;
}
