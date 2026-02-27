/**
 * Admin API helpers — require Bearer token
 */
const API_BASE = import.meta.env.VITE_API_URL || '/api';

function getToken() {
  return localStorage.getItem('fxmark_token');
}

export async function fetchWithAuth(url, options = {}) {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
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
    if (res.status === 401) throw new Error('Please log in again to view users.');
    if (res.status === 403) throw new Error('Access denied. Admin or Super Admin role required.');
    throw new Error(data.error || data.message || 'Failed to fetch users');
  }
  return res.json();
}

export async function updateUser(id, { role, kycStatus }) {
  const body = {};
  if (role !== undefined) body.role = role;
  if (kycStatus !== undefined) body.kycStatus = kycStatus;
  const res = await fetchWithAuth(`/admin/users/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to update user');
  return res.json();
}

export async function listPammManagers(params = {}) {
  const q = new URLSearchParams(params).toString();
  const res = await fetchWithAuth(`/admin/pamm/managers${q ? `?${q}` : ''}`);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to fetch PAMM managers');
  return res.json();
}

export async function approvePammManager(id, approvalStatus) {
  const res = await fetchWithAuth(`/admin/pamm/managers/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ approvalStatus }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to update PAMM manager');
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

export async function updateIbSettings(ratePerLotByLevel) {
  const res = await fetchWithAuth('/admin/ib/settings', {
    method: 'PUT',
    body: JSON.stringify({ ratePerLotByLevel }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to update IB settings');
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
