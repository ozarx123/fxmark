/**
 * Twelve Data Feed Logger
 *
 * Records every outgoing API request and its result to:
 *   backend/logs/twelvedata-feed.log   (NDJSON, one entry per line)
 *
 * Each log entry contains:
 *   ts           - server time of the event (ISO)
 *   event        - 'request' | 'tick' | 'error' | 'poller_start' | 'poller_stop'
 *   symbol       - symbol requested (or list for batch)
 *   tf           - timeframe (candle requests only)
 *   endpoint     - '/quote' | '/time_series'
 *   latencyMs    - round-trip time from fetch start to JSON parsed
 *   price        - close price returned (quote requests)
 *   providerTs   - datetime field from Twelve Data response
 *   barsReturned - number of candles (time_series requests)
 *   status       - HTTP status code
 *   error        - error message (event=error only)
 *   creditsUsed  - running estimate of credits consumed this minute
 *
 * Access via REST:
 *   GET /api/market/feed-log?limit=100&symbol=XAUUSD
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_DIR  = path.join(__dirname, '../../logs');
const LOG_FILE = path.join(LOG_DIR, 'twelvedata-feed.log');

const MAX_IN_MEMORY  = 500;
const MAX_FILE_LINES = 20000;

const enabled = process.env.TWELVEDATA_FEED_LOG !== 'false';

/** In-memory ring-buffer for fast API access */
const entries = [];

/** Rolling credit counter — resets every 60 s */
let creditCount = 0;
let creditWindowStart = Date.now();

function resetCreditWindowIfNeeded() {
  const now = Date.now();
  if (now - creditWindowStart >= 60000) {
    creditWindowStart = now;
    creditCount = 0;
  }
}

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
}

function appendToFile(entry) {
  ensureLogDir();
  try {
    // Rotate: if file is large, rename it and start fresh
    if (fs.existsSync(LOG_FILE)) {
      const stats = fs.statSync(LOG_FILE);
      // ~200 bytes per line × 20 000 lines ≈ 4 MB
      if (stats.size > 4 * 1024 * 1024) {
        const rotated = LOG_FILE.replace('.log', `.${Date.now()}.log`);
        fs.renameSync(LOG_FILE, rotated);
      }
    }
    fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n');
  } catch (err) {
    console.error('[twelveDataFeedLogger] write error:', err.message);
  }
}

function push(entry) {
  if (!enabled) return;
  entries.push(entry);
  if (entries.length > MAX_IN_MEMORY) entries.shift();
  appendToFile(entry);
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Log a successful quote tick received from Twelve Data.
 * Call this after fetchQuotesBatch() resolves.
 */
export function logFeedTick({ symbol, price, providerTs, latencyMs, status = 200 }) {
  resetCreditWindowIfNeeded();
  creditCount++;
  push({
    ts: new Date().toISOString(),
    event: 'tick',
    endpoint: '/quote',
    symbol: String(symbol ?? '').toUpperCase(),
    price: Number(price) || null,
    providerTs: providerTs ?? null,
    latencyMs: Math.round(latencyMs ?? 0),
    status,
    creditsUsed: creditCount,
  });
}

/**
 * Log a successful candle fetch from Twelve Data.
 * Call this after fetchCandles() resolves.
 */
export function logFeedCandles({ symbol, tf, barsReturned, latencyMs, status = 200 }) {
  resetCreditWindowIfNeeded();
  creditCount += barsReturned > 0 ? 1 : 0;
  push({
    ts: new Date().toISOString(),
    event: 'candles',
    endpoint: '/time_series',
    symbol: String(symbol ?? '').toUpperCase(),
    tf: tf ?? null,
    barsReturned: barsReturned ?? 0,
    latencyMs: Math.round(latencyMs ?? 0),
    status,
    creditsUsed: creditCount,
  });
}

/**
 * Log a Twelve Data API error (network failure, quota exceeded, bad symbol, etc.)
 */
export function logFeedError({ symbol, endpoint, error, latencyMs, status }) {
  push({
    ts: new Date().toISOString(),
    event: 'error',
    endpoint: endpoint ?? '/quote',
    symbol: String(symbol ?? '').toUpperCase(),
    error: String(error ?? 'unknown'),
    latencyMs: latencyMs != null ? Math.round(latencyMs) : null,
    status: status ?? null,
    creditsUsed: creditCount,
  });
  // Always print errors to console even if log is disabled
  console.error(`[twelvedata] ${endpoint ?? '/quote'} ${symbol} → ${error}`);
}

/**
 * Log a poller lifecycle event (start, stop, consecutive failures).
 */
export function logFeedEvent(event, detail = {}) {
  push({
    ts: new Date().toISOString(),
    event,
    ...detail,
    creditsUsed: creditCount,
  });
  console.log(`[twelvedata] ${event}`, Object.keys(detail).length ? detail : '');
}

// ── Query helpers ─────────────────────────────────────────────────────────────

/**
 * Return recent entries from memory (fast, no disk read).
 * @param {number} limit
 * @param {string} [symbol]
 * @param {string} [event]  filter by event type
 */
export function getRecentFeedLog(limit = 100, symbol, event) {
  let result = [...entries].reverse();
  if (symbol) {
    const s = String(symbol).toUpperCase().replace(/\//g, '');
    result = result.filter((e) => e.symbol === s);
  }
  if (event) {
    result = result.filter((e) => e.event === event);
  }
  return result.slice(0, limit);
}

/**
 * Read log file from disk (fallback when in-memory ring-buffer is empty).
 * @param {number} limit
 * @param {string} [symbol]
 */
export function readFeedLogFile(limit = 100, symbol) {
  if (!fs.existsSync(LOG_FILE)) return [];
  try {
    const raw = fs.readFileSync(LOG_FILE, 'utf8');
    let parsed = raw
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((l) => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean);
    if (symbol) {
      const s = String(symbol).toUpperCase().replace(/\//g, '');
      parsed = parsed.filter((e) => e.symbol === s);
    }
    return parsed.slice(-limit);
  } catch (err) {
    console.error('[twelveDataFeedLogger] readFile error:', err.message);
    return [];
  }
}

/**
 * Return a summary: total ticks, errors, avg latency, credits/min estimate.
 */
export function getFeedLogSummary() {
  const recent = entries.slice(-200);
  const ticks  = recent.filter((e) => e.event === 'tick');
  const errors = recent.filter((e) => e.event === 'error');
  const avgLatency = ticks.length
    ? Math.round(ticks.reduce((s, e) => s + (e.latencyMs ?? 0), 0) / ticks.length)
    : null;
  return {
    totalInMemory:  entries.length,
    recentTicks:    ticks.length,
    recentErrors:   errors.length,
    avgLatencyMs:   avgLatency,
    creditsThisMin: creditCount,
    lastTick:       ticks[ticks.length - 1] ?? null,
    lastError:      errors[errors.length - 1] ?? null,
    logFile:        LOG_FILE,
  };
}
