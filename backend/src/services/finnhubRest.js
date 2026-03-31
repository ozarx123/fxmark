/**
 * Finnhub REST — forex candles and quotes (replaces Twelve Data for market routes + fallback poller).
 */
import fetch from 'node-fetch';
import { toFinnhubSymbol } from '../config/finnhubSymbols.js';

const BASE = 'https://finnhub.io/api/v1';

/** Internal tf (1m, 5m, …) → Finnhub forex candle resolution */
const TF_TO_RESOLUTION = {
  '1m': '1',
  '5m': '5',
  '15m': '15',
  '1h': '60',
  '1d': 'D',
};

function mapTfToResolution(tf) {
  return TF_TO_RESOLUTION[tf] ?? null;
}

/**
 * OHLCV candles, oldest first, time in Unix seconds (for charts).
 */
export async function fetchCandles({ symbol, tf, from, to, apiKey }) {
  const k = (apiKey || '').trim();
  if (!k) {
    const err = new Error('FINNHUB_API_KEY not configured');
    err.statusCode = 500;
    throw err;
  }
  const internal = String(symbol || '').replace(/\//g, '').toUpperCase();
  const fh = toFinnhubSymbol(internal);
  if (!fh) {
    const err = new Error(`Unknown symbol: ${symbol}`);
    err.statusCode = 400;
    throw err;
  }
  const resolution = mapTfToResolution(tf);
  if (!resolution) {
    const err = new Error(`Invalid timeframe: ${tf}`);
    err.statusCode = 400;
    throw err;
  }

  const now = Math.floor(Date.now() / 1000);
  const defaultFrom = now - 86400 * 90;
  const fromSec = from ? Math.floor(Date.parse(from) / 1000) : defaultFrom;
  const toSec = to ? Math.floor(Date.parse(to) / 1000) : now;

  const url = `${BASE}/forex/candle?symbol=${encodeURIComponent(fh)}&resolution=${resolution}&from=${fromSec}&to=${toSec}&token=${encodeURIComponent(k)}`;
  const res = await fetch(url);
  const data = await res.json();

  if (data.s === 'no_data') return [];
  if (data.s !== 'ok') {
    const err = new Error(data.error || data.message || `Finnhub forex/candle HTTP ${res.status}`);
    err.httpStatus = res.status;
    throw err;
  }

  const { t, o, h, l, c, v } = data;
  const out = [];
  const n = (t && t.length) || 0;
  for (let i = 0; i < n; i++) {
    out.push({
      time: t[i],
      open: o[i],
      high: h[i],
      low: l[i],
      close: c[i],
      volume: v[i] ?? 0,
    });
  }
  return out;
}

/**
 * Latest quote for one symbol — same rough shape as former Twelve Data batch item.
 */
export async function fetchQuoteForSymbol(internalSymbol, apiKey) {
  const k = (apiKey || '').trim();
  if (!k) throw new Error('FINNHUB_API_KEY not configured');
  const sym = String(internalSymbol || '').replace(/\//g, '').toUpperCase();
  const fh = toFinnhubSymbol(sym);
  if (!fh) return null;

  const url = `${BASE}/quote?symbol=${encodeURIComponent(fh)}&token=${encodeURIComponent(k)}`;
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok || data.error) {
    const err = new Error(data.error || `HTTP ${res.status}`);
    err.httpStatus = res.status;
    throw err;
  }

  const price = parseFloat(data.c);
  if (!Number.isFinite(price)) return null;

  const t = data.t != null ? data.t * 1000 : Date.now();
  return {
    symbol: sym,
    price,
    open: parseFloat(data.o ?? data.pc ?? price),
    high: parseFloat(data.h ?? price),
    low: parseFloat(data.l ?? price),
    close: price,
    volume: 0,
    datetime: new Date(t).toISOString(),
    source: 'finnhub_rest',
    providerTs: t,
    serverReceivedAt: Date.now(),
  };
}

/**
 * Batch quotes (parallel requests; Finnhub has no multi-symbol quote in one call).
 */
export async function fetchQuotesBatch(symbols, apiKey) {
  const list = (symbols || []).map((s) => String(s).replace(/\//g, '').toUpperCase()).filter(Boolean);
  if (!list.length) return [];
  const results = await Promise.all(
    list.map((sym) =>
      fetchQuoteForSymbol(sym, apiKey).catch(() => null)
    )
  );
  return results.filter(Boolean);
}
