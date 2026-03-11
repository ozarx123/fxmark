import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { initWebSocket, broadcastTick } from './websocket.js';
import { logMarketTick } from './services/marketDataLogger.js';
import positionsService from '../modules/trading/positions.service.js';
import marketRoutes from './routes/market.js';
import { isRedisAvailable } from './services/cache.js';
import { fetchQuotesBatch } from './services/twelveData.js';
import { createTwelveDataWebSocket } from './services/twelveDataWebSocket.js';
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

async function pollSymbols(apiKey, symbols) {
  try {
    const ticks = await fetchQuotesBatch(symbols, apiKey);
    for (const tick of ticks) {
      broadcastTick(tick);
      logMarketTick(tick, 'quote');
      const price = tick.close ?? tick.price;
      if (tick.symbol && price != null) {
        console.log('[TP/SL] tick', tick.symbol, 'price', price);
        positionsService
          .checkAndExecuteTPLS(tick.symbol, price)
          .catch((e) => console.warn('[TP/SL]', e.message));
      }
    }
    return ticks.length === 0;
  } catch (err) {
    console.error('[poller]', err.message);
    return true;
  }
}

const USE_TWELVE_WS = process.env.TWELVE_DATA_WS === 'true';

/**
 * Start Twelve Data WebSocket stream (market-grade real-time).
 * Falls back to REST poller on failure.
 */
function runTwelveDataWebSocket() {
  const apiKey = (process.env.TWELVE_DATA_API_KEY || '').trim();
  if (!apiKey) {
    console.warn('[twelveDataWS] TWELVE_DATA_API_KEY not set');
    return runQuotePoller();
  }

  const client = createTwelveDataWebSocket({
    apiKey,
    symbols: SUBSCRIBED_SYMBOLS,
    onTick: (tick) => {
      broadcastTick(tick);
      logMarketTick(tick, 'ws');
      const price = tick.close ?? tick.price;
      if (tick.symbol && price != null) {
        console.log('[TP/SL] ws tick', tick.symbol, 'price', price);
        positionsService
          .checkAndExecuteTPLS(tick.symbol, price)
          .catch((e) => console.warn('[TP/SL]', e.message));
      }
    },
    onError: () => {
      console.warn('[twelveDataWS] Falling back to REST poller');
      runQuotePoller();
    },
  });

  if (!client) runQuotePoller();
  else console.log('[twelveDataWS] Twelve Data WebSocket streaming enabled (market-grade real-time)');
}

/**
 * Poll Twelve Data quote API (parallel) and broadcast via WebSocket.
 * Used when TWELVE_DATA_WS is false or WebSocket fails.
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
    console.log(`[poller] Quote poller: ${SUBSCRIBED_SYMBOLS.length} symbols every ${QUOTE_POLL_INTERVAL_MS}ms (~${creditsPerMin} credits/min, limit 55)`);
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

  if (USE_TWELVE_WS) {
    runTwelveDataWebSocket();
  } else {
    await runQuotePoller();
  }
});
