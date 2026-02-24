/**
 * PAMM API — create/manage funds, allocations (requires Bearer token)
 */
const API_BASE = import.meta.env.VITE_API_URL || '/api';

function getToken() {
  return localStorage.getItem('fxmark_token');
}

async function fetchWithAuth(url, options = {}) {
  const token = getToken();
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${url}`, { ...options, headers });
  return res;
}

/** Get current user's manager/fund (404 if none) — backward compat, returns first fund */
export async function getMyManager() {
  const res = await fetchWithAuth('/pamm/managers/me');
  if (res.status === 404) return null;
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to load fund');
  return res.json();
}

/** Get all funds for current manager (empty array if none). Falls back to getMyManager when /funds returns 404. */
export async function getMyFunds() {
  const res = await fetchWithAuth('/pamm/managers/me/funds');
  if (res.status === 404 || !res.ok) {
    const single = await getMyManager().catch(() => null);
    return single ? [single] : [];
  }
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

/** Create a new fund */
export async function createFund(payload) {
  const body = {
    name: payload.name || 'My Strategy',
    performanceFeePercent: Number(payload.performanceFeePercent) || 0,
    allocationPercent: Number(payload.allocationPercent) || 100,
    isPublic: payload.status !== 'closed',
    strategy: payload.strategy || '',
    fundType: payload.fundType || 'growth',
    fundSize: Number(payload.fundSize) || 0,
    currentDeposit: Number(payload.currentDeposit) || 0,
  };
  const res = await fetchWithAuth('/pamm/managers', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to create fund');
  return res.json();
}

/** Create PAMM trading account for fund (step 2 after creating fund) */
export async function createPammTradingAccount() {
  const res = await fetchWithAuth('/pamm/managers/me/trading-account', { method: 'POST' });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to create PAMM trading account');
  return res.json();
}

/** Get PAMM trading account for current manager (null if none). Pass fundId for specific fund. Returns null on 404. */
export async function getPammTradingAccount(fundId = null) {
  const url = fundId ? `/pamm/managers/me/trading-account?fundId=${encodeURIComponent(fundId)}` : '/pamm/managers/me/trading-account';
  const res = await fetchWithAuth(url);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to load PAMM trading account');
  const data = await res.json();
  return data || null;
}

/** Get all PAMM trading accounts for current manager (array of { fundId, fundName, account }). Returns [] on 404. */
export async function listPammTradingAccounts() {
  const res = await fetchWithAuth('/pamm/managers/me/trading-account?list=true');
  if (res.status === 404) return [];
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to load PAMM trading accounts');
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

/** Update fund settings */
export async function updateFund(payload) {
  const body = {};
  if (payload.name !== undefined) body.name = payload.name;
  if (payload.performanceFeePercent !== undefined) body.performanceFeePercent = Number(payload.performanceFeePercent);
  if (payload.allocationPercent !== undefined) body.allocationPercent = Number(payload.allocationPercent);
  if (payload.status !== undefined) body.isPublic = payload.status !== 'closed';
  if (payload.strategy !== undefined) body.strategy = payload.strategy;
  if (payload.fundType !== undefined) body.fundType = payload.fundType;
  if (payload.fundSize !== undefined) body.fundSize = Number(payload.fundSize);
  if (payload.currentDeposit !== undefined) body.currentDeposit = Number(payload.currentDeposit);
  const res = await fetchWithAuth('/pamm/managers/me', {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to update fund');
  return res.json();
}

/** Get my allocations (funds I follow) */
export async function getMyAllocations(params = {}) {
  const q = new URLSearchParams();
  if (params.status) q.set('status', params.status);
  if (params.limit) q.set('limit', params.limit);
  const url = `/pamm/managers/me/allocations${q.toString() ? `?${q}` : ''}`;
  const res = await fetchWithAuth(url);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to load allocations');
  return res.json();
}

/** Get trades from funds I follow (for followers page) */
export async function getMyFollowerTrades(params = {}) {
  const q = new URLSearchParams();
  if (params.limit) q.set('limit', params.limit);
  const url = `/pamm/managers/me/follower-trades${q.toString() ? `?${q}` : ''}`;
  const res = await fetchWithAuth(url);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to load trades');
  return res.json();
}

/** Get my fund's investors (allocations where I am the manager). Pass fundId for specific fund. */
export async function getMyInvestors(fundId = null) {
  const url = fundId ? `/pamm/managers/me/investors?fundId=${encodeURIComponent(fundId)}` : '/pamm/managers/me/investors';
  const res = await fetchWithAuth(url);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to load investors');
  return res.json();
}

/** Get my fund's trades. Pass fundId for specific fund. */
export async function getMyTrades(fundId = null) {
  const url = fundId ? `/pamm/managers/me/trades?fundId=${encodeURIComponent(fundId)}` : '/pamm/managers/me/trades';
  const res = await fetchWithAuth(url);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to load trades');
  return res.json();
}

/** List approved PAMM managers (public, for browsing) */
export async function listManagers(params = {}) {
  const q = new URLSearchParams();
  if (params.public !== undefined) q.set('public', params.public);
  if (params.limit) q.set('limit', params.limit);
  const url = `/pamm/managers${q.toString() ? `?${q}` : ''}`;
  const res = await fetch(`${import.meta.env.VITE_API_URL || '/api'}${url}`);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to load managers');
  return res.json();
}

/** Get single manager by id or userId */
export async function getManager(managerId) {
  const res = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/pamm/managers/${managerId}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to load manager');
  return res.json();
}

/** Follow a manager (investor allocates balance) */
export async function follow(managerId, allocatedBalance = 0) {
  const res = await fetchWithAuth('/pamm/follow', {
    method: 'POST',
    body: JSON.stringify({ managerId, allocatedBalance: Number(allocatedBalance) }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to follow');
  return res.json();
}

/** Unfollow (close allocation) */
export async function unfollow(allocationId) {
  const res = await fetchWithAuth('/pamm/unfollow', {
    method: 'POST',
    body: JSON.stringify({ allocationId }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to unfollow');
  return res.json();
}

/** Request withdrawal from allocation */
export async function withdraw(allocationId, amount) {
  const res = await fetchWithAuth('/pamm/withdraw', {
    method: 'POST',
    body: JSON.stringify({ allocationId, amount: Number(amount) }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to withdraw');
  return res.json();
}

/** Add funds to existing allocation */
export async function addFunds(allocationId, amount) {
  const res = await fetchWithAuth('/pamm/add-funds', {
    method: 'POST',
    body: JSON.stringify({ allocationId, amount: Number(amount) }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to add funds');
  return res.json();
}
