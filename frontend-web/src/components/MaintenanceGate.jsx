import React, { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { getApiBase } from '../config/apiBase.js';
import { ADMIN_ROLES } from '../config/roleRoutes.js';

const POLL_MS = 45_000;

function pathBypassesMaintenance(pathname) {
  if (pathname.startsWith('/auth') || pathname.startsWith('/admin')) return true;
  if (pathname === '/maintenance') return true;
  if (pathname === '/forgot-password' || pathname === '/reset-password') return true;
  if (pathname === '/verify-email' || pathname.startsWith('/verify-email/')) return true;
  return false;
}

export default function MaintenanceGate({ children }) {
  const { pathname } = useLocation();
  const { user } = useAuth();
  const [state, setState] = useState({ checked: false, maintenance: false, message: '' });

  const roleBypass = user?.role && ADMIN_ROLES.includes(user.role);
  const pathBypass = pathBypassesMaintenance(pathname);
  const bypass = pathBypass || roleBypass;

  useEffect(() => {
    if (bypass) {
      setState({ checked: true, maintenance: false, message: '' });
      return undefined;
    }

    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch(`${getApiBase()}/platform/maintenance`, { cache: 'no-store' });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        setState({
          checked: true,
          maintenance: !!data.maintenance,
          message: typeof data.message === 'string' ? data.message : '',
        });
      } catch {
        if (!cancelled) setState({ checked: true, maintenance: false, message: '' });
      }
    }

    poll();
    const id = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [bypass]);

  if (bypass) return children;

  if (state.checked && state.maintenance) {
    return (
      <Navigate
        to="/maintenance"
        replace
        state={{
          message: state.message || '',
        }}
      />
    );
  }

  return children;
}
