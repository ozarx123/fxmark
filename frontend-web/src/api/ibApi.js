/**
 * IB API — profile, balance, commissions, payouts (requires Bearer token)
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

/** Get my IB profile (404 if not registered) */
export async function getMyProfile() {
  const res = await fetchWithAuth('/ib/profile');
  if (res.status === 404) return null;
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to load profile');
  return res.json();
}

/** Register as IB */
export async function registerAsIb(payload) {
  const body = {
    parentId: payload.parentId || null,
    ratePerLot: payload.ratePerLot != null ? Number(payload.ratePerLot) : 7,
    currency: payload.currency || 'USD',
  };
  const res = await fetchWithAuth('/ib/register', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to register');
  return res.json();
}

/** Update IB profile */
export async function updateProfile(payload) {
  const body = {};
  if (payload.ratePerLot != null) body.ratePerLot = Number(payload.ratePerLot);
  if (payload.currency != null) body.currency = payload.currency;
  const res = await fetchWithAuth('/ib/profile', {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to update profile');
  return res.json();
}

/** Get commission balance (pending, paid) */
export async function getBalance() {
  const res = await fetchWithAuth('/ib/balance');
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to load balance');
  return res.json();
}

/** Get IB stats (referral count, earnings, etc.) */
export async function getStats() {
  const res = await fetchWithAuth('/ib/stats');
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to load stats');
  return res.json();
}

/** List referral joinings (users who signed up with our ref link) */
export async function listReferralJoinings(params = {}) {
  const q = new URLSearchParams();
  if (params.limit) q.set('limit', params.limit);
  const url = `/ib/referrals/joinings${q.toString() ? `?${q}` : ''}`;
  const res = await fetchWithAuth(url);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to load joinings');
  return res.json();
}

/** List commissions */
export async function listCommissions(params = {}) {
  const q = new URLSearchParams();
  if (params.status) q.set('status', params.status);
  if (params.from) q.set('from', params.from);
  if (params.to) q.set('to', params.to);
  if (params.limit) q.set('limit', params.limit);
  const url = `/ib/commissions${q.toString() ? `?${q}` : ''}`;
  const res = await fetchWithAuth(url);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to load commissions');
  return res.json();
}

/** List payouts */
export async function listPayouts(params = {}) {
  const q = new URLSearchParams();
  if (params.status) q.set('status', params.status);
  if (params.limit) q.set('limit', params.limit);
  const url = `/ib/payouts${q.toString() ? `?${q}` : ''}`;
  const res = await fetchWithAuth(url);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to load payouts');
  return res.json();
}

/** Request payout */
export async function requestPayout(amount) {
  const body = amount != null ? { amount: Number(amount) } : {};
  const res = await fetchWithAuth('/ib/payouts', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to request payout');
  return res.json();
}

/** List referrals (clients with commission summary) */
export async function listReferrals(params = {}) {
  const q = new URLSearchParams();
  if (params.limit) q.set('limit', params.limit);
  const url = `/ib/referrals${q.toString() ? `?${q}` : ''}`;
  const res = await fetchWithAuth(url);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to load referrals');
  return res.json();
}
