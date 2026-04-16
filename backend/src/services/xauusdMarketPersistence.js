/**
 * Persist XAUUSD ticks + derived OHLC bars to MongoDB (internal datafeed / ML).
 * Invoked from broadcastTick after sanity filters, before client throttling (every accepted tick).
 */
import { getCurrentBarStart } from '../config/candleTime.js';
import * as repo from '../../modules/market/market-history.repository.js';

const PERSIST =
  process.env.XAUUSD_PERSIST_TICKS === 'true' || process.env.XAUUSD_PERSIST_TICKS === '1';
const PERSIST_OHLC =
  process.env.XAUUSD_PERSIST_OHLC !== 'false' && process.env.XAUUSD_PERSIST_OHLC !== '0';

const BATCH_MS = Math.max(50, parseInt(process.env.XAUUSD_TICK_BATCH_MS || '250', 10) || 250);
const BATCH_SIZE = Math.max(1, parseInt(process.env.XAUUSD_TICK_BATCH_SIZE || '80', 10) || 80);

const OHLC_TFS = String(process.env.XAUUSD_OHLC_TFS || '1m,5m,15m,1h,1d')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const CANONICAL = 'XAUUSD';

/** @type {Array<object>} */
let tickBuffer = [];
/** @type {ReturnType<typeof setTimeout> | null} */
let tickFlushTimer = null;

/** @type {Map<string, { barStart: number, open: number, high: number, low: number, close: number, vol: number }>} */
const barState = new Map();

function getTickTimestampMs(rawTick) {
  if (rawTick.providerTs != null && Number.isFinite(Number(rawTick.providerTs))) {
    const t = Number(rawTick.providerTs);
    return t < 1e12 ? t * 1000 : t;
  }
  if (rawTick.timestamp != null && Number.isFinite(Number(rawTick.timestamp))) {
    const t = Number(rawTick.timestamp);
    return t < 1e12 ? t * 1000 : t;
  }
  return Date.now();
}

function normalizeToXauusd(symbol) {
  const s = String(symbol || '')
    .replace(/\//g, '')
    .toUpperCase();
  if (s === 'GOLD' || s === 'XAUUSD') return CANONICAL;
  if (s.includes('XAU') && s.includes('USD')) return CANONICAL;
  return null;
}

function flushTickBuffer() {
  tickFlushTimer = null;
  if (tickBuffer.length === 0) return;
  const batch = tickBuffer;
  tickBuffer = [];
  repo.insertTicksMany(batch).catch((e) => console.warn('[xauusd-persist] tick insert:', e.message));
}

function queueTickDoc(doc) {
  tickBuffer.push(doc);
  if (tickBuffer.length >= BATCH_SIZE) {
    if (tickFlushTimer) {
      clearTimeout(tickFlushTimer);
      tickFlushTimer = null;
    }
    flushTickBuffer();
  } else if (!tickFlushTimer) {
    tickFlushTimer = setTimeout(flushTickBuffer, BATCH_MS);
  }
}

function finalizeBar(tf, state) {
  if (!state || state.vol < 1) return;
  repo
    .insertOhlcBar({
      symbol: CANONICAL,
      tf,
      time: state.barStart,
      open: state.open,
      high: state.high,
      low: state.low,
      close: state.close,
      volume: state.vol,
    })
    .catch((e) => console.warn('[xauusd-persist] bar insert:', e.message));
}

function onOhlcTick(tsMs, price) {
  if (!PERSIST_OHLC || OHLC_TFS.length === 0) return;
  for (const tf of OHLC_TFS) {
    const barStart = getCurrentBarStart(tf, new Date(tsMs));
    const prev = barState.get(tf);
    if (prev && prev.barStart !== barStart) {
      finalizeBar(tf, prev);
      barState.delete(tf);
    }
    const cur = barState.get(tf);
    if (!cur || cur.barStart !== barStart) {
      barState.set(tf, {
        barStart,
        open: price,
        high: price,
        low: price,
        close: price,
        vol: 1,
      });
    } else {
      cur.high = Math.max(cur.high, price);
      cur.low = Math.min(cur.low, price);
      cur.close = price;
      cur.vol += 1;
    }
  }
}

/**
 * @param {object} data - normalized tick from websocket (symbol, price, open, high, low, ...)
 * @param {object} rawTick - original tick (for providerTs / timestamp)
 */
export function maybePersistXauusdTick(data, rawTick) {
  if (!PERSIST) return;
  const sym = normalizeToXauusd(data.symbol);
  if (!sym) return;

  const tsMs = getTickTimestampMs(rawTick);
  const price = Number(data.price ?? data.close);
  if (!Number.isFinite(price)) return;

  queueTickDoc({
    symbol: sym,
    ts: new Date(tsMs),
    price,
    quote: {
      open: Number(data.open),
      high: Number(data.high),
      low: Number(data.low),
      close: Number(data.close),
      volume: Number(data.volume) || 0,
    },
    source: String(data.source || 'unknown'),
  });

  onOhlcTick(tsMs, price);
}

function flushOpenBars() {
  for (const [tf, st] of barState) {
    finalizeBar(tf, st);
  }
  barState.clear();
}

if (PERSIST) {
  process.once('SIGTERM', () => {
    flushOpenBars();
    flushTickBuffer();
  });
  process.once('SIGINT', () => {
    flushOpenBars();
    flushTickBuffer();
  });
}
