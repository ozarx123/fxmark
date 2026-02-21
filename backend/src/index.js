import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { initWebSocket, broadcastTick } from './websocket.js';
import marketRoutes from './routes/market.js';
import { fetchQuote } from './services/twelveData.js';
import { SYMBOL_MAP } from './config/symbolMap.js';

const PORT = parseInt(process.env.PORT || '3000', 10);

const app = express();
app.use(express.json());

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Market data routes
app.use('/api/market', marketRoutes);

const server = createServer(app);
initWebSocket(server);

/** Symbols to poll for quotes (only XAUUSD to stay within free tier limits) */
const SUBSCRIBED_SYMBOLS = ['XAUUSD'];
const QUOTE_POLL_INTERVAL_MS = 15000; // 15s - ~4 calls/min for 1 symbol

/**
 * Poll Twelve Data quote API for subscribed symbols and broadcast via WebSocket
 */
async function runQuotePoller() {
  const apiKey = process.env.TWELVE_DATA_API_KEY;
  if (!apiKey) {
    console.warn('[poller] TWELVE_DATA_API_KEY not set, quote poller disabled');
    return;
  }

  const poll = async () => {
    for (const symbol of SUBSCRIBED_SYMBOLS) {
      try {
        const quote = await fetchQuote(symbol, apiKey);
        broadcastTick(quote);
      } catch (err) {
        console.error(`[poller] ${symbol}:`, err.message);
      }
    }
  };

  await poll();
  setInterval(poll, QUOTE_POLL_INTERVAL_MS);
  console.log(`[poller] Quote poller started for ${SUBSCRIBED_SYMBOLS.join(', ')}`);
}

server.listen(PORT, async () => {
  console.log(`[server] Listening on port ${PORT}`);
  console.log(`[server] WebSocket: ws://localhost:${PORT}/ws`);
  await runQuotePoller();
});
