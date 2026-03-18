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
  const [tick, setTick] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [wsConnected, setWsConnected] = useState(false);

  const internalSymbol = toInternalSymbol(symbol);

  // ── Fix 1: stale-fetch guard ─────────────────────────────────────────────────
  // Each call to fetchCandles() stamps a unique request ID. When the async response
  // arrives, it checks whether its ID still matches the latest issued ID. If not,
  // the symbol/timeframe has already changed and the response is silently discarded,
  // preventing an older slow request from overwriting newer candle data.
  const requestIdRef = useRef(0);

  // ── Fix 2: reset tick + candles immediately on symbol/timeframe change ───────
  // Runs synchronously before the new fetch starts so the previous symbol's price
  // never flashes on the chart header or seeds the chart's Y-axis.
  const prevSymbolRef = useRef(internalSymbol);
  const prevTimeframeRef = useRef(timeframe);
  if (prevSymbolRef.current !== internalSymbol || prevTimeframeRef.current !== timeframe) {
    prevSymbolRef.current = internalSymbol;
    prevTimeframeRef.current = timeframe;
    // Mutate requestIdRef synchronously to invalidate any in-flight request
    requestIdRef.current += 1;
  }

  // Track the symbol+timeframe key of the PREVIOUS fetch so we can distinguish
  // a symbol/timeframe switch (needs candle clear) from a bar-boundary refresh
  // (must NOT clear — clearing causes hasRealData→false → sample setData fires).
  const prevFetchKeyRef = useRef(null);
  const cancelledRef = useRef(false);

  const fetchCandles = useCallback(async () => {
    if (cancelledRef.current) return;
    // Stamp this request and keep a local copy for closure comparison
    requestIdRef.current += 1;
    const myRequestId = requestIdRef.current;

    const fetchKey       = `${internalSymbol}::${timeframe}`;
    const isSymbolChange = prevFetchKeyRef.current !== fetchKey;
    prevFetchKeyRef.current = fetchKey;

    setLoading(true);
    setError(null);

    // Only clear stale candles/tick when the symbol or timeframe actually changed.
    // Bar-boundary refetches must NOT clear — clearing triggers hasRealData=false,
    // which causes FxChart to load sample bars via setData() mid-session.
    if (isSymbolChange) {
      setCandles([]);
      setTick(null);
    }

    let lastErr = null;
    try {
      for (let attempt = 0; attempt <= FETCH_RETRIES; attempt++) {
        try {
          const params = new URLSearchParams({ symbol: internalSymbol, tf: timeframe });
          const res = await fetchWithTimeout(`${API_BASE}/candles?${params}`);

          // ── Fix 1 check: discard if a newer request or unmount ──
          if (myRequestId !== requestIdRef.current || cancelledRef.current) return;

          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || res.statusText || 'Failed to fetch candles');
          }
          const data = await res.json();

          // ── Fix 1 check: guard again after the second await ──────────────────
          if (myRequestId !== requestIdRef.current || cancelledRef.current) return;

          const arr = Array.isArray(data) ? data : [];
          if (cancelledRef.current) return;
          setCandles(arr);

          // Seed tick with the last candle's close so the price label is populated
          // before the first WebSocket tick arrives. Only seed if no live tick has
          // arrived yet for this symbol (prev === null after the reset above).
          // ── Fix 3: preserve prev tick only when it belongs to this symbol ────
          if (arr.length > 0) {
            const last = arr[arr.length - 1];
            const lastClose = last.close != null ? Number(last.close) : null;
            if (lastClose != null) {
              setTick((prev) => {
                if (cancelledRef.current) return prev;
                const prevBelongsHere =
                  prev &&
                  toInternalSymbol(prev.symbol ?? '') === internalSymbol &&
                  (prev.close != null || prev.price != null);
                return prevBelongsHere
                  ? prev
                  : {
                      symbol: internalSymbol,
                      close: lastClose,
                      price: lastClose,
                      open: last.open,
                      high: last.high,
                      low: last.low,
                      datetime: last.time || new Date().toISOString(),
                    };
              });
            }
          }
          if (cancelledRef.current) return;
          setError(null);
          return;
        } catch (e) {
          if (myRequestId !== requestIdRef.current) return;
          lastErr = e;
          if (attempt < FETCH_RETRIES) {
            await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
          }
        }
      }
      if (myRequestId !== requestIdRef.current || cancelledRef.current) return;
      setError(lastErr?.message || 'Failed to fetch candles');
      setCandles([]);
    } finally {
      if (!cancelledRef.current && myRequestId === requestIdRef.current) setLoading(false);
    }
  }, [internalSymbol, timeframe]);

  // Refetch candles only at bar boundaries — live ticks are handled entirely inside
  // FxChart via its own socket subscription. This avoids triggering setData() on every tick.
  const scheduleRef = useRef(null);
  useEffect(() => {
    if (!internalSymbol) return;
    cancelledRef.current = false;
    fetchCandles();

    function scheduleNextRefetch() {
      if (cancelledRef.current) return;
      const secToNext = getSecondsToNextBar(timeframe);
      const delaySec = 0.2;
      const ms = Math.min(
        (secToNext + delaySec) * 1000,
        { '1m': 65000, '5m': 310000, '15m': 910000, '1h': 3660000, '1d': 86400000 }[timeframe] ?? 300000
      );
      scheduleRef.current = setTimeout(() => {
        if (cancelledRef.current) return;
        fetchCandles().then(scheduleNextRefetch).catch(scheduleNextRefetch);
      }, ms);
    }

    scheduleNextRefetch();
    return () => {
      cancelledRef.current = true;
      if (scheduleRef.current) {
        clearTimeout(scheduleRef.current);
        scheduleRef.current = null;
      }
    };
  }, [fetchCandles, internalSymbol, timeframe]);

  // Expose latest tick from central pool so Trading page price label stays current.
  // FxChart handles its own incremental series.update() via its internal socket handler —
  // we do NOT update candles state here to prevent triggering series.setData() on every tick.
  const { ticks, connected } = useMarketDataContext();
  const poolTick = ticks[internalSymbol];

  useEffect(() => {
    if (!poolTick) return;
    const price = poolTick.close ?? poolTick.price;
    if (!Number.isFinite(Number(price))) return;
    if (cancelledRef.current) return;
    setTick(poolTick);
  }, [poolTick]);

  useEffect(() => setWsConnected(connected), [connected]);

  return { candles, tick, loading, error, wsConnected, refetch: fetchCandles };
}
