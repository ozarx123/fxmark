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
    outputsize: '500',
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

/** Parse numeric from Twelve Data quote/candle object (multiple possible key names) */
function parseQuotePrice(data) {
  const raw = data.close ?? data.price ?? data.c ?? data.p;
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : 0;
}

/** Map Twelve Data symbol back to internal (EUR/USD -> EURUSD) */
function fromTwelveDataSymbol(twelveSymbol) {
  const map = {
    'XAU/USD': 'XAUUSD',
    'GOLD': 'XAUUSD',
    'EUR/USD': 'EURUSD',
    'GBP/USD': 'GBPUSD',
    'USD/JPY': 'USDJPY',
    'USD/CHF': 'USDCHF',
    'USD/CAD': 'USDCAD',
    'AUD/USD': 'AUDUSD',
    'NZD/USD': 'NZDUSD',
  };
  return map[twelveSymbol] ?? twelveSymbol?.replace('/', '') ?? null;
}

/**
 * Fetch quotes for multiple symbols in one API call (saves credits vs N separate calls).
 * Twelve Data free tier: 55 credits/min. Batch uses 1 credit per symbol per request.
 * @param {string[]} symbols - Internal symbols (e.g. ['EURUSD', 'XAUUSD'])
 * @param {string} apiKey - Twelve Data API key
 * @returns {Promise<Array<{symbol: string, price: number, open: number, high: number, low: number, close: number, volume: number, datetime: string}>>}
 */
export async function fetchQuotesBatch(symbols, apiKey) {
  if (!symbols?.length) return [];
  const twelveSymbols = symbols
    .map((s) => toTwelveDataSymbol(s))
    .filter(Boolean);
  if (!twelveSymbols.length) return [];

  const params = new URLSearchParams({
    symbol: twelveSymbols.join(','),
    apikey: apiKey,
  });
  const url = `${BASE_URL}/quote?${params}`;
  const res = await fetch(url);
  const data = await res.json();

  if (data.status === 'error') {
    throw new Error(data.message || 'Twelve Data API error');
  }

  const results = [];
  // Batch response: { "EUR/USD": {...}, "GBP/USD": {...} } or single { symbol, close, ... }
  let items = [];
  if (Array.isArray(data)) {
    items = data.map((q) => [q?.symbol, q]);
  } else if (data?.symbol) {
    items = [[data.symbol, data]];
  } else if (typeof data === 'object' && data !== null) {
    items = Object.entries(data)
      .filter(([k]) => !['meta', 'status', 'message'].includes(k) && typeof data[k] === 'object')
      .map(([k, v]) => [v?.symbol ?? k, v]);
  }

  for (const [sym, quote] of items) {
    const price = parseQuotePrice(quote);
    if (!sym || !Number.isFinite(price)) continue;
    const internalSymbol = fromTwelveDataSymbol(sym);
    if (!internalSymbol) continue;
    results.push({
      symbol: internalSymbol,
      price,
      open: parseFloat(quote?.open ?? quote?.o ?? 0),
      high: parseFloat(quote?.high ?? quote?.h ?? 0),
      low: parseFloat(quote?.low ?? quote?.l ?? 0),
      close: price,
      volume: parseFloat(quote?.volume ?? quote?.v ?? 0),
      datetime: quote?.datetime ?? quote?.t ?? new Date().toISOString(),
    });
  }
  return results;
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

  const symbolsToTry = [twelveSymbol];
  // Some Twelve Data plans/exchanges use "GOLD" for spot gold; try as fallback for XAU/USD
  if (symbol.toUpperCase() === 'XAUUSD' && twelveSymbol === 'XAU/USD') {
    symbolsToTry.push('GOLD');
  }

  let lastError;
  for (const trySymbol of symbolsToTry) {
    try {
      const params = new URLSearchParams({
        symbol: trySymbol,
        apikey: apiKey,
      });
      const url = `${BASE_URL}/quote?${params}`;
      const res = await fetch(url);
      const data = await res.json();

      if (data.status === 'error') {
        lastError = new Error(data.message || 'Twelve Data API error');
        continue;
      }

      const price = parseQuotePrice(data);
      if (!price) {
        lastError = new Error('No price in response');
        if (trySymbol === symbolsToTry[symbolsToTry.length - 1]) break;
        continue;
      }

      return {
        symbol,
        price,
        open: parseFloat(data.open ?? data.o ?? 0),
        high: parseFloat(data.high ?? data.h ?? 0),
        low: parseFloat(data.low ?? data.l ?? 0),
        close: price,
        volume: parseFloat(data.volume ?? data.v ?? 0),
        datetime: data.datetime ?? data.t ?? new Date().toISOString(),
      };
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error(`Quote failed for ${symbol}`);
}
