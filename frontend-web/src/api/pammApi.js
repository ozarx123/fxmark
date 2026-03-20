import { getApiBase } from '../config/apiBase.js';

/**
 * PAMM API — Bull Run (PAMM AI) fund detail, follow, add funds, withdraw, unfollow
 */
const API_BASE = getApiBase();

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

/** List approved PAMM managers (public). Used to find BULL RUN fund. */
export async function listManagers(params = {}) {
  const q = new URLSearchParams();
  if (params.public !== undefined) q.set('public', params.public);
  if (params.limit) q.set('limit', params.limit);
  const url = `/pamm/managers${q.toString() ? `?${q}` : ''}`;
  const res = await fetch(`${API_BASE}${url}`);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to load managers');
  return res.json();
}

/** Get fund detail (investor view): fund, stats, recent trades, my allocation; for Bull Run includes bullRun object. */
export async function getFundDetail(fundId) {
  const res = await fetchWithAuth(`/pamm/funds/${encodeURIComponent(fundId)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to load fund');
  return res.json();
}

/** Record acceptance of Investor Terms for a fund (required before follow for Bull Run). */
export async function acceptTerms(fundId) {
  const res = await fetchWithAuth('/pamm/accept-terms', {
    method: 'POST',
    body: JSON.stringify({ fundId }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to accept terms');
  return res.json();
}

/** Follow a manager (allocate balance to fund). */
export async function follow(managerId, allocatedBalance = 0) {
  const res = await fetchWithAuth('/pamm/follow', {
    method: 'POST',
    body: JSON.stringify({ managerId, allocatedBalance: Number(allocatedBalance) }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to follow');
  return res.json();
}

/** Unfollow (close allocation). Blocked when fund has active trade. */
export async function unfollow(allocationId) {
  const res = await fetchWithAuth('/pamm/unfollow', {
    method: 'POST',
    body: JSON.stringify({ allocationId }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to unfollow');
  return res.json();
}

/** Request withdrawal from allocation. Blocked when fund has active trade. */
export async function withdraw(allocationId, amount) {
  const res = await fetchWithAuth('/pamm/withdraw', {
    method: 'POST',
    body: JSON.stringify({ allocationId, amount: Number(amount) }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to withdraw');
  return res.json();
}

/** Add funds to existing allocation. */
export async function addFunds(allocationId, amount) {
  const res = await fetchWithAuth('/pamm/add-funds', {
    method: 'POST',
    body: JSON.stringify({ allocationId, amount: Number(amount) }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to add funds');
  return res.json();
}

/** Manager only: list investors for a fund (requires auth). */
export async function getMyInvestors(fundId, limit = 100) {
  const q = new URLSearchParams({ fundId });
  if (limit) q.set('limit', String(limit));
  const res = await fetchWithAuth(`/pamm/managers/me/investors?${q}`);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to load investors');
  return res.json();
}

/** Manager only: get one investor's detail (deposit/withdraw log, profit/ROI) for a fund. */
export async function getInvestorDetail(fundId, followerId) {
  const q = new URLSearchParams({ fundId, followerId });
  const res = await fetchWithAuth(`/pamm/managers/me/investor-detail?${q}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to load investor detail');
  return res.json();
}

/** Public PAMM config (e.g. enabled for users). */
export async function getPammConfig() {
  const res = await fetch(`${API_BASE}/pamm/config`);
  if (!res.ok) return { enabledForUsers: true };
  const data = await res.json().catch(() => ({}));
  return {
    enabledForUsers: data.enabledForUsers !== false,
    message: data.message,
  };
}

