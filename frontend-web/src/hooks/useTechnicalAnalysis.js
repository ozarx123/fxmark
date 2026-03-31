import { useState, useEffect } from 'react';

const API_BASE = (() => {
  const base = import.meta.env.VITE_API_URL;
  if (base) return base.replace(/\/api\/?$/, '') + '/api';
  if (import.meta.env.PROD) return 'https://fxmark-backend-541368249845.us-central1.run.app/api';
  return '/api';
})();

/**
 * Fetches technical analysis (RSI, MACD, trend, levels) from the backend (Finnhub candles + server-side TA).
 * @param {string} symbol - Display symbol e.g. "XAU/USD", "EUR/USD"
 * @param {string} [interval] - Optional interval: 1m, 5m, 15m, 1h, 1day (default 1day)
 * @returns {{ data: object|null, loading: boolean, error: string|null }}
 */
export function useTechnicalAnalysis(symbol, interval = '1day') {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const internalSymbol = symbol ? String(symbol).replace(/\//g, '').toUpperCase() : '';

  useEffect(() => {
    if (!internalSymbol) {
      setData(null);
      setError(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const params = new URLSearchParams({ symbol: internalSymbol, interval });
        const res = await fetch(`${API_BASE}/market/technical?${params}`);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || 'Failed to fetch technical analysis');
        }
        const body = await res.json();
        if (!cancelled) setData(body);
      } catch (e) {
        if (!cancelled) setError(e.message || 'Technical data unavailable');
        if (!cancelled) setData(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [internalSymbol, interval]);

  return { data, loading, error };
}
