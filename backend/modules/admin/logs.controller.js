/**
 * Admin Logs Controller
 *
 * Unified log viewer for all backend log sources:
 *   feed    — Twelve Data API ticks, errors, latency (twelveDataFeedLogger)
 *   market  — Raw market tick log (marketDataLogger)
 *
 * All endpoints require admin/superadmin role (enforced in admin.routes.js).
 */

import {
  getRecentFeedLog,
  readFeedLogFile,
  getFeedLogSummary,
} from '../../src/services/twelveDataFeedLogger.js';

import {
  getRecentLog,
  readLogFile,
} from '../../src/services/marketDataLogger.js';

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_DIR = path.join(__dirname, '../../logs');

// ── helpers ──────────────────────────────────────────────────────────────────

function parseLimit(val, max = 500) {
  const n = parseInt(val || '100', 10);
  return Math.min(isNaN(n) || n < 1 ? 100 : n, max);
}

/** Filter entries by ISO date range (ts field) */
function filterByDateRange(entries, from, to) {
  if (!from && !to) return entries;
  const fromMs = from ? Date.parse(from) : 0;
  const toMs   = to   ? Date.parse(to)   : Infinity;
  return entries.filter((e) => {
    const t = Date.parse(e.ts);
    return t >= fromMs && t <= toMs;
  });
}

/** List all log files in the logs directory */
function listLogFiles() {
  if (!fs.existsSync(LOG_DIR)) return [];
  return fs.readdirSync(LOG_DIR)
    .filter((f) => f.endsWith('.log'))
    .map((f) => {
      const fp = path.join(LOG_DIR, f);
      const stat = fs.statSync(fp);
      return { name: f, sizeBytes: stat.size, modified: stat.mtime.toISOString() };
    })
    .sort((a, b) => b.modified.localeCompare(a.modified));
}

// ── controllers ───────────────────────────────────────────────────────────────

/**
 * GET /api/admin/logs
 * Unified log query across all sources.
 *
 * Query params:
 *   source  - 'feed' | 'market' (default: 'feed')
 *   limit   - max entries (default 100, max 500)
 *   symbol  - filter by symbol e.g. XAUUSD
 *   event   - filter by event type (feed source only): tick|error|candles|poller_start
 *   from    - ISO start datetime  e.g. 2026-03-12T00:00:00Z
 *   to      - ISO end datetime
 */
export async function getLogs(req, res) {
  try {
    const { source = 'feed', symbol, event, from, to } = req.query;
    const limit = parseLimit(req.query.limit);

    let entries = [];

    if (source === 'feed') {
      entries = getRecentFeedLog(limit * 2, symbol, event);
      if (entries.length === 0) entries = readFeedLogFile(limit * 2, symbol);
    } else if (source === 'market') {
      entries = getRecentLog(limit * 2, symbol);
      if (entries.length === 0) entries = readLogFile(limit * 2, symbol);
    } else {
      return res.status(400).json({
        error: `Unknown source "${source}". Use: feed, market`,
      });
    }

    entries = filterByDateRange(entries, from, to).slice(0, limit);

    res.json({
      source,
      count: entries.length,
      filters: { symbol: symbol || null, event: event || null, from: from || null, to: to || null },
      entries,
    });
  } catch (err) {
    console.error('[admin/logs]', err.message);
    res.status(500).json({ error: err.message });
  }
}

/**
 * GET /api/admin/logs/summary
 * Aggregated stats for all log sources in one response.
 */
export async function getLogsSummary(req, res) {
  try {
    const feedSummary = getFeedLogSummary();

    // Market log quick stats
    const marketEntries = getRecentLog(200);
    const marketBySymbol = {};
    for (const e of marketEntries) {
      const s = e.symbol || 'unknown';
      marketBySymbol[s] = (marketBySymbol[s] || 0) + 1;
    }

    res.json({
      feed: feedSummary,
      market: {
        totalInMemory: marketEntries.length,
        bySymbol: marketBySymbol,
        lastEntry: marketEntries[0] ?? null,
      },
      logFiles: listLogFiles(),
      serverTime: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[admin/logs/summary]', err.message);
    res.status(500).json({ error: err.message });
  }
}

/**
 * GET /api/admin/logs/files
 * List available log files with size and last-modified.
 */
export async function getLogFiles(req, res) {
  try {
    res.json({ logDir: LOG_DIR, files: listLogFiles() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/**
 * GET /api/admin/logs/download?file=twelvedata-feed.log
 * Download a raw log file (admin only).
 * Only files inside the logs/ directory are accessible (path traversal guard).
 */
export async function downloadLogFile(req, res) {
  try {
    const filename = path.basename(req.query.file || '');
    if (!filename || !filename.endsWith('.log')) {
      return res.status(400).json({ error: 'Invalid file name. Must end in .log' });
    }
    const filePath = path.join(LOG_DIR, filename);
    // Path traversal guard
    if (!filePath.startsWith(LOG_DIR)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: `File not found: ${filename}` });
    }
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    console.error('[admin/logs/download]', err.message);
    res.status(500).json({ error: err.message });
  }
}
