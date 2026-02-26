import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { initWebSocket, broadcastTick } from './websocket.js';
import { logMarketTick } from './services/marketDataLogger.js';
import marketRoutes from './routes/market.js';
import { fetchQuotesBatch } from './services/twelveData.js';
import { createTwelveDataWebSocket } from './services/twelveDataWebSocket.js';
import { getDb } from '../config/mongo.js';
import apiRoutes from '../core/routes.js';
import middleware from '../core/middleware.js';

const PORT = parseInt(process.env.PORT || '3000', 10);

const app = express();
app.use(cors());
app.use(express.json());
app.use(middleware.requestId);

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

// Market data
app.use('/api/market', marketRoutes);

// API (auth, users, wallet, etc. from core)
app.use('/api', apiRoutes);
app.use(middleware.errorHandler);

const server = createServer(app);
initWebSocket(server);

/** Symbols to poll for quotes (broadcast via WebSocket for real-time P&L) */
const SUBSCRIBED_SYMBOLS = ['XAUUSD'];
/** 10s = 6 polls/min × 8 symbols = 48 credits/min (under Twelve Data free tier 55/min) */
const QUOTE_POLL_INTERVAL_MS = parseInt(process.env.QUOTE_POLL_INTERVAL_MS || '10000', 10);

const MAX_CONSECUTIVE_FAILURES = 5;

async function pollSymbols(apiKey, symbols) {
  try {
    const ticks = await fetchQuotesBatch(symbols, apiKey);
    for (const tick of ticks) {
      broadcastTick(tick);
      logMarketTick(tick, 'quote');
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
  const apiKey = process.env.TWELVE_DATA_API_KEY;
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
  const apiKey = process.env.TWELVE_DATA_API_KEY;
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
