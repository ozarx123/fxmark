import { getApiBase } from '../config/apiBase.js';

/**
 * Trading API — orders and positions (requires Bearer token)
 */
const API_BASE = getApiBase();

function getToken() {
  return localStorage.getItem('fxmark_token');
}

function getAccountHeaders(accountId, accountNumber) {
  const h = {};
  if (accountId) h['X-Account-Id'] = accountId;
  else if (accountNumber) h['X-Account-Number'] = accountNumber;
  return h;
}

/** Parse error message from failed response for consistent user-facing messages. */
async function parseErrorResponse(res, fallback = 'Request failed') {
  try {
    const body = await res.json();
    if (body && typeof body.error === 'string') return body.error;
    if (body && typeof body.message === 'string') return body.message;
  } catch (_) { /* ignore */ }
  if (res.status === 401) return 'Session expired or unauthorized';
  if (res.status === 403) return 'Access denied';
  if (res.status === 404) return 'Resource not found';
  if (res.status >= 500) return 'Server error. Try again later.';
  return fallback;
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
  const isMarket = payload.marketOrder === true || (payload.type && ['market', 'MARKET_BUY', 'MARKET_SELL'].includes(payload.type));
  const typeMap = {
    MARKET_BUY: 'market',
    MARKET_SELL: 'market',
    BUY_LIMIT: 'buy_limit',
    SELL_LIMIT: 'sell_limit',
    BUY_STOP: 'buy_stop',
    SELL_STOP: 'sell_stop',
  };
  const rawType = payload.type || (isMarket ? 'market' : 'market');
  const type = typeMap[rawType] || (isMarket ? 'market' : rawType.toLowerCase());
  const side = payload.side || (rawType.includes('SELL') ? 'sell' : 'buy');
  const body = {
    symbol: String(payload.symbol || '').replace(/\//g, ''),
    side,
    volume: Number(payload.volume ?? payload.lots ?? 0),
    type,
    price: isMarket ? undefined : (payload.price != null ? Number(payload.price) : undefined),
    executionPrice: isMarket && payload.price != null ? Number(payload.price) : undefined,
  };
  if (payload.stopLoss != null && payload.stopLoss !== '') body.stopLoss = Number(payload.stopLoss);
  if (payload.takeProfit != null && payload.takeProfit !== '') body.takeProfit = Number(payload.takeProfit);
  if (payload.clientOrderId != null && String(payload.clientOrderId).trim() !== '') {
    body.clientOrderId = String(payload.clientOrderId).trim();
  }
  const res = await fetchWithAuth('/trading/orders', { method: 'POST', body: JSON.stringify(body) }, accountId, accountNumber);
  if (!res.ok) throw new Error(await parseErrorResponse(res, 'Failed to place order'));
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
  if (!res.ok) throw new Error(await parseErrorResponse(res, 'Failed to load orders'));
  return res.json();
}

/** Get single order */
export async function getOrder(orderId, opts = {}) {
  const { accountId, accountNumber } = opts;
  const res = await fetchWithAuth(`/trading/orders/${orderId}`, {}, accountId, accountNumber);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(await parseErrorResponse(res, 'Failed to load order'));
  return res.json();
}

/** Cancel order */
export async function cancelOrder(orderId, opts = {}) {
  const { accountId, accountNumber } = opts;
  const res = await fetchWithAuth(`/trading/orders/${orderId}/cancel`, { method: 'POST' }, accountId, accountNumber);
  if (!res.ok) throw new Error(await parseErrorResponse(res, 'Failed to cancel order'));
  return res.json();
}

/** Update pending order price (for modify). */
export async function updateOrderPrice(orderId, price, opts = {}) {
  const { accountId, accountNumber } = opts;
  const res = await fetchWithAuth(
    `/trading/orders/${orderId}`,
    { method: 'PATCH', body: JSON.stringify({ price: Number(price) }) },
    accountId,
    accountNumber
  );
  if (!res.ok) throw new Error(await parseErrorResponse(res, 'Failed to update order'));
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
  if (!res.ok) throw new Error(await parseErrorResponse(res, 'Failed to load positions'));
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
  if (!res.ok) throw new Error(await parseErrorResponse(res, 'Failed to load history'));
  return res.json();
}

/** Update take profit and/or stop loss for a position. Pass null to clear. */
export async function updatePositionTPLS(positionId, { takeProfit, stopLoss }, opts = {}) {
  const { accountId, accountNumber } = opts;
  const body = {};
  if (takeProfit !== undefined) body.takeProfit = takeProfit == null ? null : Number(takeProfit);
  if (stopLoss !== undefined) body.stopLoss = stopLoss == null ? null : Number(stopLoss);
  const res = await fetchWithAuth(`/trading/positions/${positionId}`, { method: 'PATCH', body: JSON.stringify(body) }, accountId, accountNumber);
  if (!res.ok) throw new Error(await parseErrorResponse(res, 'Failed to update TP/SL'));
  return res.json();
}

/** Close position (full or partial). Pass closePrice for accurate P&L and wallet credit. */
export async function closePosition(positionId, volume, closePrice, opts = {}) {
  const { accountId, accountNumber } = opts;
  const body = {};
  if (volume != null) body.volume = Number(volume);
  if (closePrice != null) body.closePrice = Number(closePrice);
  const res = await fetchWithAuth(`/trading/positions/${positionId}/close`, { method: 'POST', body: JSON.stringify(body) }, accountId, accountNumber);
  if (!res.ok) throw new Error(await parseErrorResponse(res, 'Failed to close position'));
  return res.json();
}

// ---------- Trading accounts ----------

/** List trading accounts */
export async function listTradingAccounts() {
  const res = await fetchWithAuth('/trading/accounts');
  if (!res.ok) throw new Error(await parseErrorResponse(res, 'Failed to load accounts'));
  return res.json();
}

/** Create trading account */
export async function createTradingAccount(body) {
  const res = await fetchWithAuth('/trading/accounts', { method: 'POST', body: JSON.stringify(body) });
  if (!res.ok) throw new Error(await parseErrorResponse(res, 'Failed to create account'));
  return res.json();
}

/** Get single trading account */
export async function getTradingAccount(accountId) {
  const res = await fetchWithAuth(`/trading/accounts/${accountId}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(await parseErrorResponse(res, 'Failed to load account'));
  return res.json();
}

/** Get account summary (balance, equity, margin used, free margin, margin level) */
export async function getAccountSummary(opts = {}) {
  const { accountId, accountNumber } = opts;
  const res = await fetchWithAuth('/trading/account-summary', {}, accountId, accountNumber);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(await parseErrorResponse(res, 'Failed to load account summary'));
  return res.json();
}

