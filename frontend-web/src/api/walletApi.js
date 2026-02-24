/**
 * Wallet API — balance, deposits, withdrawals (requires Bearer token)
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

/** Get wallet balance */
export async function getBalance(currency = 'USD') {
  const res = await fetchWithAuth(`/wallet/balance?currency=${encodeURIComponent(currency)}`);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to load balance');
  return res.json();
}

/** List deposits */
export async function listDeposits(limit = 50) {
  const res = await fetchWithAuth(`/wallet/deposits?limit=${limit}`);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to load deposits');
  return res.json();
}

/** List withdrawals */
export async function listWithdrawals(limit = 50) {
  const res = await fetchWithAuth(`/wallet/withdrawals?limit=${limit}`);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to load withdrawals');
  return res.json();
}

/** List trade P&L transactions */
export async function listTrades(limit = 50) {
  const res = await fetchWithAuth(`/wallet/trades?limit=${limit}`);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to load trades');
  return res.json();
}

/** List transfer transactions */
export async function listTransfers(limit = 50) {
  const res = await fetchWithAuth(`/wallet/transfers?limit=${limit}`);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to load transfers');
  return res.json();
}

/** Create deposit (returns id for confirm) */
export async function createDeposit(payload) {
  const body = {
    currency: payload.currency || 'USD',
    amount: Number(payload.amount),
    reference: payload.reference || payload.gateway || null,
  };
  const res = await fetchWithAuth('/wallet/deposits', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to create deposit');
  return res.json();
}

/** Confirm deposit (credits wallet) */
export async function confirmDeposit(depositId) {
  const res = await fetchWithAuth(`/wallet/deposits/${depositId}/confirm`, { method: 'POST' });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to confirm deposit');
  return res.json();
}

/** Request withdrawal (creates pending) */
export async function requestWithdrawal(payload) {
  const body = {
    currency: payload.currency || 'USD',
    amount: Number(payload.amount),
    destination: payload.destination || payload.method || null,
  };
  const res = await fetchWithAuth('/wallet/withdrawals', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to request withdrawal');
  return res.json();
}

/** Process withdrawal (deducts balance) */
export async function processWithdrawal(withdrawalId) {
  const res = await fetchWithAuth(`/wallet/withdrawals/${withdrawalId}/process`, { method: 'POST' });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to process withdrawal');
  return res.json();
}

/** Lookup transfer recipient by account no or email */
export async function lookupTransferRecipient(accountNoOrEmail) {
  const q = accountNoOrEmail.includes('@')
    ? `email=${encodeURIComponent(accountNoOrEmail)}`
    : `accountNo=${encodeURIComponent(accountNoOrEmail)}`;
  const res = await fetchWithAuth(`/wallet/transfer/lookup?${q}`);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to lookup');
  return res.json();
}

/** Execute internal transfer (requires verification) */
export async function executeTransfer(payload) {
  const res = await fetchWithAuth('/wallet/transfer', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Transfer failed');
  }
  return res.json();
}
