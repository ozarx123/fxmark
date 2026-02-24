import { useState, useEffect, useCallback, useRef } from 'react';

const API_BASE = '/api/market';
const WS_URL = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`;

/** Throttle tick state updates (ms) - 0 = immediate realtime */
const TICK_THROTTLE_MS = 0;

/**
 * Convert display symbol (EUR/USD) to internal (EURUSD)
 */
function toInternalSymbol(display) {
  return String(display || '').replace(/\//g, '').toUpperCase();
}

/**
 * useMarketData - Fetch candles from REST + subscribe to live ticks via WebSocket
 * @param {string} symbol - Display symbol e.g. EUR/USD, XAU/USD
 * @param {string} timeframe - 1m, 5m, 15m, 1h, 1d
 * @returns {{ candles: Array, tick: object|null, loading: boolean, error: string|null }}
 */
export function useMarketData(symbol, timeframe = '1m') {
  const [candles, setCandles] = useState([]);
  const [tick, setTick] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [wsConnected, setWsConnected] = useState(false);

  const internalSymbol = toInternalSymbol(symbol);

  const fetchCandles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ symbol: internalSymbol, tf: timeframe });
      const res = await fetch(`${API_BASE}/candles?${params}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || res.statusText || 'Failed to fetch candles');
      }
      const data = await res.json();
      const arr = Array.isArray(data) ? data : [];
      setCandles(arr);
      if (arr.length > 0) {
        const last = arr[arr.length - 1];
        const lastClose = last.close != null ? Number(last.close) : null;
        if (lastClose != null) {
          setTick((prev) => prev && (prev.close != null || prev.price != null) ? prev : {
            symbol: internalSymbol,
            close: lastClose,
            price: lastClose,
            open: last.open,
            high: last.high,
            low: last.low,
            datetime: last.time || new Date().toISOString(),
          });
        }
      }
    } catch (e) {
      setError(e.message);
      setCandles([]);
    } finally {
      setLoading(false);
    }
  }, [internalSymbol, timeframe]);

  useEffect(() => {
    if (!internalSymbol) return;
    fetchCandles();
    const refetchMs = { '1m': 30000, '5m': 60000, '15m': 90000, '1h': 120000, '1d': 300000 }[timeframe] ?? 30000;
    const id = setInterval(fetchCandles, refetchMs);
    return () => clearInterval(id);
  }, [fetchCandles, internalSymbol, timeframe]);

  const tickThrottleRef = useRef(null);
  const lastTickRef = useRef(null);

  const MAX_RECONNECT_FAILURES = 5;
  useEffect(() => {
    if (!internalSymbol) return;
    let ws = null;
    let reconnectFailures = 0;
    const flushTick = () => {
      tickThrottleRef.current = null;
      if (lastTickRef.current) {
        setTick(lastTickRef.current);
        lastTickRef.current = null;
      }
    };
    const connect = () => {
      if (reconnectFailures >= MAX_RECONNECT_FAILURES) return;
      ws = new WebSocket(WS_URL);
      ws.onopen = () => setWsConnected(true);
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type === 'tick' && msg.data && msg.data.symbol === internalSymbol) {
            lastTickRef.current = msg.data;
            reconnectFailures = 0;
            if (TICK_THROTTLE_MS <= 0) {
              setTick(msg.data);
            } else if (!tickThrottleRef.current) {
              setTick(msg.data);
              tickThrottleRef.current = setTimeout(flushTick, TICK_THROTTLE_MS);
            }
          }
        } catch {
          // ignore parse errors
        }
      };
      ws.onclose = () => {
        setWsConnected(false);
        reconnectFailures++;
        if (reconnectFailures < MAX_RECONNECT_FAILURES) {
          setTimeout(connect, 3000);
        }
      };
    };
    connect();
    return () => {
      setWsConnected(false);
      if (tickThrottleRef.current) clearTimeout(tickThrottleRef.current);
      tickThrottleRef.current = null;
      lastTickRef.current = null;
      if (ws) ws.close();
    };
  }, [internalSymbol]);

  return { candles, tick, loading, error, wsConnected, refetch: fetchCandles };
}
