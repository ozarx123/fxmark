/**
 * In-memory tick history from the Socket.IO feed (session-scoped, browser tab).
 * Aggregates to OHLC candles for 1m / 5m / 15m / 1h / 1d using the same UTC bar boundaries as candleTime.js.
 *
 * Merged in useMarketData with REST candles: older history from API, overlapping tail from live ticks.
 */
import { getCurrentBarStart } from './candleTime.js';
import { idbLoadAllTicks, idbSaveSymbolTicks, idbDeleteSymbolTicks } from './tickFeedIdb.js';

const MAX_TICKS_PER_SYMBOL = 80000;
const MAX_AGE_MS = 86400000 * 45; // keep ~45d of ticks (trim by time first)

/** @type {Map<string, Array<{ t: number, p: number }>>} */
const ticksBySymbol = new Map();

const listeners = new Set();

/** @type {Map<string, ReturnType<typeof setTimeout>>} */
const idbPersistTimers = new Map();
const IDB_PERSIST_MS = 600;

function mergeTickArrays(a, b) {
  const combined = [...(a || []), ...(b || [])].sort((x, y) => x.t - y.t);
  const out = [];
  for (const tick of combined) {
    const prev = out[out.length - 1];
    if (prev && prev.t === tick.t && prev.p === tick.p) continue;
    out.push(tick);
  }
  return out;
}

function schedulePersistIdb(key) {
  if (typeof indexedDB === 'undefined') return;
  const prev = idbPersistTimers.get(key);
  if (prev) clearTimeout(prev);
  idbPersistTimers.set(
    key,
    setTimeout(() => {
      idbPersistTimers.delete(key);
      const arr = ticksBySymbol.get(key);
      if (!arr?.length) return;
      idbSaveSymbolTicks(key, arr);
    }, IDB_PERSIST_MS)
  );
}

let idbHydrateStarted = false;

/** Restore ticks from IndexedDB (call once at app boot). */
export async function hydrateTickFeedFromIdb() {
  if (idbHydrateStarted || typeof indexedDB === 'undefined') return;
  idbHydrateStarted = true;
  const data = await idbLoadAllTicks();
  for (const [key, ticks] of Object.entries(data)) {
    if (!Array.isArray(ticks) || ticks.length === 0) continue;
    const existing = ticksBySymbol.get(key) || [];
    ticksBySymbol.set(key, mergeTickArrays(existing, ticks));
    trimSymbol(key);
  }
  notify();
}

function toKey(symbol) {
  return String(symbol || '')
    .replace(/\//g, '')
    .toUpperCase()
    .replace(/^GOLD$/, 'XAUUSD');
}

function notify() {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch (_) {
      /* ignore */
    }
  });
}

function trimSymbol(key) {
  const arr = ticksBySymbol.get(key);
  if (!arr?.length) return;
  const cutoff = Date.now() - MAX_AGE_MS;
  let i = 0;
  while (i < arr.length && arr[i].t < cutoff) i += 1;
  if (i > 0) arr.splice(0, i);
  while (arr.length > MAX_TICKS_PER_SYMBOL) arr.shift();
}

/**
 * @param {object} tick - Socket.IO tick { symbol, close|price, providerTs?, datetime?, timestamp? }
 */
export function recordTickFromSocket(tick) {
  if (!tick || typeof tick !== 'object') return;
  const sym = tick.symbol;
  const p = tick.close ?? tick.price;
  if (!sym || !Number.isFinite(Number(p))) return;

  const key = toKey(sym);
  let tMs = Date.now();
  if (tick.providerTs != null && Number.isFinite(Number(tick.providerTs))) {
    const pt = Number(tick.providerTs);
    tMs = pt < 1e12 ? pt * 1000 : pt;
  } else if (tick.timestamp != null && Number.isFinite(Number(tick.timestamp))) {
    const ts = Number(tick.timestamp);
    tMs = ts < 1e12 ? ts * 1000 : ts;
  } else if (tick.datetime != null) {
    const d = tick.datetime;
    if (typeof d === 'number' && Number.isFinite(d)) {
      tMs = d < 1e12 ? d * 1000 : d;
    } else {
      const parsed = Date.parse(String(d));
      if (Number.isFinite(parsed)) tMs = parsed;
    }
  }

  if (!ticksBySymbol.has(key)) ticksBySymbol.set(key, []);
  const arr = ticksBySymbol.get(key);
  const last = arr[arr.length - 1];
  if (last && tMs < last.t) tMs = last.t;
  if (last && last.t === tMs && last.p === Number(p)) {
    return;
  }
  arr.push({ t: tMs, p: Number(p) });
  trimSymbol(key);
  schedulePersistIdb(key);
  notify();
}

/**
 * Aggregate sorted ticks into OHLC bars (time = bar open in Unix seconds).
 * @param {Array<{ t: number, p: number }>} sortedTicks
 * @param {string} timeframe - 1m, 5m, 15m, 1h, 1d
 */
export function aggregateTicksToOHLC(sortedTicks, timeframe) {
  if (!sortedTicks?.length) return [];
  const buckets = new Map();

  for (const { t, p } of sortedTicks) {
    if (!Number.isFinite(p)) continue;
    const barStartSec = getCurrentBarStart(timeframe, new Date(t));
    let b = buckets.get(barStartSec);
    if (!b) {
      b = { time: barStartSec, open: p, high: p, low: p, close: p, volume: 1 };
      buckets.set(barStartSec, b);
    } else {
      b.high = Math.max(b.high, p);
      b.low = Math.min(b.low, p);
      b.close = p;
      b.volume = (b.volume || 1) + 1;
    }
  }

  return Array.from(buckets.values()).sort((a, b) => a.time - b.time);
}

/**
 * OHLC from stored ticks for symbol + timeframe (newest tail may overlap REST — merge handles that).
 * @param {number} [maxBars] - cap (newest first after sort)
 */
export function getFeedCandles(symbolKey, timeframe, maxBars = 2000) {
  const key = toKey(symbolKey);
  const raw = ticksBySymbol.get(key);
  if (!raw?.length) return [];
  const sorted = [...raw].sort((a, b) => a.t - b.t);
  let bars = aggregateTicksToOHLC(sorted, timeframe);
  if (bars.length > maxBars) bars = bars.slice(-maxBars);
  return bars;
}

/**
 * REST history + live feed tail. Drops REST bars at or after the first feed bar time (same-TF alignment).
 * @param {Array<{ time: number }>} restBars
 * @param {Array<{ time: number }>} feedBars
 */
export function mergeRestCandlesWithFeed(restBars, feedBars) {
  const rest = Array.isArray(restBars) ? restBars : [];
  const feed = Array.isArray(feedBars) ? feedBars : [];
  if (!feed.length) return rest;
  if (!rest.length) return feed;

  const firstFeed = Number(feed[0].time);
  const restOlder = rest.filter((b) => Number(b.time) < firstFeed);
  const last = restOlder[restOlder.length - 1];
  if (last && Number(last.time) === firstFeed) restOlder.pop();
  return [...restOlder, ...feed];
}

export function subscribeFeedStorage(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Dev / tests */
export function clearFeedStorageForSymbol(symbolKey) {
  const key = toKey(symbolKey);
  ticksBySymbol.delete(key);
  idbDeleteSymbolTicks(key);
  notify();
}

export function getFeedTickCount(symbolKey) {
  return ticksBySymbol.get(toKey(symbolKey))?.length ?? 0;
}
