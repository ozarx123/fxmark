import { Router } from 'express';
import { fetchCandles } from '../services/twelveData.js';
import { getRecentLog, readLogFile } from '../services/marketDataLogger.js';
import * as cache from '../services/cache.js';
import { VALID_TIMEFRAMES } from '../config/symbolMap.js';

const router = Router();

/** Cache TTL for candles (seconds) */
const CANDLES_TTL = 30;

/** Map common tf variants to valid format (e.g. 1min -> 1m, 1D -> 1d) */
const TF_ALIASES = {
  '1min': '1m', '1minute': '1m', '1': '1m',
  '5min': '5m', '5minute': '5m', '5': '5m',
  '15min': '15m', '15minute': '15m', '15': '15m',
  '60': '1h', '60min': '1h', '1hour': '1h',
  '1day': '1d', 'd': '1d',
};

function normalizeTf(tf) {
  const raw = String(tf || '').trim().toLowerCase();
  return TF_ALIASES[raw] ?? TF_ALIASES[String(tf || '').trim()] ?? raw;
}

/**
 * GET /api/market/candles?symbol=EURUSD&tf=1m&from=&to=
 * Returns normalized OHLCV candles in UTC.
 */
router.get('/candles', async (req, res) => {
  try {
    const { symbol, tf, from, to } = req.query;
    const apiKey = process.env.TWELVE_DATA_API_KEY;

    if (!symbol || !tf) {
      return res.status(400).json({ error: 'symbol and tf are required' });
    }
    if (!apiKey) {
      return res.status(500).json({ error: 'TWELVE_DATA_API_KEY not configured' });
    }
    const normalizedTf = normalizeTf(tf);
    if (!VALID_TIMEFRAMES.includes(normalizedTf)) {
      return res.status(400).json({
        error: `Invalid tf. Use: ${VALID_TIMEFRAMES.join(', ')}`,
      });
    }

    const cacheKey = `candles:${symbol}:${normalizedTf}:${from || ''}:${to || ''}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    const candles = await fetchCandles({
      symbol,
      tf: normalizedTf,
      from: from || undefined,
      to: to || undefined,
      apiKey,
    });

    cache.set(cacheKey, candles, CANDLES_TTL);

    res.json(candles);
  } catch (err) {
    console.error('[market/candles]', err.message);
    const isQuota = /run out of API credits|quota|limit/i.test(err.message || '');
    res.status(isQuota ? 503 : 500).json({
      error: isQuota ? 'Market data API limit reached. Try again later or add TWELVE_DATA_API_KEY credits.' : err.message,
    });
  }
});

/**
 * GET /api/market/log?limit=100&symbol=EURUSD
 * Returns recent market data log entries for checking.
 */
router.get('/log', (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '100', 10) || 100, 500);
    const symbol = req.query.symbol || undefined;
    let entries = getRecentLog(limit, symbol);
    if (entries.length === 0) {
      entries = readLogFile(limit, symbol);
    }
    res.json({ count: entries.length, entries });
  } catch (err) {
    console.error('[market/log]', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
