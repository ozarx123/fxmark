import { Router } from 'express';
import { fetchCandles, fetchQuotesBatch } from '../services/finnhubRest.js';
import { fetchCandlesTwelve, twelveDataApiKey } from '../services/twelveDataRest.js';
import { rsiLast, macdTripleLast } from '../lib/taFromBars.js';
import {
  getRecentLog,
  readLogFile,
  getRecentFeedLog,
  readFeedLogFile,
  getFeedLogSummary,
} from '../services/marketDataLogger.js';
import * as cache from '../services/cache.js';
import { VALID_TIMEFRAMES } from '../config/symbolMap.js';
import { getCurrentBarStart } from '../config/candleTime.js';
import { findOhlcBars } from '../../modules/market/market-history.repository.js';

const router = Router();

const XAUUSD_HISTORY_FROM_DB =
  process.env.XAUUSD_HISTORY_FROM_DB === 'true' || process.env.XAUUSD_HISTORY_FROM_DB === '1';

const FINNHUB_KEY = () => (process.env.FINNHUB_API_KEY || '').trim();

/** Finnhub first; on failure use Twelve Data when TWELVEDATA_API_KEY is set. Twelve-only works without Finnhub. */
async function fetchCandlesWithFallback({ symbol, tf, from, to }) {
  const finnhubKey = FINNHUB_KEY();
  const twelveKey = twelveDataApiKey();
  if (finnhubKey) {
    try {
      return await fetchCandles({ symbol, tf, from, to, apiKey: finnhubKey });
    } catch (e) {
      console.warn('[market/candles] Finnhub failed, trying Twelve Data:', e.message);
      if (twelveKey) {
        return await fetchCandlesTwelve({ symbol, tf, from, to, apiKey: twelveKey });
      }
      throw e;
    }
  }
  if (twelveKey) {
    return await fetchCandlesTwelve({ symbol, tf, from, to, apiKey: twelveKey });
  }
  const err = new Error('No market data API key: set FINNHUB_API_KEY or TWELVEDATA_API_KEY');
  err.statusCode = 500;
  throw err;
}

/** Map /technical interval query to internal tf */
const INTERVAL_TO_TF = {
  '1day': '1d',
  '1d': '1d',
  '1h': '1h',
  '60': '1h',
  '15m': '15m',
  '15min': '15m',
  '5m': '5m',
  '5min': '5m',
  '1m': '1m',
  '1min': '1m',
};

function intervalToTf(interval) {
  const raw = String(interval || '1day').toLowerCase().replace(/^1d$/i, '1day');
  return INTERVAL_TO_TF[raw] || '1d';
}

/** Cache TTL by timeframe (seconds) — longer for higher TFs since bars change less often */
const CANDLES_TTL_BY_TF = {
  '1m': 10,
  '5m': 60,
  '15m': 120,
  '1h': 300,
  '1d': 600,
};
const CANDLES_TTL_HISTORICAL = 86400;
const CANDLES_STALE_TTL = 300;

/** Max bars returned for GET /candles (chart + mobile); keeps payloads small and avoids 5k+ setData in the SPA. */
const MAX_CHART_CANDLES = Math.min(
  5000,
  Math.max(200, parseInt(process.env.MAX_CHART_CANDLES || '1500', 10) || 1500)
);

function parseQueryRangeToSec(fromIso, toIso) {
  let fromSec;
  let toSec;
  if (fromIso) {
    const t = Date.parse(String(fromIso));
    if (Number.isFinite(t)) fromSec = Math.floor(t / 1000);
  }
  if (toIso) {
    const t = Date.parse(String(toIso));
    if (Number.isFinite(t)) toSec = Math.floor(t / 1000);
  }
  return { fromSec, toSec };
}

async function loadInternalOhlcCandles(internalSymbol, normalizedTf, from, to) {
  const { fromSec, toSec } = parseQueryRangeToSec(from, to);
  if (fromSec != null || toSec != null) {
    return findOhlcBars(internalSymbol, normalizedTf, {
      fromSec,
      toSec,
      limit: MAX_CHART_CANDLES,
    });
  }
  return findOhlcBars(internalSymbol, normalizedTf, { limit: MAX_CHART_CANDLES });
}

function capCandlesForChart(candles) {
  if (!Array.isArray(candles) || candles.length <= MAX_CHART_CANDLES) return candles;
  return candles.slice(-MAX_CHART_CANDLES);
}

const TF_ALIASES = {
  '1min': '1m',
  '1minute': '1m',
  '1': '1m',
  '5min': '5m',
  '5minute': '5m',
  '5': '5m',
  '15min': '15m',
  '15minute': '15m',
  '15': '15m',
  '60': '1h',
  '60min': '1h',
  '1hour': '1h',
  '1day': '1d',
  'd': '1d',
};

function normalizeTf(tf) {
  let raw = String(tf || '').trim().toLowerCase();
  if (raw.includes(':')) raw = raw.split(':')[0];
  return TF_ALIASES[raw] ?? TF_ALIASES[String(tf || '').trim()] ?? raw;
}

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

router.get('/candles', async (req, res) => {
  try {
    const { symbol, tf, from, to } = req.query;

    if (!symbol || !tf) {
      return res.status(400).json({ error: 'symbol and tf are required' });
    }
    const normalizedTf = normalizeTf(tf);
    if (!VALID_TIMEFRAMES.includes(normalizedTf)) {
      return res.status(400).json({
        error: `Invalid tf. Use: ${VALID_TIMEFRAMES.join(', ')}`,
      });
    }

    const internalSymbol = String(symbol || '').replace(/\//g, '').toUpperCase();
    const wantsInternalXau = XAUUSD_HISTORY_FROM_DB && internalSymbol === 'XAUUSD';

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
      return res.json(capCandlesForChart(cached));
    }

    if (wantsInternalXau) {
      try {
        const internal = await loadInternalOhlcCandles(internalSymbol, normalizedTf, from, to);
        if (internal?.length > 0) {
          const candles = capCandlesForChart(internal);
          if (useStaleKey) {
            await Promise.all([
              cache.set(cacheKey, candles, ttl),
              cache.set(`${cacheKey}:swr`, candles, CANDLES_STALE_TTL),
            ]);
          } else {
            await cache.set(cacheKey, candles, ttl);
          }
          return res.json(candles);
        }
      } catch (e) {
        console.warn('[market/candles] internal XAUUSD:', e.message);
      }
    }

    if (!FINNHUB_KEY() && !twelveDataApiKey()) {
      if (wantsInternalXau) {
        return res.status(503).json({
          error:
            'No XAUUSD OHLC in MongoDB yet, and no external market API keys are configured.',
          hint: 'Run the feed with XAUUSD_PERSIST_TICKS=1 to fill the DB, or set FINNHUB_API_KEY / TWELVEDATA_API_KEY.',
        });
      }
      return res.status(500).json({
        error: 'Market data not configured',
        hint: 'Set FINNHUB_API_KEY and/or TWELVEDATA_API_KEY in backend/.env',
      });
    }

    if (staleCached) {
      setImmediate(() => {
        fetchCandlesWithFallback({
          symbol: internalSymbol,
          tf: normalizedTf,
          from: from || undefined,
          to: to || undefined,
        })
          .then((fresh) => {
            const capped = capCandlesForChart(fresh);
            return Promise.all([
              cache.set(cacheKey, capped, ttl),
              cache.set(`${cacheKey}:swr`, capped, CANDLES_STALE_TTL),
            ]);
          })
          .catch(() => {});
      });
      return res.json(capCandlesForChart(staleCached));
    }

    const rawCandles = await fetchCandlesWithFallback({
      symbol: internalSymbol,
      tf: normalizedTf,
      from: from || undefined,
      to: to || undefined,
    });
    const candles = capCandlesForChart(rawCandles);

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
    const isQuota = /limit|429|quota/i.test(err.message || '');
    res.status(isQuota ? 503 : 500).json({
      error: isQuota ? 'Market data API limit reached. Try again later.' : err.message,
    });
  }
});

router.get('/quote', async (req, res) => {
  try {
    const { symbol } = req.query;
    const apiKey = FINNHUB_KEY();
    if (!symbol) {
      return res.status(400).json({ error: 'symbol is required' });
    }
    if (!apiKey) {
      return res.status(500).json({ error: 'FINNHUB_API_KEY not configured' });
    }
    const internalSymbol = String(symbol || '').replace(/\//g, '').toUpperCase();
    const cacheKey = `quote:${internalSymbol}`;
    const ttl = 10;

    const cached = await cache.get(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    const quotes = await fetchQuotesBatch([internalSymbol], apiKey);
    if (!quotes.length) {
      return res.status(404).json({ error: 'Quote not available' });
    }
    const quote = quotes[0];
    await cache.set(cacheKey, quote, ttl);
    res.json(quote);
  } catch (e) {
    res.status(500).json({ error: e.message || 'Failed to fetch quote' });
  }
});

router.get('/technical', async (req, res) => {
  try {
    const { symbol, interval } = req.query;
    const finnhubKey = FINNHUB_KEY();
    if (!symbol) {
      return res.status(400).json({ error: 'symbol is required' });
    }
    if (!finnhubKey && !twelveDataApiKey()) {
      return res.status(500).json({
        error: 'Market data not configured',
        hint: 'Set FINNHUB_API_KEY and/or TWELVEDATA_API_KEY in backend/.env',
      });
    }
    const internalSymbol = String(symbol || '').replace(/\//g, '').toUpperCase();
    const intervalNorm = (interval || '1day').toLowerCase().replace(/^1d$/i, '1day');
    const cacheKey = `technical:${internalSymbol}:${intervalNorm}`;
    const ttl = 120;

    const cached = await cache.get(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    const tf = intervalToTf(intervalNorm);
    const now = new Date();
    const fromIso = new Date(now.getTime() - 86400000 * 150).toISOString();

    const candles = await fetchCandlesWithFallback({
      symbol: internalSymbol,
      tf,
      from: fromIso,
      to: undefined,
    });

    const rsi = rsiLast(candles);
    const macdResult = macdTripleLast(candles);
    const quotes = finnhubKey
      ? await fetchQuotesBatch([internalSymbol], finnhubKey).catch(() => [])
      : [];
    const quote = quotes[0] || null;
    const price = quote?.close ?? quote?.price ?? null;

    let rsiSignal = 'Neutral';
    if (rsi != null) {
      if (rsi >= 70) rsiSignal = 'Overbought';
      else if (rsi <= 30) rsiSignal = 'Oversold';
      else if (rsi > 55) rsiSignal = 'Bullish';
      else if (rsi < 45) rsiSignal = 'Bearish';
    }

    const macdHist = macdResult?.macd_hist;
    let trend = 'Neutral';
    let trendClass = 'neutral';
    if (macdHist != null) {
      if (macdHist > 0) {
        trend = 'Bullish';
        trendClass = 'bullish';
      } else if (macdHist < 0) {
        trend = 'Bearish';
        trendClass = 'bearish';
      }
    }

    let momentum = 'Sideways';
    if (macdHist != null) {
      momentum = macdHist > 0 ? 'Up' : macdHist < 0 ? 'Down' : 'Sideways';
    }

    const p = Number.isFinite(price) ? price : 0;
    const support = p ? [p * 0.995, p * 0.99].map((x) => Math.round(x * 100) / 100) : [];
    const resistance = p ? [p * 1.005, p * 1.01].map((x) => Math.round(x * 100) / 100) : [];
    if (quote?.low != null && quote.low > 0) {
      support[0] = Math.round(quote.low * 100) / 100;
    }
    if (quote?.high != null && quote.high > 0) {
      resistance[0] = Math.round(quote.high * 100) / 100;
    }

    let summary = 'Technical data from market candles (RSI/MACD computed server-side).';
    if (trend !== 'Neutral' && rsi != null) {
      summary = `${trend} momentum. RSI(14) at ${rsi.toFixed(1)} (${rsiSignal}).`;
    } else if (rsi != null) {
      summary = `RSI(14) at ${rsi.toFixed(1)} (${rsiSignal}).`;
    }

    const lastBar = candles.length ? candles[candles.length - 1] : null;
    const payload = {
      trend,
      trendClass,
      summary,
      support,
      resistance,
      rsi: rsi ?? undefined,
      rsiSignal,
      momentum,
      macd: macdResult?.macd ?? undefined,
      macd_signal: macdResult?.macd_signal ?? undefined,
      macd_hist: macdResult?.macd_hist ?? undefined,
      price: price ?? undefined,
      datetime: quote?.datetime ?? (lastBar ? new Date(lastBar.time * 1000).toISOString() : undefined),
      source: 'finnhub',
    };

    await cache.set(cacheKey, payload, ttl);
    res.json(payload);
  } catch (e) {
    console.error('[market/technical]', e.message);
    res.status(500).json({ error: e.message || 'Failed to fetch technical analysis' });
  }
});

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

router.get('/feed-log', (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '100', 10) || 100, 500);
    const symbol = req.query.symbol || undefined;
    const event = req.query.event || undefined;
    let entries = getRecentFeedLog(limit, symbol, event);
    if (entries.length === 0) {
      entries = readFeedLogFile(limit, symbol);
    }
    res.json({ count: entries.length, entries });
  } catch (err) {
    console.error('[market/feed-log]', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/feed-log/summary', (req, res) => {
  try {
    res.json(getFeedLogSummary());
  } catch (err) {
    console.error('[market/feed-log/summary]', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
