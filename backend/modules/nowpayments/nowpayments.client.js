/**
 * NOWPayments REST client — Payment API (x-api-key) + Mass payout (Bearer after /auth).
 * Base: https://api.nowpayments.io/v1/
 * Payout auth token: shared via Redis (when configured) + short lock to reduce auth stampede.
 */
import { get, set, del, acquireLock, releaseLock } from '../../src/services/cache.js';

const DEFAULT_BASE = 'https://api.nowpayments.io/v1';
const PAYOUT_TOKEN_TTL_SEC = 15 * 60; // max 15 minutes
const PAYOUT_TOKEN_CACHE_KEY = 'np:payout:auth:v1';
const PAYOUT_LOCK_KEY = 'np:payout:auth:refresh';
const PAYOUT_LOCK_TTL_SEC = 8;

function baseUrl() {
  return (process.env.NOWPAYMENTS_API_BASE || DEFAULT_BASE).replace(/\/$/, '');
}

function apiKey() {
  const k = (process.env.NOWPAYMENTS_API_KEY || '').trim();
  return k;
}

async function parseJsonResponse(res) {
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  return { ok: res.ok, status: res.status, data };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** @param {string} path e.g. '/payment' */
export async function postPayment(body) {
  const key = apiKey();
  if (!key) {
    const err = new Error('NOWPayments API key not configured');
    err.statusCode = 503;
    throw err;
  }
  const res = await fetch(`${baseUrl()}/payment`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
    },
    body: JSON.stringify(body),
  });
  const { ok, status, data } = await parseJsonResponse(res);
  if (!ok) {
    const err = new Error(data?.message || data?.errors?.[0] || `NOWPayments payment error (${status})`);
    err.statusCode = status >= 500 ? 502 : 400;
    err.npBody = data;
    throw err;
  }
  return data;
}

/** Mass payout: POST /auth (credentials never logged) */
export async function postAuth({ email, password }) {
  const res = await fetch(`${baseUrl()}/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const { ok, status, data } = await parseJsonResponse(res);
  if (!ok) {
    const err = new Error(data?.message || `NOWPayments auth failed (${status})`);
    err.statusCode = status >= 500 ? 502 : 401;
    throw err;
  }
  return data;
}

async function readCachedPayoutToken() {
  const row = await get(PAYOUT_TOKEN_CACHE_KEY);
  if (!row || typeof row !== 'object') return null;
  const token = String(row.token || '').trim();
  const exp = Number(row.exp);
  if (!token || !Number.isFinite(exp)) return null;
  if (Date.now() > exp - 5_000) return null;
  return token;
}

export async function getPayoutAuthToken({ email, password }) {
  const cached = await readCachedPayoutToken();
  if (cached) return cached;

  let gotLock = await acquireLock(PAYOUT_LOCK_KEY, PAYOUT_LOCK_TTL_SEC);
  if (!gotLock) {
    for (let i = 0; i < 15; i++) {
      await sleep(200);
      const again = await readCachedPayoutToken();
      if (again) return again;
      gotLock = await acquireLock(PAYOUT_LOCK_KEY, PAYOUT_LOCK_TTL_SEC);
      if (gotLock) break;
    }
  }

  if (!gotLock) {
    const last = await readCachedPayoutToken();
    if (last) return last;
    const err = new Error('NOWPayments payout auth: could not acquire lock or refresh token');
    err.statusCode = 503;
    throw err;
  }

  try {
    const afterWait = await readCachedPayoutToken();
    if (afterWait) return afterWait;

    const auth = await postAuth({ email, password });
    const token = String(auth?.token || '').trim();
    if (!token) {
      const err = new Error('NOWPayments auth returned empty token');
      err.statusCode = 502;
      throw err;
    }
    const exp = Date.now() + PAYOUT_TOKEN_TTL_SEC * 1000;
    await set(PAYOUT_TOKEN_CACHE_KEY, { token, exp }, PAYOUT_TOKEN_TTL_SEC);
    return token;
  } finally {
    await releaseLock(PAYOUT_LOCK_KEY);
  }
}

export function clearPayoutAuthTokenCache() {
  return del(PAYOUT_TOKEN_CACHE_KEY);
}

/** Mass payout: POST /payout with Bearer token + x-api-key */
export async function postPayout({ token, withdrawals }) {
  const key = apiKey();
  if (!key) {
    const err = new Error('NOWPayments API key not configured');
    err.statusCode = 503;
    throw err;
  }
  const res = await fetch(`${baseUrl()}/payout`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ withdrawals }),
  });
  const { ok, status, data } = await parseJsonResponse(res);
  if (!ok) {
    const err = new Error(data?.message || data?.errors?.[0] || `NOWPayments payout error (${status})`);
    err.statusCode = status >= 500 ? 502 : 400;
    err.npBody = data;
    throw err;
  }
  return data;
}

export function assertPayCurrency() {
  const c = (process.env.NOWPAYMENTS_PAY_CURRENCY || 'usdtbsc').trim().toLowerCase();
  return c;
}
