import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { initWebSocket, broadcastTick } from './websocket.js';
import { logMarketTick } from './services/marketDataLogger.js';
import marketRoutes from './routes/market.js';
import { fetchQuote } from './services/twelveData.js';
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
const SUBSCRIBED_SYMBOLS = ['XAUUSD', 'EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'USDCAD', 'AUDUSD', 'NZDUSD'];
/** Top symbols polled more frequently for chart (Gold, EUR, GBP) */
const FAST_SYMBOLS = ['XAUUSD', 'EURUSD', 'GBPUSD'];
const QUOTE_POLL_INTERVAL_MS = parseInt(process.env.QUOTE_POLL_INTERVAL_MS || '1000', 10);
const FAST_POLL_INTERVAL_MS = 500;

const MAX_CONSECUTIVE_FAILURES = 5;

async function pollSymbols(apiKey, symbols) {
  const results = await Promise.allSettled(
    symbols.map((symbol) => fetchQuote(symbol, apiKey))
  );
  let hadError = false;
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status === 'fulfilled') {
      broadcastTick(r.value);
      logMarketTick(r.value, 'quote');
    } else {
      hadError = true;
      console.error(`[poller] ${symbols[i]}:`, r.reason?.message);
    }
  }
  return hadError;
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
  let fastId = null;
  let fullId = null;

  const runPoll = async (symbols) => {
    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) return;
    const hadError = await pollSymbols(apiKey, symbols);
    if (hadError) {
      consecutiveFailures++;
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        console.error(`[poller] Stopping after ${MAX_CONSECUTIVE_FAILURES} consecutive failures`);
        if (fastId) clearInterval(fastId);
        if (fullId) clearInterval(fullId);
      }
    } else {
      consecutiveFailures = 0;
    }
  };

  await runPoll(SUBSCRIBED_SYMBOLS);
  if (consecutiveFailures < MAX_CONSECUTIVE_FAILURES) {
    fastId = setInterval(() => runPoll(FAST_SYMBOLS), FAST_POLL_INTERVAL_MS);
    fullId = setInterval(() => runPoll(SUBSCRIBED_SYMBOLS), QUOTE_POLL_INTERVAL_MS);
    console.log(`[poller] Quote poller: fast (${FAST_POLL_INTERVAL_MS}ms) for ${FAST_SYMBOLS.join(', ')}, full (${QUOTE_POLL_INTERVAL_MS}ms) for all`);
  }
}

server.listen(PORT, async () => {
  console.log(`[server] Listening on port ${PORT}`);
  console.log(`[server] WebSocket: ws://localhost:${PORT}/ws`);

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
