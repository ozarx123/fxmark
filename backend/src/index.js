import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

console.log('FINNHUB KEY:', process.env.FINNHUB_API_KEY ? 'LOADED' : 'MISSING');
console.log('[env] loaded from', path.resolve(__dirname, '../.env'));

import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { initWebSocket, broadcastTick } from './websocket.js';
import { logMarketTick } from './services/marketDataLogger.js';
import positionsService from '../modules/trading/positions.service.js';
import { checkAndTriggerPendingOrders } from '../modules/trading/pendingOrders.engine.js';
import pendingOrdersEngine from '../modules/trading/pendingOrders.engine.js';
import marketRoutes from './routes/market.js';
import { isRedisAvailable } from './services/cache.js';
import { fetchQuotesBatch } from './services/twelveData.js';
import { createTwelveDataWebSocket } from './services/twelveDataWebSocket.js';
import { createFinnhubWebSocket } from './services/finnhubWebSocket.js';
import {
  logFeedTick,
  logFeedError,
  logFeedEvent,
  getRecentFeedLog,
  readFeedLogFile,
  getFeedLogSummary,
} from './services/twelveDataFeedLogger.js';
import { getDb } from '../config/mongo.js';
import apiRoutes from '../core/routes.js';
import middleware from '../core/middleware.js';

const PORT = parseInt(process.env.PORT || '3000', 10);

const app = express();
app.use(cors());

function isSocketIORequest(req) {
  const path = req.path ?? (req.url ? req.url.split('?')[0] : '');
  return String(path).startsWith('/socket.io');
}

// Skip JSON body parser for Socket.IO (Engine.IO uses its own format; parsing it causes 400)
app.use((req, res, next) => {
  if (isSocketIORequest(req)) return next();
  express.json()(req, res, next);
});
app.use(middleware.requestId);

// Do not pass /socket.io into Express routes — leave request for Socket.IO's listener (avoids 404/400)
app.use((req, res, next) => {
  if (isSocketIORequest(req)) return;
  next();
});

// Health (root)
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// MongoDB health (503 if CONNECTION_STRING not set or connection fails)
app.get('/health/db', async (req, res) => {
  if (!process.env.CONNECTION_STRING && !process.env.MONGODB_URI) {
    return res.status(503).json({ status: 'unavailable', reason: 'No MongoDB URI configured' });
  }
  try {
    const db = await getDb();
    await db.admin().command({ ping: 1 });
    res.json({ status: 'ok', db: 'mongodb' });
  } catch (err) {
    res.status(503).json({ status: 'unavailable', reason: err.message });
  }
});

// Redis cache health (503 if REDIS_URL/REDIS_HOST set but Redis unreachable)
app.get('/health/redis', async (req, res) => {
  const hasUrl = !!(process.env.REDIS_URL && process.env.REDIS_URL.trim());
  const hasHost = !!(process.env.REDIS_HOST && process.env.REDIS_HOST.trim());
  const configured = hasUrl || hasHost;
  if (!configured) {
    return res.json({
      status: 'ok',
      redis: 'not_configured',
      cache: 'memory',
      hint: 'Add REDIS_URL=redis://localhost:6379 or REDIS_HOST=localhost to backend/.env and restart the server',
    });
  }
  try {
    const ok = await isRedisAvailable();
    if (ok) return res.json({ status: 'ok', redis: 'connected' });
    res.status(503).json({ status: 'unavailable', reason: 'Redis ping failed' });
  } catch (err) {
    res.status(503).json({ status: 'unavailable', reason: err.message });
  }
});

// Market data
app.use('/api/market', marketRoutes);

// API (auth, users, wallet, etc. from core)
app.use('/api', apiRoutes);
app.use(middleware.errorHandler);

const server = createServer(app);
initWebSocket(server);

/**
 * Symbols to poll/stream. Default: XAUUSD and EURUSD only.
 * Override via SUBSCRIBED_SYMBOLS env (comma-separated, e.g. "XAUUSD,EURUSD,GBPUSD").
 * Free tier: 2 symbols × ~20/min = 40 credits/min (under 55).
 */
const SUBSCRIBED_SYMBOLS = process.env.SUBSCRIBED_SYMBOLS
  ? process.env.SUBSCRIBED_SYMBOLS.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean)
  : ['XAUUSD', 'EURUSD'];
const RAW_POLL_MS = parseInt(process.env.QUOTE_POLL_INTERVAL_MS || '3000', 10);
const QUOTE_POLL_INTERVAL_MS = Math.min(Math.max(RAW_POLL_MS, 1000), 30000);

const MAX_CONSECUTIVE_FAILURES = 5;

// ── Live tick source priority ─────────────────────────────────────────────────
//
//   Priority 1 — Finnhub WS    (real-time trades, ~200 ms)
//   Priority 2 — TwelveData WS (streaming quotes, ~1–5 s when WS plan active)
//   Priority 3 — REST poll     (fallback, ~2 s interval, price-dedup applied)
//
// A higher-priority source suppresses broadcasting from lower-priority ones.
// When a source disconnects / goes stale its flag is cleared so the next
// available source picks up automatically.
let finnhubActive = false; // Priority 1
let tdWsActive    = false; // Priority 2

// ── REST deduplication ────────────────────────────────────────────────────────
// Avoid spamming unchanged cached prices to the frontend when the market is
// flat or outside trading hours.
const lastRestPrice = new Map(); // symbol → last broadcast price

// ── Unified emit with source tagging ─────────────────────────────────────────
let lastEmitTs = 0;
function emitWithLog(tick, source) {
  const now  = Date.now();
  const gap  = lastEmitTs ? now - lastEmitTs : 0;
  lastEmitTs = now;
  console.log(`EMIT_SOURCE=${source} EMIT GAP MS=${gap} symbol=${tick.symbol} price=${tick.close ?? tick.price}`);
  broadcastTick(tick);
}

/**
 * Fetch quotes via REST and:
 *   - always run TP/SL checks
 *   - always log to feed log
 *   - broadcast to frontend ONLY when TD WebSocket is not active (fallback mode)
 */
async function pollSymbols(apiKey, symbols) {
  const t0 = Date.now();
  try {
    const ticks = await fetchQuotesBatch(symbols, apiKey);
    const latencyMs = Date.now() - t0;
    for (const tick of ticks) {
      logMarketTick(tick, 'quote');
      logFeedTick({
        symbol:     tick.symbol,
        price:      tick.close ?? tick.price,
        providerTs: tick.datetime,
        latencyMs,
        status:     200,
      });
      const price = tick.close ?? tick.price;
      if (tick.symbol && price != null) {
        positionsService
          .checkAndExecuteTPLS(tick.symbol, price)
          .catch((e) => console.warn('[TP/SL]', e.message));
        checkAndTriggerPendingOrders(tick.symbol, price).catch((e) => console.warn('[pendingOrders]', e.message));
      }
      // Priority 3: REST broadcasts only when BOTH WS sources are offline.
      // Also deduplicate — skip if price is identical to the last REST emit.
      if (!finnhubActive && !tdWsActive) {
        const prev = lastRestPrice.get(tick.symbol);
        if (prev !== price) {
          lastRestPrice.set(tick.symbol, price);
          emitWithLog(tick, 'REST');
        }
      }
    }
    return ticks.length === 0;
  } catch (err) {
    logFeedError({
      symbol:   symbols.join(','),
      endpoint: '/quote',
      error:    err.message,
      latencyMs: Date.now() - t0,
    });
    return true;
  }
}

/**
 * Start the REST quote poller.
 * Always running — handles TP/SL, feed logging, and fallback broadcasting.
 * Broadcasts are suppressed while TD WebSocket is active.
 */
async function runQuotePoller() {
  const apiKey = (process.env.TWELVE_DATA_API_KEY || '').trim();
  if (!apiKey) {
    console.warn('[poller] TWELVE_DATA_API_KEY not set, quote poller disabled');
    return;
  }

  let consecutiveFailures = 0;
  let pollId = null;

  const runPoll = async () => {
    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) return;
    const hadError = await pollSymbols(apiKey, SUBSCRIBED_SYMBOLS);
    if (hadError) {
      consecutiveFailures++;
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        console.error(`[poller] Stopping after ${MAX_CONSECUTIVE_FAILURES} consecutive failures`);
        if (pollId) clearInterval(pollId);
      }
    } else {
      consecutiveFailures = 0;
    }
  };

  await runPoll();
  if (consecutiveFailures < MAX_CONSECUTIVE_FAILURES) {
    pollId = setInterval(runPoll, QUOTE_POLL_INTERVAL_MS);
    const creditsPerMin = Math.round((60000 / QUOTE_POLL_INTERVAL_MS) * SUBSCRIBED_SYMBOLS.length);
    console.log(`[poller] REST poller running: ${SUBSCRIBED_SYMBOLS.length} symbols every ${QUOTE_POLL_INTERVAL_MS}ms (~${creditsPerMin} credits/min) — broadcasts only when WS offline`);
    logFeedEvent('poller_start', {
      symbols: SUBSCRIBED_SYMBOLS,
      intervalMs: QUOTE_POLL_INTERVAL_MS,
      creditsPerMin,
    });
  }
}

/**
 * Start Twelve Data WebSocket stream as the PRIMARY live tick source.
 * REST poller runs in parallel for TP/SL and as fallback broadcaster.
 */
function runTwelveDataWebSocket() {
  const apiKey = (process.env.TWELVE_DATA_API_KEY || '').trim();
  if (!apiKey) {
    console.warn('[twelveDataWS] TWELVE_DATA_API_KEY not set — using REST-only mode');
    return;
  }

  const client = createTwelveDataWebSocket({
    apiKey,
    symbols: SUBSCRIBED_SYMBOLS,
    onTick: (tick) => {
      // Always run TP/SL and logging regardless of source priority
      logMarketTick(tick, 'ws');
      logFeedTick({
        symbol:     tick.symbol,
        price:      tick.close ?? tick.price,
        providerTs: tick.datetime ?? tick.providerTs,
        latencyMs:  tick.serverReceivedAt ? Date.now() - tick.serverReceivedAt : null,
        status:     200,
      });
      const price = tick.close ?? tick.price;
      if (tick.symbol && price != null) {
        positionsService
          .checkAndExecuteTPLS(tick.symbol, price)
          .catch((e) => console.warn('[TP/SL]', e.message));
        checkAndTriggerPendingOrders(tick.symbol, price).catch((e) => console.warn('[pendingOrders]', e.message));
      }
      // Priority 2: only broadcast when Finnhub (priority 1) is offline
      if (!finnhubActive) {
        tdWsActive = true;
        emitWithLog(tick, 'TD_WS');
      }
    },
    onError: (err) => {
      if (tdWsActive) {
        tdWsActive = false;
        console.warn('[twelveDataWS] Stream failed — falling back to REST poll:', err?.message ?? err);
      }
    },
  });

  if (!client) {
    console.warn('[twelveDataWS] Could not create WS client — REST-only mode');
  } else {
    console.log('[twelveDataWS] PRIMARY live tick source started (REST poll is standby fallback)');
  }
}

/**
 * Start Finnhub WebSocket stream as the highest-priority live tick source.
 *
 * Flow:
 *   Finnhub trade event
 *     → normalize to internal tick
 *     → run TP/SL check
 *     → emitWithLog(tick, 'FINNHUB')  ← only source that sets finnhubActive=true
 *
 * On disconnect / stale: finnhubActive = false
 *   → TD WebSocket (or REST poll) automatically takes over as broadcaster.
 */
function runFinnhubWebSocket() {
  const apiKey = (process.env.FINNHUB_API_KEY || '').trim();
  if (!apiKey) {
    console.warn('[FINNHUB] FINNHUB_API_KEY not set — skipping Finnhub WS');
    return;
  }

  const client = createFinnhubWebSocket({
    apiKey,
    symbols: SUBSCRIBED_SYMBOLS,

    onConnect: () => {
      // finnhubActive is set to true on the first tick, not just on connect,
      // so we don't suppress other sources before real prices arrive.
      console.log('[FINNHUB] Stream connected — will become primary source on first tick');
    },

    onTick: (tick) => {
      // Mark Finnhub as active — suppresses TD_WS and REST broadcasting
      finnhubActive = true;

      // TP/SL and feed logging always run regardless of source
      logMarketTick(tick, 'finnhub_ws');
      logFeedTick({
        symbol:     tick.symbol,
        price:      tick.close ?? tick.price,
        providerTs: tick.datetime,
        latencyMs:  tick.serverReceivedAt ? Date.now() - tick.serverReceivedAt : null,
        status:     200,
      });
      const price = tick.close ?? tick.price;
      if (tick.symbol && price != null) {
        positionsService
          .checkAndExecuteTPLS(tick.symbol, price)
          .catch((e) => console.warn('[TP/SL]', e.message));
        checkAndTriggerPendingOrders(tick.symbol, price).catch((e) => console.warn('[pendingOrders]', e.message));
      }

      emitWithLog(tick, 'FINNHUB');
    },

    onDisconnect: (reason) => {
      if (finnhubActive) {
        finnhubActive = false;
        const next = tdWsActive ? 'TD_WS' : 'REST_POLL';
        console.warn(`[FINNHUB] Stream offline (${reason}) — ${next} will take over broadcasting`);
      }
    },

    onError: (err) => {
      console.error(`FINNHUB_ERROR: ${err?.message ?? err}`);
      if (finnhubActive) {
        finnhubActive = false;
      }
    },
  });

  if (client) {
    console.log('[FINNHUB] PRIMARY live tick source started (TD_WS and REST are standby fallbacks)');
  }
}

server.listen(PORT, async () => {
  console.log(`[server] Listening on port ${PORT}`);
  console.log(`[server] WebSocket: ws://localhost:${PORT}/ws`);
  console.log(`[server] Socket.IO datafeed: http://localhost:${PORT}/socket.io`);

  if (!process.env.CONNECTION_STRING && !process.env.MONGODB_URI) {
    console.warn('[server] MongoDB not configured. Set CONNECTION_STRING in backend/.env');
    console.warn('[server] Trading, finance, and auth will return 500 until MongoDB is connected.');
  } else {
    try {
      const db = await getDb();
      await db.admin().command({ ping: 1 });
      console.log('[server] MongoDB connected');
    } catch (err) {
      console.error('[server] MongoDB connection failed:', err.message);
      console.error('[server] Fix: Check CONNECTION_STRING in backend/.env. Run: npm run check-mongo');
    }
  }

  // Priority 1 — Finnhub WebSocket (real-time trades, ~200 ms latency)
  runFinnhubWebSocket();

  // Priority 2 — TwelveData WebSocket (streaming quotes; broadcasts only when Finnhub offline)
  runTwelveDataWebSocket();

  // Priority 3 — REST poller (TP/SL, feed logging, fallback; broadcasts only when both WS offline)
  runQuotePoller();

});
