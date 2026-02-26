/**
 * Socket.IO datafeed — single connection for tick/candle streams.
 * Used by useMarketData and useLivePrices when Socket.IO is enabled.
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

/**
 * Get or create the shared Socket.IO client for datafeed
 */
export function getDatafeedSocket() {
  if (socket?.connected) return socket;
  if (socket && !socket.connected) return socket;
  const url = getDatafeedSocketUrl();
  socket = io(url, {
    path: '/socket.io',
    transports: ['polling', 'websocket'],
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
    timeout: 20000,
  });
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
