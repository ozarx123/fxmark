import { useState, useEffect, useCallback } from 'react';

const API_BASE = '/api/market';
const WS_URL = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`;

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
      setCandles(Array.isArray(data) ? data : []);
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
  }, [fetchCandles, internalSymbol]);

  useEffect(() => {
    if (!internalSymbol) return;
    let ws = null;
    const connect = () => {
      ws = new WebSocket(WS_URL);
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type === 'tick' && msg.data && msg.data.symbol === internalSymbol) {
            setTick(msg.data);
          }
        } catch {
          // ignore parse errors
        }
      };
      ws.onclose = () => {
        // Reconnect after delay
        setTimeout(connect, 3000);
      };
    };
    connect();
    return () => {
      if (ws) ws.close();
    };
  }, [internalSymbol]);

  return { candles, tick, loading, error, refetch: fetchCandles };
}
