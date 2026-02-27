import { useState, useEffect, useCallback } from 'react';
import { useMarketDataContext } from '../context/MarketDataContext.jsx';

/** API base for market data - use backend URL in production */
const API_BASE = (() => {
  const base = import.meta.env.VITE_API_URL;
  if (base) return base.replace(/\/api\/?$/, '') + '/api/market';
  if (import.meta.env.PROD) return 'https://fxmark-backend-541368249845.us-central1.run.app/api/market';
  return '/api/market';
})();

/** Production: longer timeout for Cloud Run cold starts; retries for resilience */
const FETCH_TIMEOUT_MS = import.meta.env.PROD ? 20000 : 10000;
const FETCH_RETRIES = import.meta.env.PROD ? 3 : 1;

async function fetchWithTimeout(url, opts = {}) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), opts.timeout ?? FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal });
    clearTimeout(id);
    return res;
  } catch (e) {
    clearTimeout(id);
    throw e;
  }
}

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
    let lastErr = null;
    try {
      for (let attempt = 0; attempt <= FETCH_RETRIES; attempt++) {
        try {
          const params = new URLSearchParams({ symbol: internalSymbol, tf: timeframe });
          const res = await fetchWithTimeout(`${API_BASE}/candles?${params}`);
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
          setError(null);
          return;
        } catch (e) {
          lastErr = e;
          if (attempt < FETCH_RETRIES) {
            await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
          }
        }
      }
      setError(lastErr?.message || 'Failed to fetch candles');
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

  // Consume tick from central market data pool
  const { ticks, connected } = useMarketDataContext();
  const poolTick = ticks[internalSymbol];
  useEffect(() => {
    if (!internalSymbol) return;
    if (poolTick) {
      const price = poolTick.close ?? poolTick.price;
      if (Number.isFinite(Number(price))) setTick(poolTick);
    }
  }, [internalSymbol, poolTick]);
  useEffect(() => setWsConnected(connected), [connected]);

  return { candles, tick, loading, error, wsConnected, refetch: fetchCandles };
}
