import React from 'react';
import { Outlet, NavLink } from 'react-router-dom';

export default function AppLayout() {
  return (
    <div className="app">
      <nav className="nav">
        <NavLink to="/dashboard" end className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
          Dashboard
        </NavLink>
        <NavLink to="/wallet" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
          Wallet
        </NavLink>
        <NavLink to="/trading" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
          Trading
        </NavLink>
        <NavLink to="/pamm" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
          PAMM
        </NavLink>
        <NavLink to="/ib" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
          IB
        </NavLink>
        <NavLink to="/finance" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
          Finance
        </NavLink>
        <NavLink to="/admin" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
          Admin
        </NavLink>
      </nav>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
