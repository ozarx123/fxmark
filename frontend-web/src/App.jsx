import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Landing from './pages/landing/Landing.jsx';
import AppLayout from './AppLayout.jsx';
import AdminLayout from './layouts/AdminLayout.jsx';
import Dashboard from './pages/dashboard/index.jsx';
import Wallet from './pages/wallet/index.jsx';
import Trading from './pages/trading/index.jsx';
import Pamm from './pages/pamm/index.jsx';
import Ib from './pages/ib/index.jsx';
import Finance from './pages/finance/index.jsx';
import AdminDashboard from './pages/admin/AdminDashboard.jsx';
import AdminLeads from './pages/admin/AdminLeads.jsx';
import AdminTickets from './pages/admin/AdminTickets.jsx';
import AdminKyc from './pages/admin/AdminKyc.jsx';
import AdminBroadcast from './pages/admin/AdminBroadcast.jsx';
import AdminMarket from './pages/admin/AdminMarket.jsx';
import AdminFinancials from './pages/admin/AdminFinancials.jsx';
import AdminUsers from './pages/admin/AdminUsers.jsx';
import AdminLiquidity from './pages/admin/AdminLiquidity.jsx';
import AdminSettings from './pages/admin/AdminSettings.jsx';
import AdminTradingMonitor from './pages/admin/AdminTradingMonitor.jsx';
import AdminAuditLog from './pages/admin/AdminAuditLog.jsx';
import AdminIbCommission from './pages/admin/AdminIbCommission.jsx';
import GatewayRedirect from './pages/wallet/GatewayRedirect.jsx';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route element={<AppLayout />}>
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="wallet" element={<Wallet />} />
          <Route path="gateway-redirect" element={<GatewayRedirect />} />
          <Route path="trading" element={<Trading />} />
          <Route path="pamm" element={<Pamm />} />
          <Route path="ib" element={<Ib />} />
          <Route path="finance" element={<Finance />} />
        </Route>
        <Route path="admin" element={<AdminLayout />}>
          <Route index element={<AdminDashboard />} />
          <Route path="financials" element={<AdminFinancials />} />
          <Route path="trading-monitor" element={<AdminTradingMonitor />} />
          <Route path="users" element={<AdminUsers />} />
          <Route path="ib-commission" element={<AdminIbCommission />} />
          <Route path="audit" element={<AdminAuditLog />} />
          <Route path="liquidity" element={<AdminLiquidity />} />
          <Route path="leads" element={<AdminLeads />} />
          <Route path="tickets" element={<AdminTickets />} />
          <Route path="kyc" element={<AdminKyc />} />
          <Route path="broadcast" element={<AdminBroadcast />} />
          <Route path="market" element={<AdminMarket />} />
          <Route path="settings" element={<AdminSettings />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
