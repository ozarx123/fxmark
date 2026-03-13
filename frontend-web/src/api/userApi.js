/**
 * User API — profile, KYC (requires Bearer token)
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

/** GET /users/kyc — current user KYC status */
export async function getKyc() {
  const res = await fetchWithAuth('/users/kyc');
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to load KYC status');
  return res.json();
}

/** POST /users/kyc/submit — submit KYC for review */
export async function submitKyc() {
  const res = await fetchWithAuth('/users/kyc/submit', { method: 'POST' });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to submit KYC');
  return res.json();
}
