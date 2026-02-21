import { Router } from 'express';
import { fetchCandles } from '../services/twelveData.js';
import * as cache from '../services/cache.js';
import { VALID_TIMEFRAMES } from '../config/symbolMap.js';

const router = Router();

/** Cache TTL for candles (seconds) */
const CANDLES_TTL = 30;

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
    if (!VALID_TIMEFRAMES.includes(tf)) {
      return res.status(400).json({
        error: `Invalid tf. Use: ${VALID_TIMEFRAMES.join(', ')}`,
      });
    }

    const cacheKey = `candles:${symbol}:${tf}:${from || ''}:${to || ''}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    const candles = await fetchCandles({
      symbol,
      tf,
      from: from || undefined,
      to: to || undefined,
      apiKey,
    });

    cache.set(cacheKey, candles, CANDLES_TTL);

    res.json(candles);
  } catch (err) {
    console.error('[market/candles]', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
