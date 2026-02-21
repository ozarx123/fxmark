import React from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';

const ADMIN_LINKS = [
  { to: '/admin', end: true, label: 'Dashboard' },
  { to: '/admin/financials', end: false, label: 'Financials' },
  { to: '/admin/trading-monitor', end: false, label: 'Trading monitor' },
  { to: '/admin/users', end: false, label: 'Users' },
  { to: '/admin/ib-commission', end: false, label: 'IB & commission' },
  { to: '/admin/audit', end: false, label: 'Audit log' },
  { to: '/admin/liquidity', end: false, label: 'Liquidity management' },
  { to: '/admin/leads', end: false, label: 'Leads' },
  { to: '/admin/tickets', end: false, label: 'Tickets' },
  { to: '/admin/kyc', end: false, label: 'KYC' },
  { to: '/admin/broadcast', end: false, label: 'Broadcast' },
  { to: '/admin/market', end: false, label: 'Market data' },
  { to: '/admin/settings', end: false, label: 'Settings' },
];

export default function AdminLayout() {
  const navigate = useNavigate();

  return (
    <div className="admin-panel">
      <aside className="admin-sidebar">
        <div className="admin-sidebar-header">
          <span className="admin-logo">FXMARK Admin</span>
        </div>
        <nav className="admin-nav">
          {ADMIN_LINKS.map(({ to, end, label }) => (
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
        <Outlet />
      </main>
    </div>
  );
}
