import { useState, useEffect, useCallback, useRef } from 'react';
import { useMarketDataContext } from '../context/MarketDataContext.jsx';
import { getSecondsToNextBar } from '../lib/candleTime.js';

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
 * Convert any symbol (EUR/USD, xAUUSD, GOLD) to internal (EURUSD, XAUUSD)
 */
function toInternalSymbol(display) {
  const s = String(display || '').replace(/\//g, '').toUpperCase();
  return s === 'GOLD' ? 'XAUUSD' : s;
}

/**
 * useMarketData - Fetch candles from REST + subscribe to live ticks via WebSocket
 * @param {string} symbol - Display symbol e.g. EUR/USD, XAU/USD
 * @param {string} timeframe - 1m, 5m, 15m, 1h, 1d
 * @returns {{ candles: Array, tick: object|null, loading: boolean, error: string|null }}
 */
export function useMarketData(symbol, timeframe = '1m') {
  const [candles, setCandles] = useState([]);
  const [liveCandles, setLiveCandles] = useState([]);
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
          setLiveCandles(arr);
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

  // Refetch candles at bar boundary so we don't call Twelve Data every N seconds.
  // The current bar is painted from live ticks; we only need fresh candles when a new bar starts.
  const scheduleRef = useRef(null);
  useEffect(() => {
    if (!internalSymbol) return;
    fetchCandles();

    function scheduleNextRefetch() {
      const secToNext = getSecondsToNextBar(timeframe);
      const delaySec = 0.2;
      const ms = Math.min(
        (secToNext + delaySec) * 1000,
        { '1m': 65000, '5m': 310000, '15m': 910000, '1h': 3660000, '1d': 86400000 }[timeframe] ?? 300000
      );
      scheduleRef.current = setTimeout(() => {
        fetchCandles().then(scheduleNextRefetch).catch(scheduleNextRefetch);
      }, ms);
    }

    scheduleNextRefetch();
    return () => {
      if (scheduleRef.current) clearTimeout(scheduleRef.current);
    };
  }, [fetchCandles, internalSymbol, timeframe]);

  // Consume tick from central market data pool
  const { ticks, connected } = useMarketDataContext();
  const poolTick = ticks[internalSymbol];

  // Map timeframe to candle duration in seconds
  const tfSeconds = {
    '1m': 60,
    '5m': 5 * 60,
    '15m': 15 * 60,
    '1h': 60 * 60,
    '1d': 24 * 60 * 60,
  }[timeframe] ?? 60;

  const rafScheduledRef = useRef(false);
  const pendingTickRef = useRef(null);

  useEffect(() => {
    if (!internalSymbol) return;
    if (!poolTick) return;
    const price = poolTick.close ?? poolTick.price;
    if (!Number.isFinite(Number(price))) return;

    pendingTickRef.current = { poolTick, price: Number(price), tfSeconds };

    const flush = () => {
      rafScheduledRef.current = false;
      const pending = pendingTickRef.current;
      if (!pending) return;
      const { poolTick: pt, price: p, tfSeconds: tfs } = pending;

      setTick(pt);

      setLiveCandles((prev) => {
        if (!Number.isFinite(p)) return prev || [];
        let nowMs = pt.providerTs;
        if (nowMs == null || Number.isNaN(Number(nowMs))) {
          const parsed = pt.datetime ? Date.parse(pt.datetime) : NaN;
          nowMs = (parsed != null && !Number.isNaN(parsed)) ? parsed : Date.now();
        }
        const nowSec = Math.floor(nowMs / 1000);
        const bucketStart = Math.floor(nowSec / tfs) * tfs;

        if (!prev || prev.length === 0) {
          return [
            { time: bucketStart, open: p, high: p, low: p, close: p, volume: 0 },
          ];
        }

        const out = [...prev];
        const last = out[out.length - 1];

        if (!last || typeof last.time !== 'number') {
          out[out.length - 1] = {
            time: bucketStart,
            open: p,
            high: p,
            low: p,
            close: p,
            volume: last?.volume ?? 0,
          };
          return out;
        }

        if (bucketStart > last.time) {
          out.push({
            time: bucketStart,
            open: p,
            high: p,
            low: p,
            close: p,
            volume: 0,
          });
          return out;
        }

        const updated = {
          ...last,
          high: Math.max(last.high ?? p, p),
          low: Math.min(
            last.low == null || Number.isNaN(Number(last.low)) ? p : last.low,
            p
          ),
          close: p,
        };
        out[out.length - 1] = updated;
        return out;
      });
    };

    if (!rafScheduledRef.current) {
      rafScheduledRef.current = true;
      requestAnimationFrame(flush);
    }
  }, [internalSymbol, poolTick, tfSeconds]);

  useEffect(() => setWsConnected(connected), [connected]);

  const effectiveCandles = liveCandles.length ? liveCandles : candles;

  return { candles: effectiveCandles, tick, loading, error, wsConnected, refetch: fetchCandles };
}
