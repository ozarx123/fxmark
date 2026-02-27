/**
 * Socket.IO datafeed — low-level connection for tick/candle streams.
 * MarketDataProvider subscribes here; consumers read from context.
 */
import { io } from 'socket.io-client';

let socket = null;
let connectCount = 0;

function getDatafeedSocketUrl() {
  const api = import.meta.env.VITE_API_URL;
  if (api) {
    const base = api.replace(/\/api\/?$/, '');
    return base.startsWith('https') ? base : base.replace(/^http/, 'http');
  }
  if (import.meta.env.PROD) return 'https://fxmark-backend-541368249845.us-central1.run.app';
  return window.location.origin;
}

function getAuthToken() {
  try {
    return localStorage.getItem('fxmark_token') || null;
  } catch {
    return null;
  }
}

/**
 * Get or create the shared Socket.IO client for datafeed + trade updates
 */
export function getDatafeedSocket() {
  if (socket?.connected) return socket;
  if (socket && !socket.connected) return socket;
  const url = getDatafeedSocketUrl();
  const isCloudRun = url.includes('run.app');
  const transports = isCloudRun ? ['polling'] : ['polling', 'websocket'];
  const isDev = import.meta.env.DEV;
  const token = getAuthToken();
  socket = io(url, {
    path: '/socket.io',
    transports,
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
    timeout: 20000,
    auth: token ? { token } : {},
  });
  if (isDev) {
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
