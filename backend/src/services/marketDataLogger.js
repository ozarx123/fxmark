import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Log file path (backend/logs/market-data.log) */
const LOG_DIR = path.join(__dirname, '../../logs');
const LOG_FILE = path.join(LOG_DIR, 'market-data.log');

/** Max entries to keep in memory for API; max lines per file before rotation */
const MAX_IN_MEMORY = 500;
const MAX_LINES_PER_FILE = 10000;

const enabled = process.env.MARKET_DATA_LOG !== 'false';
const inMemoryLog = [];

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

/**
 * Append a tick/quote to the market data log.
 * @param {Object} tick - { symbol, price, open, high, low, close, volume, datetime }
 * @param {string} [source] - e.g. 'quote', 'candle'
 */
export function logMarketTick(tick, source = 'quote') {
  if (!enabled || !tick) return;
  ensureLogDir();
  const entry = {
    ts: new Date().toISOString(),
    source,
    symbol: tick.symbol,
    price: tick.price ?? tick.close,
    open: tick.open,
    high: tick.high,
    low: tick.low,
    close: tick.close,
    volume: tick.volume,
    datetime: tick.datetime,
  };
  const line = JSON.stringify(entry) + '\n';
  inMemoryLog.push(entry);
  if (inMemoryLog.length > MAX_IN_MEMORY) {
    inMemoryLog.shift();
  }
  try {
    fs.appendFileSync(LOG_FILE, line);
  } catch (err) {
    console.error('[marketDataLogger]', err.message);
  }
}

/**
 * Get recent market data log entries (from memory).
 * @param {number} [limit=100]
 * @param {string} [symbol] - filter by symbol
 */
export function getRecentLog(limit = 100, symbol) {
  let entries = [...inMemoryLog].reverse();
  if (symbol) {
    const s = String(symbol).toUpperCase().replace(/\//g, '');
    entries = entries.filter((e) => e.symbol === s);
  }
  return entries.slice(0, limit);
}

/**
 * Read log file (last N lines). Use when in-memory is empty.
 */
export function readLogFile(limit = 100, symbol) {
  if (!fs.existsSync(LOG_FILE)) return [];
  try {
    const content = fs.readFileSync(LOG_FILE, 'utf8');
    const lines = content.trim().split('\n').filter(Boolean);
    let entries = lines.map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    }).filter(Boolean);
    if (symbol) {
      const s = String(symbol).toUpperCase().replace(/\//g, '');
      entries = entries.filter((e) => e.symbol === s);
    }
    return entries.slice(-limit);
  } catch (err) {
    console.error('[marketDataLogger] readLogFile:', err.message);
    return [];
  }
}

// ── Provider feed log (Finnhub ticks / poller / errors) — replaces twelvedata-feed.log ─────

const FEED_LOG_FILE = path.join(LOG_DIR, 'market-feed.log');
const MAX_FEED_MEMORY = 500;
const feedEnabled = process.env.MARKET_FEED_LOG !== 'false';
const feedEntries = [];

function ensureFeedDir() {
  ensureLogDir();
}

function appendFeedFile(entry) {
  if (!feedEnabled) return;
  try {
    if (fs.existsSync(FEED_LOG_FILE)) {
      const stats = fs.statSync(FEED_LOG_FILE);
      if (stats.size > 4 * 1024 * 1024) {
        const rotated = FEED_LOG_FILE.replace('.log', `.${Date.now()}.log`);
        fs.renameSync(FEED_LOG_FILE, rotated);
      }
    }
    fs.appendFileSync(FEED_LOG_FILE, JSON.stringify(entry) + '\n');
  } catch (err) {
    console.error('[marketFeedLog] write error:', err.message);
  }
}

function pushFeed(entry) {
  if (!feedEnabled) return;
  feedEntries.push(entry);
  if (feedEntries.length > MAX_FEED_MEMORY) feedEntries.shift();
  appendFeedFile(entry);
}

export function logFeedTick({ symbol, price, providerTs, latencyMs, status = 200 }) {
  pushFeed({
    ts: new Date().toISOString(),
    event: 'tick',
    endpoint: '/quote',
    symbol: String(symbol ?? '').toUpperCase(),
    price: Number(price) || null,
    providerTs: providerTs ?? null,
    latencyMs: Math.round(latencyMs ?? 0),
    status,
    creditsUsed: 0,
  });
}

export function logFeedError({ symbol, endpoint, error, latencyMs, status }) {
  pushFeed({
    ts: new Date().toISOString(),
    event: 'error',
    endpoint: endpoint ?? '/quote',
    symbol: String(symbol ?? '').toUpperCase(),
    error: String(error ?? 'unknown'),
    latencyMs: latencyMs != null ? Math.round(latencyMs) : null,
    status: status ?? null,
    creditsUsed: 0,
  });
  const http = status != null ? ` HTTP ${status}` : '';
  const hint =
    status === 429 || /rate|limit|429/i.test(String(error))
      ? ' (Finnhub rate limit: widen QUOTE_POLL_INTERVAL_MS or upgrade plan)'
      : '';
  console.error(`[market-feed] ${endpoint ?? '/quote'} ${symbol} → ${error}${http}${hint}`);
}

export function logFeedEvent(event, detail = {}) {
  pushFeed({
    ts: new Date().toISOString(),
    event,
    ...detail,
    creditsUsed: 0,
  });
  console.log(`[market-feed] ${event}`, Object.keys(detail).length ? detail : '');
}

export function getRecentFeedLog(limit = 100, symbol, event) {
  let result = [...feedEntries].reverse();
  if (symbol) {
    const s = String(symbol).toUpperCase().replace(/\//g, '');
    result = result.filter((e) => String(e.symbol || '').replace(/\//g, '').toUpperCase().includes(s));
  }
  if (event) {
    result = result.filter((e) => e.event === event);
  }
  return result.slice(0, limit);
}

export function readFeedLogFile(limit = 100, symbol) {
  if (!fs.existsSync(FEED_LOG_FILE)) return [];
  try {
    let parsed = fs
      .readFileSync(FEED_LOG_FILE, 'utf8')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((l) => {
        try {
          return JSON.parse(l);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
    if (symbol) {
      const s = String(symbol).toUpperCase().replace(/\//g, '');
      parsed = parsed.filter((e) => String(e.symbol || '').replace(/\//g, '').toUpperCase().includes(s));
    }
    return parsed.slice(-limit);
  } catch (err) {
    console.error('[marketFeedLog] readFile error:', err.message);
    return [];
  }
}

export function getFeedLogSummary() {
  const recent = feedEntries.slice(-200);
  const ticks = recent.filter((e) => e.event === 'tick');
  const errors = recent.filter((e) => e.event === 'error');
  const avgLatency = ticks.length
    ? Math.round(ticks.reduce((s, e) => s + (e.latencyMs ?? 0), 0) / ticks.length)
    : null;
  return {
    totalInMemory: feedEntries.length,
    recentTicks: ticks.length,
    recentErrors: errors.length,
    avgLatencyMs: avgLatency,
    creditsThisMin: 0,
    lastTick: ticks[ticks.length - 1] ?? null,
    lastError: errors[errors.length - 1] ?? null,
    logFile: FEED_LOG_FILE,
  };
}
