import fetch from 'node-fetch';
import { toTwelveDataSymbol, TIMEFRAME_TO_INTERVAL } from '../config/symbolMap.js';

const BASE_URL = 'https://api.twelvedata.com';

/**
 * Fetch candles from Twelve Data API and normalize to {time, open, high, low, close, volume}
 * @param {Object} opts
 * @param {string} opts.symbol - Internal symbol (e.g. EURUSD, XAUUSD)
 * @param {string} opts.tf - Timeframe: 1m, 5m, 15m, 1h, 1d
 * @param {string} [opts.from] - Start date ISO string (UTC)
 * @param {string} [opts.to] - End date ISO string (UTC)
 * @param {string} opts.apiKey - Twelve Data API key
 * @returns {Promise<Array<{time: string, open: number, high: number, low: number, close: number, volume: number}>>}
 */
export async function fetchCandles({ symbol, tf, from, to, apiKey }) {
  const twelveSymbol = toTwelveDataSymbol(symbol);
  if (!twelveSymbol) {
    throw new Error(`Unknown symbol: ${symbol}`);
  }

  const interval = TIMEFRAME_TO_INTERVAL[tf];
  if (!interval) {
    throw new Error(`Invalid timeframe: ${tf}. Use: 1m, 5m, 15m, 1h, 1d`);
  }

  const params = new URLSearchParams({
    symbol: twelveSymbol,
    interval,
    apikey: apiKey,
    timezone: 'UTC',
    outputsize: '5000',
  });

  if (from) params.set('start_date', from);
  if (to) params.set('end_date', to);

  const url = `${BASE_URL}/time_series?${params}`;
  const res = await fetch(url);
  const data = await res.json();

  if (data.status === 'error') {
    throw new Error(data.message || 'Twelve Data API error');
  }

  const values = data.values ?? [];
  // Twelve Data returns newest first; Lightweight Charts requires oldest first (ascending)
  const mapped = values.map((v) => {
    const dt = v.datetime;
    let timeSec = 0;
    if (dt) {
      const iso = dt.includes('T') ? dt : dt.replace(' ', 'T') + (dt.includes('Z') ? '' : 'Z');
      timeSec = Math.floor(new Date(iso).getTime() / 1000);
    }
    return {
      time: timeSec,
      open: parseFloat(v.open),
      high: parseFloat(v.high),
      low: parseFloat(v.low),
      close: parseFloat(v.close),
      volume: parseFloat(v.volume || 0),
    };
  });
  return mapped.reverse();
}

/**
 * Fetch real-time quote from Twelve Data API
 * @param {string} symbol - Internal symbol (e.g. EURUSD, XAUUSD)
 * @param {string} apiKey - Twelve Data API key
 * @returns {Promise<{symbol: string, price: number, open: number, high: number, low: number, close: number, volume: number, datetime: string}>}
 */
export async function fetchQuote(symbol, apiKey) {
  const twelveSymbol = toTwelveDataSymbol(symbol);
  if (!twelveSymbol) {
    throw new Error(`Unknown symbol: ${symbol}`);
  }

  const params = new URLSearchParams({
    symbol: twelveSymbol,
    apikey: apiKey,
  });

  const url = `${BASE_URL}/quote?${params}`;
  const res = await fetch(url);
  const data = await res.json();

  if (data.status === 'error') {
    throw new Error(data.message || 'Twelve Data API error');
  }

  return {
    symbol,
    price: parseFloat(data.close ?? data.price ?? 0),
    open: parseFloat(data.open ?? 0),
    high: parseFloat(data.high ?? 0),
    low: parseFloat(data.low ?? 0),
    close: parseFloat(data.close ?? 0),
    volume: parseFloat(data.volume ?? 0),
    datetime: data.datetime ?? new Date().toISOString(),
  };
}
