import React from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { hasRole, ADMIN_ROLES, PAMM_MANAGER_ROLES, IB_ROLES } from './config/roleRoutes';
import FxmarkIcon from './components/FxmarkIcon';
import AccountTypeToggle from './components/AccountTypeToggle';
import { List, X } from '@phosphor-icons/react';

export default function AppLayout() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [navOpen, setNavOpen] = React.useState(false);
  const canAccessAdmin = hasRole(user?.role, ADMIN_ROLES);
  const canAccessPammManager = hasRole(user?.role, PAMM_MANAGER_ROLES);
  const canAccessIb = hasRole(user?.role, IB_ROLES);

  const closeNav = () => setNavOpen(false);

  const handleLogout = () => {
    logout();
    navigate('/auth', { replace: true });
    closeNav();
  };

  return (
    <div className="app">
      <header className="app-header">
        <button
          type="button"
          className="app-nav-toggle"
          onClick={() => setNavOpen((o) => !o)}
          aria-expanded={navOpen}
          aria-label={navOpen ? 'Close menu' : 'Open menu'}
        >
          {navOpen ? <X weight="bold" size={24} /> : <List weight="bold" size={24} />}
        </button>
        <nav className={`nav ${navOpen ? 'nav-open' : ''}`}>
        <div className="nav-account-toggle">
          <AccountTypeToggle />
        </div>
        <NavLink to="/dashboard" end className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')} onClick={closeNav}>
          {({ isActive }) => (
            <>
              <FxmarkIcon name="dashboard" weight={isActive ? 'bold' : 'regular'} size={20} />
              <span>Dashboard</span>
            </>
          )}
        </NavLink>
        <NavLink to="/wallet" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')} onClick={closeNav}>
          {({ isActive }) => (
            <>
              <FxmarkIcon name="wallet" weight={isActive ? 'bold' : 'regular'} size={20} />
              <span>Wallet</span>
            </>
          )}
        </NavLink>
        <NavLink to="/trading" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')} onClick={closeNav}>
          {({ isActive }) => (
            <>
              <FxmarkIcon name="trading" weight={isActive ? 'bold' : 'regular'} size={20} />
              <span>Trading</span>
            </>
          )}
        </NavLink>
        <NavLink to="/pamm" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')} onClick={closeNav}>
          {({ isActive }) => (
            <>
              <FxmarkIcon name="analytics" weight={isActive ? 'bold' : 'regular'} size={20} />
              <span>PAMM</span>
            </>
          )}
        </NavLink>
        {canAccessPammManager && (
        <NavLink to="/pamm/manager" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')} onClick={closeNav}>
          {({ isActive }) => (
            <>
              <FxmarkIcon name="trader" weight={isActive ? 'bold' : 'regular'} size={20} />
              <span>PAMM Manager</span>
            </>
          )}
        </NavLink>
        )}
        <NavLink to="/copy" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')} onClick={closeNav}>
          {({ isActive }) => (
            <>
              <FxmarkIcon name="copy" weight={isActive ? 'bold' : 'regular'} size={20} />
              <span>Copy Trading</span>
            </>
          )}
        </NavLink>
        {canAccessIb && (
        <NavLink to="/ib" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')} onClick={closeNav}>
          {({ isActive }) => (
            <>
              <FxmarkIcon name="ib" weight={isActive ? 'bold' : 'regular'} size={20} />
              <span>IB</span>
            </>
          )}
        </NavLink>
        )}
        <NavLink to="/finance" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')} onClick={closeNav}>
          {({ isActive }) => (
            <>
              <FxmarkIcon name="reports" weight={isActive ? 'bold' : 'regular'} size={20} />
              <span>Finance</span>
            </>
          )}
        </NavLink>
        {canAccessAdmin && (
        <NavLink to="/admin" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')} onClick={closeNav}>
          {({ isActive }) => (
            <>
              <FxmarkIcon name="settings" weight={isActive ? 'bold' : 'regular'} size={20} />
              <span>Admin</span>
            </>
          )}
        </NavLink>
        )}
        {user && (
          <span className="nav-user">
            <span className="nav-user-email">{user.email}</span>
            <button type="button" className="nav-logout" onClick={handleLogout}>Logout</button>
          </span>
        )}
        </nav>
      </header>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
