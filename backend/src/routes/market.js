import { Router } from 'express';
import { fetchCandles } from '../services/twelveData.js';
import { getRecentLog, readLogFile } from '../services/marketDataLogger.js';
import * as cache from '../services/cache.js';
import { VALID_TIMEFRAMES } from '../config/symbolMap.js';
import { getCurrentBarStart } from '../config/candleTime.js';

const router = Router();

/** Cache TTL by timeframe (seconds) — longer for higher TFs since bars change less often */
const CANDLES_TTL_BY_TF = {
  '1m': 30,
  '5m': 60,
  '15m': 120,
  '1h': 300,
  '1d': 600,
};
/** Historical range (from+to in the past) is immutable: cache 24h */
const CANDLES_TTL_HISTORICAL = 86400;
/** Stale-while-revalidate: serve this long after main TTL while revalidating in background */
const CANDLES_STALE_TTL = 300;

/** Map common tf variants to valid format (e.g. 1min -> 1m, 1D -> 1d) */
const TF_ALIASES = {
  '1min': '1m', '1minute': '1m', '1': '1m',
  '5min': '5m', '5minute': '5m', '5': '5m',
  '15min': '15m', '15minute': '15m', '15': '15m',
  '60': '1h', '60min': '1h', '1hour': '1h',
  '1day': '1d', 'd': '1d',
};

function normalizeTf(tf) {
  let raw = String(tf || '').trim().toLowerCase();
  // Strip TradingView-style suffix (e.g. 1m:1 -> 1m)
  if (raw.includes(':')) raw = raw.split(':')[0];
  return TF_ALIASES[raw] ?? TF_ALIASES[String(tf || '').trim()] ?? raw;
}

/**
 * TTL for candle cache: longer for higher timeframes; 24h for historical ranges.
 * @param {string} normalizedTf - 1m, 5m, 15m, 1h, 1d
 * @param {string} [from] - ISO start
 * @param {string} [to] - ISO end
 */
function getCandleCacheTTL(normalizedTf, from, to) {
  if (from && to) {
    const endMs = Date.parse(to);
    if (Number.isFinite(endMs)) {
      const barStart = getCurrentBarStart(normalizedTf, new Date());
      const barStartMs = barStart * 1000;
      if (endMs < barStartMs) return CANDLES_TTL_HISTORICAL;
    }
  }
  return CANDLES_TTL_BY_TF[normalizedTf] ?? 60;
}

/**
 * GET /api/market/candles?symbol=EURUSD&tf=1m&from=&to=
 * Returns normalized OHLCV candles in UTC.
 */
router.get('/candles', async (req, res) => {
  try {
    const { symbol, tf, from, to } = req.query;
    const apiKey = (process.env.TWELVE_DATA_API_KEY || '').trim();

    if (!symbol || !tf) {
      return res.status(400).json({ error: 'symbol and tf are required' });
    }
    if (!apiKey) {
      return res.status(500).json({
        error: 'TWELVE_DATA_API_KEY not configured',
        hint: 'Ensure twelve-data-api-key exists in GCP Secret Manager and the Cloud Run service account has roles/secretmanager.secretAccessor',
      });
    }
    const normalizedTf = normalizeTf(tf);
    if (!VALID_TIMEFRAMES.includes(normalizedTf)) {
      return res.status(400).json({
        error: `Invalid tf. Use: ${VALID_TIMEFRAMES.join(', ')}`,
      });
    }

    // Normalize symbol to internal format (EUR/USD -> EURUSD) for lookup
    const internalSymbol = String(symbol || '').replace(/\//g, '').toUpperCase();

    const cacheKey = `candles:${internalSymbol}:${normalizedTf}:${from || ''}:${to || ''}`;
    const ttl = getCandleCacheTTL(normalizedTf, from, to);
    const useStaleKey = ttl < CANDLES_TTL_HISTORICAL;

    let cached = null;
    let staleCached = null;
    if (useStaleKey) {
      const [main, stale] = await cache.getMany([cacheKey, `${cacheKey}:swr`]);
      cached = main;
      staleCached = stale;
    } else {
      cached = await cache.get(cacheKey);
    }

    if (cached) {
      return res.json(cached);
    }
    if (staleCached) {
      setImmediate(() => {
        fetchCandles({
          symbol: internalSymbol,
          tf: normalizedTf,
          from: from || undefined,
          to: to || undefined,
          apiKey,
        })
          .then((fresh) => Promise.all([
            cache.set(cacheKey, fresh, ttl),
            cache.set(`${cacheKey}:swr`, fresh, CANDLES_STALE_TTL),
          ]))
          .catch(() => {});
      });
      return res.json(staleCached);
    }

    const candles = await fetchCandles({
      symbol: internalSymbol,
      tf: normalizedTf,
      from: from || undefined,
      to: to || undefined,
      apiKey,
    });

    if (useStaleKey) {
      await Promise.all([
        cache.set(cacheKey, candles, ttl),
        cache.set(`${cacheKey}:swr`, candles, CANDLES_STALE_TTL),
      ]);
    } else {
      await cache.set(cacheKey, candles, ttl);
    }

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
