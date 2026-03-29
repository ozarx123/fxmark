import React, { useMemo, useState, useEffect } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { hasRole, SUPERADMIN_ROLES } from '../config/roleRoutes';

const ADMIN_MFA_STORAGE_KEY = 'fxmark_admin_mfa_otp';

const ADMIN_LINKS = [
  { to: '/admin', end: true, label: 'Dashboard' },
  { to: '/admin/accounts-command-center', end: false, label: 'Accounts command center' },
  { to: '/admin/fraud-dashboard', end: false, label: 'Fraud monitoring' },
  { to: '/admin/alerts', end: false, label: 'Alerts' },
  { to: '/admin/financials', end: false, label: 'Company financials' },
  { to: '/admin/trading-monitor', end: false, label: 'Trading monitor' },
  { to: '/admin/users', end: false, label: 'Users' },
  { to: '/admin/bulk-import', end: false, label: 'Bulk import' },
  { to: '/admin/profit-commission-adjust', end: false, label: 'Profit & commission adjust' },
  { to: '/admin/ib-commission', end: false, label: 'IB & commission' },
  { to: '/admin/audit', end: false, label: 'Audit log' },
  { to: '/admin/bullrun', end: false, label: 'Bull Run fund' },
  { to: '/admin/liquidity', end: false, label: 'Liquidity management' },
  { to: '/admin/leads', end: false, label: 'Leads' },
  { to: '/admin/tickets', end: false, label: 'Tickets' },
  { to: '/admin/kyc', end: false, label: 'KYC' },
  { to: '/admin/broadcast', end: false, label: 'Broadcast' },
  { to: '/admin/market', end: false, label: 'Market data' },
  { to: '/admin/logs',   end: false, label: 'Feed logs' },
  { to: '/admin/settings', end: false, label: 'Settings' },
];

const SUPERADMIN_ONLY_LINK = { to: '/admin/platform-env', end: false, label: 'Environment' };

function AdminMfaBar() {
  const [code, setCode] = useState('');
  useEffect(() => {
    try {
      setCode(sessionStorage.getItem(ADMIN_MFA_STORAGE_KEY) || '');
    } catch {
      setCode('');
    }
  }, []);
  const persist = (raw) => {
    const digits = String(raw).replace(/\D/g, '').slice(0, 8);
    setCode(digits);
    try {
      if (digits) sessionStorage.setItem(ADMIN_MFA_STORAGE_KEY, digits);
      else sessionStorage.removeItem(ADMIN_MFA_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  };
  return (
    <div
      className="admin-mfa-bar"
      style={{
        padding: '10px 16px',
        fontSize: 13,
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        background: 'rgba(0,0,0,0.2)',
      }}
    >
      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ opacity: 0.85 }}>Admin MFA (if enabled on server)</span>
        <input
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="6-digit authenticator code"
          value={code}
          onChange={(e) => persist(e.target.value)}
          style={{ maxWidth: 140, padding: '6px 10px' }}
        />
      </label>
      <span style={{ opacity: 0.55, marginLeft: 12, fontSize: 12 }}>
        Sent on admin API requests for this browser tab only.
      </span>
    </div>
  );
}

export default function AdminLayout() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const navLinks = useMemo(() => {
    if (!hasRole(user?.role, SUPERADMIN_ROLES)) return ADMIN_LINKS;
    const idx = ADMIN_LINKS.findIndex((l) => l.to === '/admin/settings');
    const copy = [...ADMIN_LINKS];
    copy.splice(idx, 0, SUPERADMIN_ONLY_LINK);
    return copy;
  }, [user?.role]);

  return (
    <div className="admin-panel">
      <aside className="admin-sidebar">
        <div className="admin-sidebar-header">
          <span className="admin-logo">FXMARK Admin</span>
        </div>
        <nav className="admin-nav">
          {navLinks.map(({ to, end, label }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => `admin-nav-link ${isActive ? 'active' : ''}`}
            >
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="admin-sidebar-footer">
          <button
            type="button"
            className="admin-back-btn"
            onClick={() => navigate('/dashboard')}
          >
            ← Back to app
          </button>
        </div>
      </aside>
      <main className="admin-main">
        <AdminMfaBar />
        <Outlet />
      </main>
    </div>
  );
}
