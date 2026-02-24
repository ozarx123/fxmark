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
