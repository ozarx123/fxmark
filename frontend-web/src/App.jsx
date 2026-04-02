import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext.jsx';
import { MarketDataProvider } from './context/MarketDataContext.jsx';
import { TradingSocketProvider } from './services/tradingSocket.jsx';
import { AccountProvider } from './context/AccountContext.jsx';
import { FinanceProvider } from './context/FinanceContext.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import { ADMIN_ROLES, IB_ROLES, SUPERADMIN_ROLES } from './config/roleRoutes.js';
import Landing from './pages/landing/Landing.jsx';
import Auth from './pages/auth/Auth.jsx';
import AuthCallback from './pages/auth/AuthCallback.jsx';
import ProfileSetup from './pages/auth/ProfileSetup.jsx';
import VerifyEmail from './pages/auth/VerifyEmail.jsx';
import ForgotPassword from './pages/auth/ForgotPassword.jsx';
import ResetPassword from './pages/auth/ResetPassword.jsx';
import AppLayout from './AppLayout.jsx';
import AdminLayout from './layouts/AdminLayout.jsx';
import Dashboard from './pages/dashboard/index.jsx';
import Wallet from './pages/wallet/index.jsx';
import Trading from './pages/trading/index.jsx';
import TerminalLayout from './pages/trading/TerminalLayout.jsx';
import PammAi from './pages/pamm/PammAi.jsx';
import PammFundDetail from './pages/pamm/PammFundDetail.jsx';
import CopyHub from './pages/copy/index.jsx';
import CopyFollowing from './pages/copy/CopyFollowing.jsx';
import CopyManager from './pages/copy/CopyManager.jsx';
import MasterProfile from './pages/copy/MasterProfile.jsx';
import Ib from './pages/ib/index.jsx';
import Finance from './pages/finance/index.jsx';
import AdminDashboard from './pages/admin/AdminDashboard.jsx';
import AdminLeads from './pages/admin/AdminLeads.jsx';
import AdminTickets from './pages/admin/AdminTickets.jsx';
import AdminKyc from './pages/admin/AdminKyc.jsx';
import AdminBroadcast from './pages/admin/AdminBroadcast.jsx';
import AdminMarket from './pages/admin/AdminMarket.jsx';
import AdminLogs from './pages/admin/AdminLogs.jsx';
import AdminFinancials from './pages/admin/AdminFinancials.jsx';
import AdminCompanyLedger from './pages/admin/AdminCompanyLedger.jsx';
import AdminUsers from './pages/admin/AdminUsers.jsx';
import AdminLiquidity from './pages/admin/AdminLiquidity.jsx';
import AdminSettings from './pages/admin/AdminSettings.jsx';
import AdminTradingMonitor from './pages/admin/AdminTradingMonitor.jsx';
import AdminTraderDetail from './pages/admin/AdminTraderDetail.jsx';
import AdminAuditLog from './pages/admin/AdminAuditLog.jsx';
import AdminIbCommission from './pages/admin/AdminIbCommission.jsx';
import AdminBullRun from './pages/admin/AdminBullRun.jsx';
import AdminBulkImport from './pages/admin/AdminBulkImport.jsx';
import AdminProfitCommissionAdjust from './pages/admin/AdminProfitCommissionAdjust.jsx';
import AdminAccountsCommandCenter from './pages/admin/AdminAccountsCommandCenter.jsx';
import AdminFraudDashboard from './pages/admin/AdminFraudDashboard.jsx';
import AdminAlerts from './pages/admin/AdminAlerts.jsx';
import AdminPlatformEnv from './pages/admin/AdminPlatformEnv.jsx';
import GatewayRedirect from './pages/wallet/GatewayRedirect.jsx';
import ProfileSettings from './pages/settings/ProfileSettings.jsx';
import MaintenanceGate from './components/MaintenanceGate.jsx';
import MaintenanceNotice from './pages/maintenance/MaintenanceNotice.jsx';

function App() {
  return (
    <AuthProvider>
      <BrowserRouter future={{ v7_relativeSplatPath: true }}>
        <MaintenanceGate>
        <MarketDataProvider>
        <Routes>
          <Route path="/" element={<Landing />} />
          {/* Password reset: top-level paths so /auth never swallows /auth/reset-password; keep aliases for old links */}
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/auth/verify-email/:token" element={<VerifyEmail />} />
          <Route path="/auth/verify-email" element={<VerifyEmail />} />
          <Route path="/verify-email/:token" element={<VerifyEmail />} />
          <Route path="/verify-email" element={<VerifyEmail />} />
          <Route path="/auth/forgot-password" element={<ForgotPassword />} />
          <Route path="/auth/reset-password" element={<ResetPassword />} />
          <Route path="/auth/profile-setup" element={<ProfileSetup />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/maintenance" element={<MaintenanceNotice />} />
          <Route element={<AccountProvider><FinanceProvider><ProtectedRoute requireAuth><AppLayout /></ProtectedRoute></FinanceProvider></AccountProvider>}>
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="wallet" element={<Wallet />} />
          <Route path="gateway-redirect" element={<GatewayRedirect />} />
          <Route path="trading" element={<TradingSocketProvider><Trading /></TradingSocketProvider>} />
          <Route path="trading/terminal" element={<TradingSocketProvider><TerminalLayout /></TradingSocketProvider>} />
          <Route path="pamm-ai" element={<PammAi />} />
          <Route path="pamm-ai/fund/:fundId" element={<PammFundDetail />} />
          <Route path="copy" element={<CopyHub />} />
          <Route path="copy/following" element={<CopyFollowing />} />
          <Route path="copy/manager" element={<CopyManager />} />
          <Route path="copy/master/:slug" element={<MasterProfile />} />
          <Route path="ib" element={<ProtectedRoute allowedRoles={IB_ROLES}><Ib /></ProtectedRoute>} />
          <Route path="finance" element={<Finance />} />
          <Route path="settings/profile" element={<ProfileSettings />} />
          </Route>
          <Route path="admin" element={<ProtectedRoute requireAuth allowedRoles={ADMIN_ROLES} redirectTo="/dashboard"><AdminLayout /></ProtectedRoute>}>
          <Route index element={<AdminDashboard />} />
          <Route path="financials" element={<AdminFinancials />} />
          <Route path="financials/ledger" element={<AdminCompanyLedger />} />
          <Route path="trading-monitor" element={<AdminTradingMonitor />} />
          <Route path="trading-monitor/:userId" element={<AdminTraderDetail />} />
          <Route path="users" element={<AdminUsers />} />
          <Route path="bulk-import" element={<AdminBulkImport />} />
          <Route path="profit-commission-adjust" element={<AdminProfitCommissionAdjust />} />
          <Route path="ib-commission" element={<AdminIbCommission />} />
          <Route path="audit" element={<AdminAuditLog />} />
          <Route path="bullrun" element={<AdminBullRun />} />
          <Route path="liquidity" element={<AdminLiquidity />} />
          <Route path="leads" element={<AdminLeads />} />
          <Route path="tickets" element={<AdminTickets />} />
          <Route path="kyc" element={<AdminKyc />} />
          <Route path="broadcast" element={<AdminBroadcast />} />
          <Route path="market" element={<AdminMarket />} />
          <Route path="logs" element={<AdminLogs />} />
          <Route path="settings" element={<AdminSettings />} />
          <Route
            path="platform-env"
            element={
              <ProtectedRoute requireAuth allowedRoles={SUPERADMIN_ROLES} redirectTo="/admin">
                <AdminPlatformEnv />
              </ProtectedRoute>
            }
          />
          <Route path="accounts-command-center" element={<AdminAccountsCommandCenter />} />
          <Route path="fraud-dashboard" element={<AdminFraudDashboard />} />
          <Route path="alerts" element={<AdminAlerts />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </MarketDataProvider>
        </MaintenanceGate>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
