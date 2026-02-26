import { useState, useEffect, useCallback, useRef } from 'react';
import { subscribeTick, getDatafeedSocket } from '../lib/datafeedSocket.js';

/** API base for market data - use backend URL in production (Vercel → GCP) */
const API_BASE = (() => {
  const base = import.meta.env.VITE_API_URL;
  if (base) return base.replace(/\/api\/?$/, '') + '/api/market';
  return '/api/market';
})();

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
    const refetchMs = { '1m': 10000, '5m': 30000, '15m': 60000, '1h': 120000, '1d': 300000 }[timeframe] ?? 30000;
    const id = setInterval(fetchCandles, refetchMs);
    return () => clearInterval(id);
  }, [fetchCandles, internalSymbol, timeframe]);

  const tickThrottleRef = useRef(null);
  const lastTickRef = useRef(null);

  // Socket.IO datafeed for live ticks
  useEffect(() => {
    if (!internalSymbol) return;
    const flushTick = () => {
      tickThrottleRef.current = null;
      if (lastTickRef.current) {
        setTick(lastTickRef.current);
        lastTickRef.current = null;
      }
    };
    const unsubTick = subscribeTick((tickData) => {
      if (!tickData || typeof tickData !== 'object') return;
      const price = tickData.close ?? tickData.price;
      if (tickData.symbol !== internalSymbol || (price != null && !Number.isFinite(Number(price)))) return;
      lastTickRef.current = tickData;
      if (TICK_THROTTLE_MS <= 0) {
        setTick(tickData);
      } else if (!tickThrottleRef.current) {
        setTick(tickData);
        tickThrottleRef.current = setTimeout(flushTick, TICK_THROTTLE_MS);
      }
    });
    const socket = getDatafeedSocket();
    setWsConnected(socket.connected);
    const onConnect = () => setWsConnected(true);
    const onDisconnect = () => setWsConnected(false);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      unsubTick();
      setWsConnected(false);
      if (tickThrottleRef.current) clearTimeout(tickThrottleRef.current);
      tickThrottleRef.current = null;
      lastTickRef.current = null;
    };
  }, [internalSymbol]);

  return { candles, tick, loading, error, wsConnected, refetch: fetchCandles };
}
