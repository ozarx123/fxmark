/**
 * Admin routes
 * GET /leads, POST /kyc-override, POST /pamm-privacy, POST /broadcast (protected, admin role)
 */
import express from 'express';
import controller from './admin.controller.js';
import * as logsController from './logs.controller.js';
import { authenticate } from '../../core/middleware.js';
import { rateLimit } from '../../core/rateLimit.middleware.js';
import { requireAdminMfaIfConfigured } from './admin-mfa.middleware.js';
import { adminAuditMiddleware } from './admin-audit.middleware.js';

/** Aligned with frontend ADMIN_ROLES — staff who can use /admin UI and read-only finance APIs */
const ADMIN_PANEL_ROLES = new Set([
  'superadmin',
  'super_admin',
  'admin',
  'dealing_desk',
  'risk_manager',
  'finance_manager',
  'compliance_officer',
  'support_manager',
]);

/** Match JWT/DB variants: "Finance Manager" → finance_manager */
function normalizePanelRole(role) {
  if (role == null || role === '') return '';
  return String(role).trim().toLowerCase().replace(/\s+/g, '_');
}

const requireAdmin = (req, res, next) => {
  const role = normalizePanelRole(req.user?.role);
  if (!role || !ADMIN_PANEL_ROLES.has(role)) {
    return res.status(403).json({ error: 'Forbidden', code: 'ADMIN_REQUIRED' });
  }
  next();
};

const requireSuperAdmin = (req, res, next) => {
  const r = normalizePanelRole(req.user?.role);
  if (r !== 'superadmin' && r !== 'super_admin') {
    return res.status(403).json({ error: 'Super Admin role required', code: 'SUPERADMIN_REQUIRED' });
  }
  next();
};

const router = express.Router();
router.use(authenticate);
router.use(requireAdmin);
router.use(requireAdminMfaIfConfigured);
router.use(adminAuditMiddleware);
router.use(
  rateLimit({
    windowMs: 60_000,
    max: 300,
    keyGenerator: (req) =>
      req.user?.id ? `admin:${req.user.id}` : `admin:ip:${req.ip || req.socket?.remoteAddress || 'x'}`,
    message: 'Too many admin requests. Slow down.',
  })
);
router.get('/leads', controller.getLeads);
router.get('/users', controller.listUsers);
router.patch('/users/:id', controller.updateUser);
router.post('/kyc-override', controller.kycOverride);
router.post('/broadcast', controller.broadcast);
router.post('/wallets/:userId/add-funds', requireSuperAdmin, controller.addFundsToWallet);
router.get('/users/:userId/profit-commission-context', requireSuperAdmin, controller.getUserProfitCommissionContext);
router.post('/users/:userId/profit-commission-adjustment', requireSuperAdmin, controller.postUserProfitCommissionAdjustment);

// IB commission (admin)
router.get('/ib/referrer-gaps', controller.getIbReferrerGaps);
router.get('/ib/profiles/:ibUserId/referral-overview', controller.getIbReferralOverview);
router.put('/ib/profiles/:ibUserId/parent', controller.putIbProfileParent);
router.get('/ib/profiles', controller.getIbProfiles);
router.get('/ib/commissions', controller.getIbCommissions);
router.get('/ib/wallets', controller.getIbWallets);
router.get('/ib/settings', controller.getIbSettings);
router.put('/ib/settings', controller.updateIbSettings);
router.get('/ib/pamm-investor-commission', requireSuperAdmin, controller.getPammIbCommissionSettings);
router.put('/ib/pamm-investor-commission', requireSuperAdmin, controller.updatePammIbCommissionSettings);
router.post('/ib/:userId/payout', controller.processIbPayout);
/** Reassign client's introducing broker (referrerId). Body: referrerUserId and/or referrerEmail (IB) — cannot clear. */
router.put('/ib/clients/:userId/referrer', controller.putClientReferrer);
router.patch('/ib/clients/:userId/referrer', controller.putClientReferrer);

// Trading monitor — admin views user trading activity
router.get('/trading/top-traders', controller.getTopTraders);
router.get('/trading/users/:userId/summary', controller.getTradingUserSummary);
router.get('/trading/users/:userId/accounts', controller.getTradingAccounts);
router.get('/trading/users/:userId/wallet', controller.getTradingWallet);
router.get('/trading/users/:userId/positions', controller.getTradingPositions);
router.get('/trading/users/:userId/positions/closed', controller.getTradingClosedPositions);
router.get('/trading/users/:userId/orders', controller.getTradingOrders);
router.post('/trading/users/:userId/positions/:positionId/close', controller.adminClosePosition);
router.post('/trading/users/:userId/orders/:orderId/cancel', controller.adminCancelOrder);
router.get('/trading/users/:userId/limits', controller.getTradingLimits);
router.put('/trading/users/:userId/limits', controller.updateTradingLimits);
router.get('/trading/users/:userId/accounts/:accountId/config', controller.getAccountConfig);
router.put('/trading/users/:userId/accounts/:accountId/config', controller.updateAccountConfig);

// ── Execution mode (A-Book / B-Book / Hybrid) ─────────────────────────────────
router.get('/execution-mode', controller.getExecutionMode);
router.put('/execution-mode', controller.putExecutionMode);
router.get('/hybrid-rules', controller.getHybridRules);
router.put('/hybrid-rules', controller.putHybridRules);

// Margin risk (tick engine: stop-out %, warning %, throttle) — persisted; runtime refreshed on save
router.get('/trading/margin-risk', controller.getMarginRiskSettings);
router.put('/trading/margin-risk', controller.putMarginRiskSettings);

// ── Log viewer (admin only) ───────────────────────────────────────────────────
router.get('/logs/summary',                   logsController.getLogsSummary);
router.get('/logs/files',                     logsController.getLogFiles);
router.get('/logs/download',                  logsController.downloadLogFile);
router.get('/logs',                           logsController.getLogs);

// ── Payment settings (Payments → Settings) ────────────────────────────────────
router.get('/payments/settings', controller.getPaymentSettings);
router.put('/payments/settings', controller.updatePaymentSettings);
router.get('/withdrawal-approval-settings', controller.getWithdrawalApprovalSettings);
router.put('/withdrawal-approval-settings', controller.updateWithdrawalApprovalSettings);

// ── Wallet vs ledger daily reconciliation (read-only audit) ────────────────────
router.get('/reconciliation/wallet-ledger/latest', controller.getLatestWalletLedgerReconciliation);
router.get('/reconciliation/nowpayments-deposits', controller.getNowpaymentsDepositReconciliation);

// Platform-wide company financials (ledger aggregates, not per-user)
router.get('/finance/company', controller.getCompanyFinancials);
router.get('/finance/ledger-entries', controller.getCompanyLedgerEntries);
router.get('/finance/company-wallet', controller.getCompanyWallet);

// ── Fraud dashboard & withdrawals ─────────────────────────────────────────────
router.get('/fraud-dashboard/stats', controller.getFraudDashboardStats);
router.get('/activity', controller.listRecentActivity);
router.get('/audit-logs', controller.listAuditLogs);
router.get('/withdrawals', controller.listWithdrawals);
router.get('/withdrawals/:id', controller.getWithdrawalDetail);
router.patch('/withdrawals/:id', controller.updateWithdrawalStatus);
router.post('/withdrawals/:id/complete', controller.completeWithdrawal);
router.post('/withdrawals/:id/nowpayments-payout', requireSuperAdmin, controller.postNowpaymentsWithdrawalPayout);

// ── Alerts (critical events: fraud, reconciliation, etc.) ─────────────────────
router.get('/alerts', controller.getAlerts);
router.patch('/alerts/:id', controller.resolveAlert);

// Platform environment overrides (Mongo → process.env). Super Admin only.
router.get('/platform-env', requireSuperAdmin, controller.getPlatformEnv);
router.put('/platform-env', requireSuperAdmin, controller.putPlatformEnv);

// Platform maintenance (manual + scheduled) — all admin-panel roles
router.get('/maintenance', controller.getMaintenance);
router.put('/maintenance', controller.putMaintenance);

// ── Bulk user import (superadmin only) ─────────────────────────────────────────
router.get('/bulk-import/config', requireSuperAdmin, controller.getBulkImportConfig);
router.post('/bulk-import', requireSuperAdmin, controller.bulkImport);

// ── PAMM distribution audit (read-only) ────────────────────────────────────────
router.get('/pamm/distribution-runs', controller.listPammDistributionRuns);
router.get('/pamm/distribution-runs/:positionId', controller.getPammDistributionRunsByPosition);

// ── PAMM / Bull Run fund (admin create & manage) ───────────────────────────────
router.get('/pamm/funds', controller.listPammFunds);
router.post('/pamm/funds', controller.createPammFund);
router.get('/pamm/funds/:fundId', controller.getPammFund);
router.patch('/pamm/funds/:fundId', controller.updatePammFund);

export default router;
