/**
 * Twelve Data REST — time_series candles (fallback when Finnhub forex/candle fails or is unset).
 */
import fetch from 'node-fetch';
import { TO_TWELVEDATA } from '../config/twelveDataSymbols.js';
import { TIMEFRAME_TO_INTERVAL } from '../config/symbolMap.js';

const BASE = 'https://api.twelvedata.com';

export function twelveDataApiKey() {
  return (process.env.TWELVEDATA_API_KEY || process.env.TWELVE_DATA_API_KEY || '').trim();
}

function formatTwelveDateTime(sec) {
  return new Date(sec * 1000).toISOString().slice(0, 19).replace('T', ' ');
}

/**
 * OHLCV candles, oldest first, time in Unix seconds (same shape as finnhubRest.fetchCandles).
 */
export async function fetchCandlesTwelve({ symbol, tf, from, to, apiKey }) {
  const k = (apiKey || twelveDataApiKey()).trim();
  if (!k) {
    const err = new Error('TWELVEDATA_API_KEY not configured');
    err.statusCode = 500;
    throw err;
  }
  const internal = String(symbol || '').replace(/\//g, '').toUpperCase();
  const tdSym = TO_TWELVEDATA[internal];
  if (!tdSym) {
    const err = new Error(`Unknown symbol: ${symbol}`);
    err.statusCode = 400;
    throw err;
  }
  const interval = TIMEFRAME_TO_INTERVAL[tf];
  if (!interval) {
    const err = new Error(`Invalid timeframe: ${tf}`);
    err.statusCode = 400;
    throw err;
  }

  const now = Math.floor(Date.now() / 1000);
  const defaultFrom = now - 86400 * 90;
  const fromSec = from ? Math.floor(Date.parse(from) / 1000) : defaultFrom;
  const toSec = to ? Math.floor(Date.parse(to) / 1000) : now;

  const params = new URLSearchParams({
    symbol: tdSym,
    interval,
    apikey: k,
    format: 'JSON',
    // Keep aligned with market route MAX_CHART_CANDLES (avoid huge payloads / SPA setData cost)
    outputsize: '2000',
    timezone: 'UTC',
    start_date: formatTwelveDateTime(fromSec),
    end_date: formatTwelveDateTime(toSec),
  });

  const url = `${BASE}/time_series?${params}`;
  const res = await fetch(url);
  const data = await res.json();

  if (data.status === 'error') {
    const err = new Error(data.message || `Twelve Data time_series HTTP ${res.status}`);
    err.httpStatus = res.status;
    throw err;
  }

  const values = Array.isArray(data.values) ? data.values : [];
  const out = [];
  for (const row of values) {
    if (!row || row.datetime == null) continue;
    // With timezone=UTC, values are UTC; naive strings must not be parsed as local time.
    const raw = String(row.datetime).trim();
    let iso = raw.includes('T') ? raw : raw.replace(' ', 'T');
    if (!/[zZ]|[+-]\d{2}:?\d{2}$/.test(iso)) iso += 'Z';
    const ts = Date.parse(iso);
    if (!Number.isFinite(ts)) continue;
    out.push({
      time: Math.floor(ts / 1000),
      open: parseFloat(row.open),
      high: parseFloat(row.high),
      low: parseFloat(row.low),
      close: parseFloat(row.close),
      volume: parseFloat(row.volume) || 0,
    });
  }
  out.sort((a, b) => a.time - b.time);
  return out;
}
