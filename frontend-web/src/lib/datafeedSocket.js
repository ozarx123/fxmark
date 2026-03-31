/**
 * Socket.IO datafeed — low-level connection for tick/candle streams.
 * MarketDataProvider subscribes here; consumers read from context.
 */
import { io } from 'socket.io-client';

let socket = null;
let connectCount = 0;

function getDatafeedSocketUrl() {
  // In dev, connect Socket.IO directly to the backend port to avoid the Vite proxy
  // failing to forward WebSocket upgrade handshakes (ECONNRESET).
  if (import.meta.env.DEV) {
    return 'http://localhost:3000';
  }
  const api = import.meta.env.VITE_API_URL;
  if (api) {
    const base = api.replace(/\/api\/?$/, '');
    return base.startsWith('https') ? base : base.replace(/^http/, 'http');
  }
  if (import.meta.env.PROD) return 'https://fxmark-backend-541368249845.us-central1.run.app';
  return typeof window !== 'undefined' ? window.location.origin : '';
}

function getAuthToken() {
  try {
    return localStorage.getItem('fxmark_token') || null;
  } catch {
    return null;
  }
}

/** Active trading account from AccountContext persistence (must match REST X-Account-Id). */
function getStoredTradingAccountId() {
  try {
    const raw = localStorage.getItem('fxmark_account');
    if (!raw) return null;
    const d = JSON.parse(raw);
    return d.activeAccountId || null;
  } catch {
    return null;
  }
}

function buildSocketAuth(accountIdOverride = undefined) {
  const token = getAuthToken();
  const accountId = accountIdOverride !== undefined ? accountIdOverride : getStoredTradingAccountId();
  if (!token) return {};
  return accountId ? { token, accountId } : { token };
}

/**
 * Update Socket.IO auth with JWT + optional trading account (for scoped trade:update).
 * Call when the user switches account or after login.
 */
export function syncDatafeedSocketAuth(accountId) {
  if (!socket) return;
  socket.auth = buildSocketAuth(accountId ?? null);
  if (socket.connected) {
    socket.disconnect();
    socket.connect();
  }
}

/**
 * Get or create the shared Socket.IO client for datafeed + trade updates
 */
export function getDatafeedSocket() {
  if (socket?.connected) return socket;
  // Socket exists but is not connected (e.g. after explicit socket.disconnect()
  // called by reconnectWithAuth). Call socket.connect() to resume — auto-reconnect
  // is disabled after an explicit disconnect so we must trigger it manually.
  if (socket && !socket.connected) {
    socket.connect();
    return socket;
  }
  const url = getDatafeedSocketUrl();
  // Polling-first handshake, then upgrade to WebSocket in production.
  // In dev, some environments log failed WS upgrade attempts to the console even
  // when long-polling works; polling-only keeps the console clean locally.
  const transports = import.meta.env.DEV ? ['polling'] : ['polling', 'websocket'];
  socket = io(url, {
    path: '/socket.io',
    transports,
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
    timeout: 20000,
    auth: buildSocketAuth(),
  });
  if (import.meta.env.DEV) {
    socket.on('connect', () => console.log('[datafeed] Socket.IO connected'));
    socket.on('disconnect', (reason) => console.log('[datafeed] Socket.IO disconnected:', reason));
    socket.on('connect_error', (err) => console.error('[datafeed] Socket.IO connect_error:', err.message));
  }
  return socket;
}

/**
 * Connect and return socket (call when a consumer needs the datafeed)
 */
export function connectDatafeed() {
  connectCount++;
  const s = getDatafeedSocket();
  if (!s.connected) s.connect();
  return s;
}

/**
 * Disconnect when no consumers left
 */
export function disconnectDatafeed() {
  connectCount = Math.max(0, connectCount - 1);
  if (connectCount <= 0 && socket) {
    socket.disconnect();
  }
}

/**
 * Subscribe to tick events
 * @param {(tick: { symbol, price, open?, high?, low?, close, volume?, datetime? }) => void} callback
 * @returns {() => void} unsubscribe
 */
export function subscribeTick(callback) {
  const s = connectDatafeed();
  s.on('tick', callback);
  return () => {
    s.off('tick', callback);
    disconnectDatafeed();
  };
}

/**
 * Subscribe to candle events
 * @param {(candle: { symbol, tf, time, open, high, low, close, volume? }) => void} callback
 * @returns {() => void} unsubscribe
 */
export function subscribeCandle(callback) {
  const s = connectDatafeed();
  s.on('candle', callback);
  return () => {
    s.off('candle', callback);
    disconnectDatafeed();
  };
}

/**
 * Check if Socket.IO is connected
 */
export function isDatafeedConnected() {
  return socket?.connected ?? false;
}

/**
 * Reconnect with fresh auth token (call after login)
 */
export function reconnectWithAuth() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  connectCount = 0;
}
