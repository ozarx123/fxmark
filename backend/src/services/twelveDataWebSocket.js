import WebSocket from 'ws';
import { TO_TWELVEDATA, FROM_TWELVEDATA } from '../config/twelveDataSymbols.js';

const RECONNECT_BASE_MS = 3000;
const RECONNECT_MAX_MS = 120_000;
const HEARTBEAT_INTERVAL_MS = 10_000;

/**
 * Twelve Data real-time price WebSocket.
 * @see https://twelvedata.com/docs/websocket/ws-real-time-price
 *
 * @returns {{ close(): void, readyState: number } | null}
 */
export function createTwelveDataWebSocket({ apiKey, symbols, onTick, onConnect, onDisconnect, onError }) {
  if (!apiKey) {
    onError?.(new Error('Twelve Data API key not set'));
    return null;
  }

  const tdSymbols = [
    ...new Set((symbols ?? []).map((s) => TO_TWELVEDATA[String(s).toUpperCase()]).filter(Boolean)),
  ];

  if (tdSymbols.length === 0) {
    onError?.(new Error('No supported Twelve Data symbols in SUBSCRIBED_SYMBOLS'));
    return null;
  }

  let ws = null;
  let reconnectDelay = RECONNECT_BASE_MS;
  let reconnectTimer = null;
  let heartbeatTimer = null;
  let destroyed = false;

  function clearHeartbeat() {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  }

  function connect() {
    if (destroyed) return;

    if (ws) {
      try {
        ws.removeAllListeners();
      } catch (_) {
        /* ignore */
      }
      try {
        if (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN) {
          ws.terminate();
        }
      } catch (_) {
        /* ignore */
      }
      ws = null;
    }

    const url = `wss://ws.twelvedata.com/v1/quotes/price?apikey=${encodeURIComponent(apiKey)}`;
    ws = new WebSocket(url, { handshakeTimeout: 15_000 });

    ws.on('open', () => {
      reconnectDelay = RECONNECT_BASE_MS;
      const subscribeMsg = JSON.stringify({
        action: 'subscribe',
        params: { symbols: tdSymbols.join(',') },
      });
      ws.send(subscribeMsg);
      onConnect?.();

      clearHeartbeat();
      heartbeatTimer = setInterval(() => {
        if (ws?.readyState === WebSocket.OPEN) {
          try {
            ws.send(JSON.stringify({ action: 'heartbeat' }));
          } catch (_) {
            /* ignore */
          }
        }
      }, HEARTBEAT_INTERVAL_MS);
    });

    ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }

      const ev = String(msg.event || msg.type || '').toLowerCase();
      if (ev === 'subscribe-status' && msg.status === 'error') {
        console.warn('[TwelveData] subscribe-status:', msg);
        return;
      }
      if (ev === 'heartbeat' || ev === 'ping') {
        return;
      }

      if (ev !== 'price' || msg.symbol == null) return;

      const internalSymbol = FROM_TWELVEDATA[String(msg.symbol)];
      if (!internalSymbol) return;

      const price = parseFloat(msg.price);
      if (!Number.isFinite(price) || price <= 0) return;

      const serverReceivedAt = Date.now();
      let tsMs = serverReceivedAt;
      if (msg.timestamp != null) {
        const t = Number(msg.timestamp);
        if (Number.isFinite(t)) {
          tsMs = t < 1e12 ? t * 1000 : t;
        }
      } else if (msg.time != null) {
        const t = Number(msg.time);
        if (Number.isFinite(t)) tsMs = t < 1e12 ? t * 1000 : t;
      }

      const datetime = new Date(tsMs).toISOString();

      onTick({
        symbol: internalSymbol,
        price,
        close: price,
        open: price,
        high: price,
        low: price,
        volume: Number(msg.day_volume ?? msg.volume ?? 0) || 0,
        datetime,
        timestamp: tsMs,
        providerTs: tsMs,
        source: 'twelvedata',
        serverReceivedAt,
      });
    });

    ws.on('error', (err) => {
      console.error(`[TwelveData] WebSocket error: ${err?.message ?? err}`);
      onError?.(err);
    });

    ws.on('close', (code, reason) => {
      clearHeartbeat();
      const why = reason?.toString() || '—';
      console.warn(`[TwelveData] Disconnected (code=${code} reason=${why})`);
      onDisconnect?.('close');

      if (!destroyed) {
        const jitter = Math.floor(Math.random() * 2000);
        const waitMs = reconnectDelay + jitter;
        reconnectTimer = setTimeout(() => {
          reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX_MS);
          reconnectTimer = null;
          connect();
        }, waitMs);
      }
    });
  }

  connect();

  return {
    close() {
      destroyed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      clearHeartbeat();
      try {
        ws?.close();
      } catch (_) {
        /* ignore */
      }
      ws = null;
    },
    get readyState() {
      return ws?.readyState ?? WebSocket.CLOSED;
    },
  };
}
