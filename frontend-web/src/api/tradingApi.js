/**
 * Trading API — orders and positions (requires Bearer token)
 */
const API_BASE = import.meta.env.VITE_API_URL || '/api';

function getToken() {
  return localStorage.getItem('fxmark_token');
}

function getAccountHeaders(accountId, accountNumber) {
  const h = {};
  if (accountId) h['X-Account-Id'] = accountId;
  else if (accountNumber) h['X-Account-Number'] = accountNumber;
  return h;
}

async function fetchWithAuth(url, options = {}, accountId = null, accountNumber = null) {
  const token = getToken();
  const headers = { 'Content-Type': 'application/json', ...getAccountHeaders(accountId, accountNumber), ...options.headers };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${url}`, { ...options, headers });
  return res;
}

// ---------- Orders ----------

/** Place a new order. Pass accountId/accountNumber for multi-account. */
export async function placeOrder(payload, opts = {}) {
  const { accountId, accountNumber } = opts;
  const body = {
    symbol: payload.symbol,
    side: payload.side || (payload.type === 'sell' ? 'sell' : 'buy'),
    volume: Number(payload.volume ?? payload.lots ?? 0),
    type: payload.marketOrder ? 'market' : (payload.type || 'market'),
    price: payload.marketOrder ? undefined : (payload.price != null ? Number(payload.price) : undefined),
    executionPrice: payload.marketOrder && payload.price != null ? Number(payload.price) : undefined,
  };
  const res = await fetchWithAuth('/trading/orders', { method: 'POST', body: JSON.stringify(body) }, accountId, accountNumber);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to place order');
  return res.json();
}

/** List orders */
export async function listOrders(params = {}, opts = {}) {
  const { accountId, accountNumber } = opts;
  const q = new URLSearchParams();
  if (params.status) q.set('status', params.status);
  if (params.symbol) q.set('symbol', params.symbol);
  if (params.limit) q.set('limit', params.limit);
  const url = `/trading/orders${q.toString() ? `?${q}` : ''}`;
  const res = await fetchWithAuth(url, {}, accountId, accountNumber);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to load orders');
  return res.json();
}

/** Get single order */
export async function getOrder(orderId, opts = {}) {
  const { accountId, accountNumber } = opts;
  const res = await fetchWithAuth(`/trading/orders/${orderId}`, {}, accountId, accountNumber);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to load order');
  return res.json();
}

/** Cancel order */
export async function cancelOrder(orderId, opts = {}) {
  const { accountId, accountNumber } = opts;
  const res = await fetchWithAuth(`/trading/orders/${orderId}/cancel`, { method: 'POST' }, accountId, accountNumber);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to cancel order');
  return res.json();
}

// ---------- Positions ----------

/** Get open positions */
export async function getOpenPositions(params = {}, opts = {}) {
  const { accountId, accountNumber } = opts;
  const q = new URLSearchParams();
  if (params.symbol) q.set('symbol', params.symbol);
  if (params.limit) q.set('limit', params.limit);
  const url = `/trading/positions${q.toString() ? `?${q}` : ''}`;
  const res = await fetchWithAuth(url, {}, accountId, accountNumber);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to load positions');
  return res.json();
}

/** Get closed positions */
export async function getClosedPositions(params = {}, opts = {}) {
  const { accountId, accountNumber } = opts;
  const q = new URLSearchParams();
  if (params.symbol) q.set('symbol', params.symbol);
  if (params.from) q.set('from', params.from);
  if (params.to) q.set('to', params.to);
  if (params.limit) q.set('limit', params.limit);
  const url = `/trading/positions/closed${q.toString() ? `?${q}` : ''}`;
  const res = await fetchWithAuth(url, {}, accountId, accountNumber);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to load history');
  return res.json();
}

/** Close position (full or partial). Pass closePrice for accurate P&L and wallet credit. */
export async function closePosition(positionId, volume, closePrice, opts = {}) {
  const { accountId, accountNumber } = opts;
  const body = {};
  if (volume != null) body.volume = Number(volume);
  if (closePrice != null) body.closePrice = Number(closePrice);
  const res = await fetchWithAuth(`/trading/positions/${positionId}/close`, { method: 'POST', body: JSON.stringify(body) }, accountId, accountNumber);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to close position');
  return res.json();
}

// ---------- Trading accounts ----------

/** List trading accounts */
export async function listTradingAccounts() {
  const res = await fetchWithAuth('/trading/accounts');
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to load accounts');
  return res.json();
}

/** Create trading account */
export async function createTradingAccount(body) {
  const res = await fetchWithAuth('/trading/accounts', { method: 'POST', body: JSON.stringify(body) });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to create account');
  return res.json();
}

/** Get single trading account */
export async function getTradingAccount(accountId) {
  const res = await fetchWithAuth(`/trading/accounts/${accountId}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to load account');
  return res.json();
}
