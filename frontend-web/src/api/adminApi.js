import { getApiBase } from '../config/apiBase.js';

/**
 * Admin API helpers — require Bearer token
 */
const API_BASE = getApiBase();

function getToken() {
  return localStorage.getItem('fxmark_token');
}

/** When server sets ADMIN_MFA_TOTP_SECRET, paste current TOTP in Admin panel (sessionStorage). */
function adminMfaHeaders() {
  try {
    const c = sessionStorage.getItem('fxmark_admin_mfa_otp');
    if (c && String(c).trim()) return { 'X-Admin-Mfa': String(c).trim() };
  } catch {
    /* private mode */
  }
  return {};
}

export async function fetchWithAuth(url, options = {}) {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...adminMfaHeaders(),
    ...options.headers,
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${url}`, { ...options, headers });
  return res;
}

export async function listUsers(params = {}) {
  const q = new URLSearchParams(params).toString();
  const res = await fetchWithAuth(`/admin/users${q ? `?${q}` : ''}`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) {
      if (data.code === 'ADMIN_MFA_REQUIRED') {
        throw new Error(data.hint || 'Enter the admin MFA code in the bar at the top of the admin panel.');
      }
      throw new Error('Please log in again to view users.');
    }
    if (res.status === 403) throw new Error('Access denied. Admin or Super Admin role required.');
    throw new Error(data.error || data.message || 'Failed to fetch users');
  }
  return res.json();
}

/** Persisted admin actions + execution mode / hybrid rule changes (read-only). */
export async function listAdminAuditLogs(params = {}) {
  const q = new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== ''))
  ).toString();
  const res = await fetchWithAuth(`/admin/audit-logs${q ? `?${q}` : ''}`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || data.message || 'Failed to load audit log');
  }
  return res.json();
}

export async function updateUser(id, { role, kycStatus, kycRejectedReason }) {
  const body = {};
  if (role !== undefined) body.role = role;
  if (kycStatus !== undefined) body.kycStatus = kycStatus;
  if (kycRejectedReason !== undefined) body.kycRejectedReason = kycRejectedReason;
  const res = await fetchWithAuth(`/admin/users/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to update user');
  return res.json();
}

/** Admin: platform-wide company financials (ledger aggregates) */
export async function getCompanyLedgerEntries(params = {}) {
  const q = new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== ''))
  ).toString();
  const res = await fetchWithAuth(`/admin/finance/ledger-entries${q ? `?${q}` : ''}`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to load ledger entries');
  }
  return res.json();
}

export async function getCompanyFinancials(params = {}) {
  const q = new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== ''))
  ).toString();
  const res = await fetchWithAuth(`/admin/finance/company${q ? `?${q}` : ''}`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to load company financials');
  }
  return res.json();
}

/** Admin: company super wallet and main ledger summary (company entity, not owned by any user). */
export async function getCompanyWallet() {
  const res = await fetchWithAuth('/admin/finance/company-wallet');
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to load company wallet');
  }
  return res.json();
}

/** Super Admin: user context for profit/commission adjustment form */
export async function getProfitCommissionContext(userId) {
  const res = await fetchWithAuth(`/admin/users/${encodeURIComponent(userId)}/profit-commission-context`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    if (res.status === 403) throw new Error('Super Admin role required');
    throw new Error(data.error || 'Failed to load context');
  }
  return res.json();
}

/** Super Admin: atomic PAMM P&L + wallet + IB commission adjustment */
export async function postProfitCommissionAdjustment(userId, body) {
  const res = await fetchWithAuth(`/admin/users/${encodeURIComponent(userId)}/profit-commission-adjustment`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    if (res.status === 403) throw new Error('Super Admin role required');
    throw new Error(data.error || 'Adjustment failed');
  }
  return res.json();
}

/** Super Admin only: add funds to a customer wallet */
export async function addFundsToWallet(userId, { amount, currency = 'USD', reference }) {
  const res = await fetchWithAuth(`/admin/wallets/${userId}/add-funds`, {
    method: 'POST',
    body: JSON.stringify({ amount: Number(amount), currency, reference }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    if (res.status === 403) throw new Error('Super Admin role required');
    throw new Error(data.error || 'Failed to add funds');
  }
  return res.json();
}

// ---------- IB commission (admin) ----------
export async function getIbProfiles(params = {}) {
  const q = new URLSearchParams(params).toString();
  const res = await fetchWithAuth(`/admin/ib/profiles${q ? `?${q}` : ''}`);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to fetch IB profiles');
  return res.json();
}

/**
 * Reassign client's introducing broker. Pass referrerUserId (IB user id), referrerEmail (IB account email), or both (must match).
 * Clearing referrer is not allowed.
 */
export async function putClientReferrer(clientUserId, referrerUserId, options = {}) {
  const { reason, referrerEmail } = options;
  const body = {};
  if (referrerUserId != null && String(referrerUserId).trim() !== '') {
    body.referrerUserId = String(referrerUserId).trim();
  }
  const em = typeof referrerEmail === 'string' ? referrerEmail.trim().toLowerCase() : '';
  if (em) body.referrerEmail = em;
  if (!body.referrerUserId && !body.referrerEmail) {
    throw new Error('referrerUserId or referrer email is required');
  }
  if (reason) body.reason = String(reason);
  const res = await fetchWithAuth(`/admin/ib/clients/${encodeURIComponent(clientUserId)}/referrer`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to update client referrer');
  return res.json();
}

/** Move IB in hierarchy (parentId). parentUserId null/omit = root. */
export async function putIbProfileParent(ibUserId, parentUserId) {
  const res = await fetchWithAuth(`/admin/ib/profiles/${encodeURIComponent(ibUserId)}/parent`, {
    method: 'PUT',
    body: JSON.stringify({ parentUserId: parentUserId == null || parentUserId === '' ? null : parentUserId }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to update IB parent');
  return res.json();
}

/** Signup joinings vs commission-based clients for one IB */
export async function getIbReferralOverview(ibUserId, params = {}) {
  const q = new URLSearchParams(params).toString();
  const res = await fetchWithAuth(
    `/admin/ib/profiles/${encodeURIComponent(ibUserId)}/referral-overview${q ? `?${q}` : ''}`
  );
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to fetch referral overview');
  return res.json();
}

/** Users with no referrer or broken referrer → IB */
export async function getIbReferrerGaps(params = {}) {
  const q = new URLSearchParams(params).toString();
  const res = await fetchWithAuth(`/admin/ib/referrer-gaps${q ? `?${q}` : ''}`);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to fetch referrer gaps');
  return res.json();
}

export async function getIbCommissions(params = {}) {
  const q = new URLSearchParams(params).toString();
  const res = await fetchWithAuth(`/admin/ib/commissions${q ? `?${q}` : ''}`);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to fetch commissions');
  return res.json();
}

export async function getIbWallets() {
  const res = await fetchWithAuth('/admin/ib/wallets');
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to fetch IB wallets');
  return res.json();
}

export async function getIbSettings() {
  const res = await fetchWithAuth('/admin/ib/settings');
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to fetch IB settings');
  return res.json();
}

/** @param {object} body — { ratePerLotByLevel } and/or { defaultReferrerUserId }; or pass rate map only for backward compat */
export async function updateIbSettings(body) {
  const payload =
    body && typeof body === 'object' && body.ratePerLotByLevel === undefined && body.defaultReferrerUserId === undefined
      ? { ratePerLotByLevel: body }
      : body;
  const res = await fetchWithAuth('/admin/ib/settings', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to update IB settings');
  return res.json();
}

/** Super Admin: PAMM Bull Run investor IB commission (levels 1–3, % of active capital) */
export async function getPammIbCommissionSettings() {
  const res = await fetchWithAuth('/admin/ib/pamm-investor-commission');
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    if (res.status === 403) throw new Error('Super Admin role required');
    throw new Error(data.error || 'Failed to fetch PAMM IB commission settings');
  }
  return res.json();
}

export async function updatePammIbCommissionSettings(levels) {
  const res = await fetchWithAuth('/admin/ib/pamm-investor-commission', {
    method: 'PUT',
    body: JSON.stringify({ levels }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    if (res.status === 403) throw new Error('Super Admin role required');
    throw new Error(data.error || 'Failed to update PAMM IB commission settings');
  }
  return res.json();
}

export async function processIbPayout(userId) {
  const res = await fetchWithAuth(`/admin/ib/${userId}/payout`, { method: 'POST' });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to process payout');
  }
  return res.json();
}

// ---------- Trading monitor (admin view user trading activity) ----------
export async function getAdminTopTraders(limit = 10) {
  const res = await fetchWithAuth(`/admin/trading/top-traders?limit=${limit}`);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to fetch top traders');
  return res.json();
}

export async function getAdminTradingUserSummary(userId) {
  const res = await fetchWithAuth(`/admin/trading/users/${userId}/summary`);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to fetch user');
  return res.json();
}

export async function getAdminTradingAccounts(userId) {
  const res = await fetchWithAuth(`/admin/trading/users/${userId}/accounts`);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to fetch accounts');
  return res.json();
}

export async function getAdminTradingWallet(userId) {
  const res = await fetchWithAuth(`/admin/trading/users/${userId}/wallet`);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to fetch wallet');
  return res.json();
}

export async function getAdminTradingPositions(userId, params = {}) {
  const defaults = { limit: 200 };
  const merged = { ...defaults, ...params };
  const q = new URLSearchParams(merged).toString();
  const res = await fetchWithAuth(`/admin/trading/users/${userId}/positions${q ? `?${q}` : ''}`);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to fetch positions');
  return res.json();
}

export async function getAdminTradingClosedPositions(userId, params = {}) {
  const q = new URLSearchParams(params).toString();
  const res = await fetchWithAuth(`/admin/trading/users/${userId}/positions/closed${q ? `?${q}` : ''}`);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to fetch trade history');
  return res.json();
}

export async function getAdminTradingOrders(userId, params = {}) {
  const q = new URLSearchParams(params).toString();
  const res = await fetchWithAuth(`/admin/trading/users/${userId}/orders${q ? `?${q}` : ''}`);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to fetch orders');
  return res.json();
}

export async function adminClosePosition(userId, positionId, body = {}) {
  const res = await fetchWithAuth(`/admin/trading/users/${userId}/positions/${positionId}/close`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to close position');
  return res.json();
}

export async function adminCancelOrder(userId, orderId) {
  const res = await fetchWithAuth(`/admin/trading/users/${userId}/orders/${orderId}/cancel`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to cancel order');
  return res.json();
}

export async function getAdminTradingLimits(userId) {
  const res = await fetchWithAuth(`/admin/trading/users/${userId}/limits`);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to fetch limits');
  return res.json();
}

export async function updateAdminTradingLimits(userId, { blocked, maxDrawdownPercent, maxDailyLoss }) {
  const body = {};
  if (blocked !== undefined) body.blocked = blocked;
  if (maxDrawdownPercent !== undefined) body.maxDrawdownPercent = maxDrawdownPercent;
  if (maxDailyLoss !== undefined) body.maxDailyLoss = maxDailyLoss;
  const res = await fetchWithAuth(`/admin/trading/users/${userId}/limits`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to update limits');
  return res.json();
}

/** Get CRM/config for a trading account (leverage, execution group, trading enabled, etc.) */
export async function getAdminAccountConfig(userId, accountId) {
  const res = await fetchWithAuth(`/admin/trading/users/${userId}/accounts/${accountId}/config`);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to fetch account config');
  return res.json();
}

/** Update CRM/config for a trading account */
export async function updateAdminAccountConfig(userId, accountId, body) {
  const res = await fetchWithAuth(`/admin/trading/users/${userId}/accounts/${accountId}/config`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to update account config');
  return res.json();
}

// ---------- Execution mode (A-Book / B-Book / Hybrid) ----------
export async function getExecutionMode() {
  const res = await fetchWithAuth('/admin/execution-mode');
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to fetch execution mode');
  return res.json();
}

export async function putExecutionMode(executionMode) {
  const res = await fetchWithAuth('/admin/execution-mode', {
    method: 'PUT',
    body: JSON.stringify({ executionMode }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to update execution mode');
  return res.json();
}

export async function getHybridRules() {
  const res = await fetchWithAuth('/admin/hybrid-rules');
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to fetch hybrid rules');
  return res.json();
}

export async function putHybridRules(rules) {
  const res = await fetchWithAuth('/admin/hybrid-rules', {
    method: 'PUT',
    body: JSON.stringify(rules),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to update hybrid rules');
  return res.json();
}

/** Margin stop-out / warning thresholds (tick engine); persisted in Mongo, effective immediately after save. */
export async function getMarginRiskSettings() {
  const res = await fetchWithAuth('/admin/trading/margin-risk');
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to fetch margin risk settings');
  return res.json();
}

export async function putMarginRiskSettings(body) {
  const res = await fetchWithAuth('/admin/trading/margin-risk', {
    method: 'PUT',
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to update margin risk settings');
  }
  return res.json();
}

/** Super Admin: platform env overrides (Mongo → process.env). Values returned masked. */
export async function getPlatformEnv() {
  const res = await fetchWithAuth('/admin/platform-env');
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    if (res.status === 403) throw new Error(data.error || 'Super Admin role required');
    throw new Error(data.error || 'Failed to load platform environment');
  }
  return res.json();
}

/** Super Admin: set or clear (empty string) one key */
export async function putPlatformEnv(key, value) {
  const res = await fetchWithAuth('/admin/platform-env', {
    method: 'PUT',
    body: JSON.stringify({ key, value: value === undefined ? '' : value }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    if (res.status === 403) throw new Error(data.error || 'Super Admin role required');
    throw new Error(data.error || 'Failed to update environment key');
  }
  return res.json();
}

// ---------- PAMM / Bull Run fund (admin) ----------
export async function listPammFunds() {
  const res = await fetchWithAuth('/admin/pamm/funds');
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to fetch PAMM funds');
  return res.json();
}

export async function createPammFund(body) {
  const res = await fetchWithAuth('/admin/pamm/funds', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to create fund');
  return res.json();
}

export async function getPammFund(fundId) {
  const res = await fetchWithAuth(`/admin/pamm/funds/${encodeURIComponent(fundId)}`);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to fetch fund');
  return res.json();
}

export async function updatePammFund(fundId, body) {
  const res = await fetchWithAuth(`/admin/pamm/funds/${encodeURIComponent(fundId)}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to update fund');
  return res.json();
}

// ---------- Bulk user import (superadmin only) ----------
export async function getBulkImportConfig() {
  const res = await fetchWithAuth('/admin/bulk-import/config');
  if (!res.ok) {
    if (res.status === 403) throw new Error('Super Admin role required');
    throw new Error((await res.json().catch(() => ({}))).error || 'Failed to load import config');
  }
  return res.json();
}

export async function runBulkImport(rows, dryRun = true) {
  const res = await fetchWithAuth('/admin/bulk-import', {
    method: 'POST',
    body: JSON.stringify({ rows, dryRun }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    if (res.status === 403) throw new Error('Super Admin role required');
    throw new Error(data.error || data.message || 'Bulk import failed');
  }
  return res.json();
}

// ---------- Withdrawal approval settings (command center) ----------
export async function getWithdrawalApprovalSettings() {
  const res = await fetchWithAuth('/admin/withdrawal-approval-settings');
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to fetch withdrawal approval settings');
  return res.json();
}

export async function updateWithdrawalApprovalSettings({ autoApproveSmallWithdrawals, autoApproveThresholdUsd }) {
  const body = {};
  if (typeof autoApproveSmallWithdrawals === 'boolean') body.autoApproveSmallWithdrawals = autoApproveSmallWithdrawals;
  if (Number.isFinite(autoApproveThresholdUsd)) body.autoApproveThresholdUsd = autoApproveThresholdUsd;
  const res = await fetchWithAuth('/admin/withdrawal-approval-settings', {
    method: 'PUT',
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to update withdrawal approval settings');
  return res.json();
}

// ---------- Activity feed (all transaction types) ----------
export async function getActivity(limit = 80) {
  const res = await fetchWithAuth(`/admin/activity?limit=${limit}`);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to fetch activity');
  return res.json();
}

// ---------- Reconciliation ----------
export async function getLatestReconciliation() {
  const res = await fetchWithAuth('/admin/reconciliation/wallet-ledger/latest');
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to fetch reconciliation');
  return res.json();
}

// ---------- Fraud dashboard & withdrawals ----------
export async function getFraudDashboardStats() {
  const res = await fetchWithAuth('/admin/fraud-dashboard/stats');
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to fetch stats');
  return res.json();
}

export async function getWithdrawals(params = {}) {
  const q = new URLSearchParams(params).toString();
  const res = await fetchWithAuth(`/admin/withdrawals${q ? `?${q}` : ''}`);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to fetch withdrawals');
  return res.json();
}

export async function getWithdrawalDetail(id) {
  const res = await fetchWithAuth(`/admin/withdrawals/${id}`);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to fetch withdrawal');
  return res.json();
}

export async function updateWithdrawalStatus(id, status, adminNote) {
  const body = { status };
  if (adminNote != null && String(adminNote).trim() !== '') body.adminNote = String(adminNote).trim();
  const res = await fetchWithAuth(`/admin/withdrawals/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to update withdrawal');
  return data;
}

/** Admin: mark approved withdrawal completed (funds sent). */
export async function completeWithdrawal(id) {
  const res = await fetchWithAuth(`/admin/withdrawals/${id}/complete`, { method: 'POST' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to complete withdrawal');
  return data;
}

// ---------- Alerts ----------
export async function getAlerts(params = {}) {
  const q = new URLSearchParams(params).toString();
  const res = await fetchWithAuth(`/admin/alerts${q ? `?${q}` : ''}`);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to fetch alerts');
  return res.json();
}

export async function resolveAlert(id) {
  const res = await fetchWithAuth(`/admin/alerts/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ resolved: true }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to resolve alert');
  return res.json();
}

/** Platform maintenance (manual + schedule) */
export async function getMaintenance() {
  const res = await fetchWithAuth('/admin/maintenance');
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to load maintenance settings');
  }
  return res.json();
}

export async function putMaintenance(body) {
  const res = await fetchWithAuth('/admin/maintenance', {
    method: 'PUT',
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to save maintenance settings');
  }
  return res.json();
}


