import React from 'react';
import { Outlet, NavLink, Link, useNavigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { hasRole, ADMIN_ROLES, IB_ROLES } from './config/roleRoutes';
import WalletBalanceSync from './components/WalletBalanceSync';
import AccountTypeToggle from './components/AccountTypeToggle';
import { ListIcon, XIcon } from './components/Icons.jsx';
import FxmarkLogo from './components/FxmarkLogo';

export default function AppLayout() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [navOpen, setNavOpen] = React.useState(false);
  const canAccessAdmin = hasRole(user?.role, ADMIN_ROLES);
  const canAccessIb = hasRole(user?.role, IB_ROLES);

  const displayName = user?.name || user?.fullName || user?.profileName || (user?.email ? user.email.split('@')[0] : '');

  const closeNav = () => setNavOpen(false);

  const handleLogout = () => {
    logout();
    navigate('/auth', { replace: true });
    closeNav();
  };

  return (
    <div className="app">
      <WalletBalanceSync />
      <header className="app-header">
        <FxmarkLogo className="app-logo" />
        <button
          type="button"
          className="app-nav-toggle"
          onClick={() => setNavOpen((o) => !o)}
          aria-expanded={navOpen}
          aria-label={navOpen ? 'Close menu' : 'Open menu'}
        >
          {navOpen ? <XIcon size={24} /> : <ListIcon size={24} />}
        </button>
        <nav className={`nav ${navOpen ? 'nav-open' : ''}`}>
        {user && (
          <div className="nav-account-toggle">
            <AccountTypeToggle />
          </div>
        )}
        <NavLink to="/dashboard" end className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')} onClick={closeNav}>
          <span>Dashboard</span>
        </NavLink>
        <NavLink to="/wallet" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')} onClick={closeNav}>
          <span>Wallet</span>
        </NavLink>
        <NavLink to="/trading" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')} onClick={closeNav}>
          <span>Trading</span>
        </NavLink>
        <NavLink to="/pamm-ai" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')} onClick={closeNav}>
          <span>PAMM AI</span>
        </NavLink>
        <NavLink to="/copy" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')} onClick={closeNav}>
          <span>Copy Trading</span>
        </NavLink>
        {canAccessIb && (
        <NavLink to="/ib" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')} onClick={closeNav}>
          <span>IB</span>
        </NavLink>
        )}
        <NavLink to="/finance" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')} onClick={closeNav}>
          <span>Finance</span>
        </NavLink>
        {canAccessAdmin && (
        <NavLink to="/admin" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')} onClick={closeNav}>
          <span>Admin</span>
        </NavLink>
        )}
        {user && (
          <span className="nav-user">
            <Link to="/settings/profile" className="nav-profile-link" onClick={closeNav}>
              {displayName || 'Profile'}
            </Link>
            <button type="button" className="nav-logout" onClick={handleLogout}>Logout</button>
          </span>
        )}
        </nav>
      </header>
      <main className="main min-h-screen p-6 md:p-8">
        <Outlet />
      </main>
    </div>
  );
}
