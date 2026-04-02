// Must be first: ES modules evaluate imports before this file's body; Zoho/Mongo must see backend/.env first.
import '../config/load-env.js';
import { getAllowedOriginsList, resolveTrustProxy } from '../core/security-bootstrap.js';

/** Non-local hostname in API_URL / FRONTEND_URL (email verification / public links). */
function envUrlHostIsNonLocal(envVar) {
  const raw = (process.env[envVar] || '').trim();
  if (!raw) return false;
  try {
    const u = new URL(raw.includes('://') ? raw : `https://${raw}`);
    const h = u.hostname.toLowerCase();
    return h !== 'localhost' && h !== '127.0.0.1' && h !== '::1';
  } catch {
    return false;
  }
}

/** Email-verification config: warn if NODE_ENV=development on a hosted or public-URL deployment. */
function warnIfDevelopmentLooksPublic() {
  if (process.env.NODE_ENV !== 'development') return;

  const hostedPlatform =
    !!process.env.K_SERVICE || // Cloud Run
    !!process.env.AWS_EXECUTION_ENV ||
    !!process.env.HEROKU_APP_NAME ||
    !!process.env.RAILWAY_ENVIRONMENT ||
    !!process.env.FLY_APP_NAME ||
    !!process.env.WEBSITE_SITE_NAME || // Azure App Service
    !!process.env.ECS_CONTAINER_METADATA_URI;

  const publicUrls =
    envUrlHostIsNonLocal('API_URL') ||
    envUrlHostIsNonLocal('FRONTEND_URL') ||
    envUrlHostIsNonLocal('WEB_APP_URL');

  if (hostedPlatform || publicUrls) {
    console.warn(
      '[env][email-verification] NODE_ENV is "development" but the process looks hosted or uses non-local API_URL/FRONTEND_URL. ' +
        'Verification links may be wrong unless FRONTEND_URL matches your public site. Prefer NODE_ENV=production on public servers.'
    );
  }
}
warnIfDevelopmentLooksPublic();

if (process.env.NODE_ENV !== 'production') {
  console.log('[env] Finnhub API key:', process.env.FINNHUB_API_KEY ? 'configured' : 'not set');
}
const zohoMailUser = (process.env.ZOHO_MAIL_USER || '').trim();
console.log(
  '[env] Zoho Mail:',
  zohoMailUser ? `${zohoMailUser.replace(/(.{2}).*(@.*)/, '$1***$2')} (configured)` : 'NOT SET — verification/notification emails disabled'
);
const mailWalletOff = ['0', 'false', 'no', 'off'].includes(
  (process.env.MAIL_WALLET_BALANCE_UPDATES || '').trim().toLowerCase()
);
console.log(
  '[env] Wallet balance emails:',
  mailWalletOff
    ? 'OFF (MAIL_WALLET_BALANCE_UPDATES=0 — unset env or use 1 to enable)'
    : 'ON (default; disable with MAIL_WALLET_BALANCE_UPDATES=0)'
);

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import sanitize from 'mongo-sanitize';
import { createRequire } from 'module';
import { createServer } from 'http';

const require = createRequire(import.meta.url);
const { xss } = require('express-xss-sanitizer');
import { initWebSocket, broadcastTick } from './websocket.js';
import {
  logMarketTick,
  logFeedTick,
  logFeedError,
  logFeedEvent,
} from './services/marketDataLogger.js';
import positionsService from '../modules/trading/positions.service.js';
import { refreshMarginRiskRuntime } from '../modules/trading/margin-risk.runtime.js';
import { checkAndTriggerPendingOrders } from '../modules/trading/pendingOrders.engine.js';
import pendingOrdersEngine from '../modules/trading/pendingOrders.engine.js';
import marketRoutes from './routes/market.js';
import { isRedisAvailable } from './services/cache.js';
import { setLastPrice, getLastPrice } from './services/lastQuotePrices.js';
import { fetchQuotesBatch } from './services/finnhubRest.js';
import { createFinnhubWebSocket } from './services/finnhubWebSocket.js';
import { createTwelveDataWebSocket } from './services/twelveDataWebSocket.js';
import { getDb } from '../config/mongo.js';
import { applyPlatformEnvOverridesFromDatabase } from '../modules/admin/platform-env.service.js';
import apiRoutes from '../core/routes.js';
import middleware from '../core/middleware.js';
import { maintenanceApiGate } from '../core/maintenance.middleware.js';
import maintenanceService from '../modules/admin/maintenance.service.js';
import { startDailyWalletLedgerReconciliation } from '../modules/finance/reconciliation-daily.cron.js';
import financialTransactionService from '../modules/finance/financial-transaction.service.js';

const PORT = (() => {
  const p = parseInt(process.env.PORT || '3000', 10);
  if (!Number.isFinite(p) || p < 1 || p > 65535) {
    console.warn('[server] Invalid PORT; using 3000');
    return 3000;
  }
  return p;
})();

if (!process.env.FINNHUB_API_KEY) {
  console.warn('[env] Missing FINNHUB_API_KEY — Finnhub live stream disabled');
}

/**
 * /api/auth rate limit (per IP, rolling window). Default 10/15min in production.
 * Local dev often uses NODE_ENV=production with API_URL=http://localhost:3000 — that still hit the cap during testing.
 * Set RATE_LIMIT_MAX_AUTH explicitly to override (0 = unlimited; not recommended in production).
 */
function getAuthRateLimitMax() {
  const raw = (process.env.RATE_LIMIT_MAX_AUTH ?? '').trim();
  if (raw !== '') {
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n >= 0 ? n : 10;
  }
  const nodeEnv = process.env.NODE_ENV;
  const isDevEnv = !nodeEnv || nodeEnv === 'development';
  const apiUrl = (process.env.API_URL || '').trim();
  const apiIsLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(apiUrl);
  if (isDevEnv || apiIsLocal) return 500;
  return 10;
}

const AUTH_RATE_LIMIT_MAX = getAuthRateLimitMax();

/** True when the TCP peer is this machine (Vite → API on same PC). Skips auth rate limit so dev isn't capped at 10/500. */
function isLoopbackRequest(req) {
  if ((process.env.RATE_LIMIT_SKIP_AUTH || '').toLowerCase() === 'true') return true;
  const ip = String(req.ip || req.socket?.remoteAddress || '');
  return (
    ip === '127.0.0.1' ||
    ip === '::1' ||
    ip === '::ffff:127.0.0.1' ||
    ip.endsWith('127.0.0.1')
  );
}

const app = express();

app.set('trust proxy', resolveTrustProxy());

// ── Security: Helmet (tight CSP for JSON API — no inline assets served here) ─
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'none'"],
        baseUri: ["'none'"],
        formAction: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);

// ── CORS: allow only known origins when ALLOWED_ORIGINS is set ───────────────
const allowedOrigins = getAllowedOriginsList();
if (allowedOrigins && allowedOrigins.length > 0) {
  app.use(cors({
    origin: (origin, cb) => {
      if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
      return cb(null, false);
    },
    credentials: true,
  }));
} else {
  app.use(cors());
}

function isSocketIORequest(req) {
  const path = req.path ?? (req.url ? req.url.split('?')[0] : '');
  return String(path).startsWith('/socket.io');
}

// JSON body; preserve raw buffer for NOWPayments IPN signature verification
const jsonParser = express.json({
  limit: '1mb',
  verify: (req, res, buf) => {
    const url = (req.originalUrl || '').split('?')[0];
    if (url === '/api/webhooks/nowpayments') {
      req.rawNowpaymentsBody = Buffer.from(buf);
    }
  },
});

// Skip JSON body parser for Socket.IO (Engine.IO uses its own format; parsing it causes 400)
app.use((req, res, next) => {
  if (isSocketIORequest(req)) return next();
  jsonParser(req, res, next);
});
app.use(middleware.requestId);

// Do not pass /socket.io into Express routes — leave request for Socket.IO's listener (avoids 404/400)
app.use((req, res, next) => {
  if (isSocketIORequest(req)) return;
  next();
});

// ── Security: Global rate limit (skip Socket.IO; they never reach here) ───────
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX_GLOBAL || '200', 10),
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    const url = (req.originalUrl || '').split('?')[0];
    return url === '/api/webhooks/nowpayments';
  },
});
app.use(globalLimiter);

// ── Security: NoSQL injection protection (sanitize after body parsed) ─────────
app.use((req, res, next) => {
  if (req.body && typeof req.body === 'object') sanitize(req.body);
  if (req.query && typeof req.query === 'object') sanitize(req.query);
  if (req.params && typeof req.params === 'object') sanitize(req.params);
  next();
});

// ── Security: XSS protection on input ───────────────────────────────────────
app.use(xss());

// Root (browser / load balancers)
app.get('/', (req, res) => {
  res.json({
    service: 'fxmark-backend',
    ok: true,
    message: 'Use /api/* for REST and /health for probes.',
    health: '/health',
    apiHealth: '/api/health',
    api: '/api',
  });
});

// Health — canonical + /api alias (frontend & proxies often expect /api/health)
app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// Public maintenance status (for SPA; not blocked by maintenance gate)
app.get('/api/platform/maintenance', async (_req, res) => {
  try {
    const st = await maintenanceService.getPublicStatus();
    res.json(st);
  } catch {
    res.json({ maintenance: false, message: '' });
  }
});

// Block most /api/* with 503 when maintenance is on (before market + REST API)
app.use('/api', maintenanceApiGate);

// MongoDB health (503 if CONNECTION_STRING not set or connection fails)
app.get('/health/db', async (req, res) => {
  const hasMongoUri =
    !!(process.env.CONNECTION_STRING && String(process.env.CONNECTION_STRING).trim()) ||
    !!(process.env.MONGODB_URI && String(process.env.MONGODB_URI).trim());
  if (!hasMongoUri) {
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

// ── Security: Rate limit only login + register/signup (not verify-email / resend / refresh) ─
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: AUTH_RATE_LIMIT_MAX,
  message: { error: 'Too many authentication attempts, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    if (req.method === 'OPTIONS') return true;
    return isLoopbackRequest(req);
  },
});

const SENSITIVE_AUTH_PATHS = new Set([
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/signup',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
]);

function normalizeRequestPath(req) {
  const p = req.path || (req.url ? req.url.split('?')[0] : '') || '';
  return p.replace(/\/+$/, '') || '/';
}

function applySensitiveAuthRateLimit(req, res, next) {
  if (req.method === 'OPTIONS') return next();
  const p = normalizeRequestPath(req);
  if (!SENSITIVE_AUTH_PATHS.has(p)) return next();
  // GET = redirect to SPA from email; do not count toward login-style limits
  if (p === '/api/auth/reset-password' && req.method === 'GET') return next();
  return authLimiter(req, res, next);
}

app.use(applySensitiveAuthRateLimit);
if (AUTH_RATE_LIMIT_MAX !== 10) {
  console.log(
    `[rate-limit] login/register/signup/forgot/reset: ${AUTH_RATE_LIMIT_MAX} req / 15 min per IP (verify-email & resend not limited here). Set RATE_LIMIT_MAX_AUTH to override.`
  );
}

// API (auth, users, wallet, etc. from core)
app.use('/api', apiRoutes);
app.use(middleware.errorHandler);

const server = createServer(app);
server.on('error', (err) => {
  if (err?.code === 'EADDRINUSE') {
    console.error(
      `[server] Port ${PORT} is already in use (EADDRINUSE). Stop the other process using this port or set PORT in backend/.env to a free port (e.g. PORT=3001).`
    );
    process.exit(1);
  }
  throw err;
});
initWebSocket(server, { corsOrigins: allowedOrigins });

/**
 * Symbols to poll/stream. Default: XAUUSD and EURUSD only.
 * Override via SUBSCRIBED_SYMBOLS env (comma-separated, e.g. "XAUUSD,EURUSD,GBPUSD").
 */
const SUBSCRIBED_SYMBOLS = process.env.SUBSCRIBED_SYMBOLS
  ? process.env.SUBSCRIBED_SYMBOLS.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean)
  : ['XAUUSD', 'EURUSD'];
const RAW_POLL_MS = parseInt(process.env.QUOTE_POLL_INTERVAL_MS || '3000', 10);
const QUOTE_POLL_INTERVAL_MS = Math.min(Math.max(RAW_POLL_MS, 1000), 30000);

const MAX_CONSECUTIVE_FAILURES = 5;

// ── Live tick source priority ─────────────────────────────────────────────────
//
//   Priority 1 — Twelve Data WebSocket (when TWELVE_DATA_API_KEY + TWELVE_DATA_WS)
//   Priority 2 — Finnhub WebSocket (real-time trades)
//   Priority 3 — Finnhub REST poll (TP/SL + fallback broadcast when both WS quiet)
//
let finnhubActive = false;
/** When true, Twelve Data is the broadcast source; Finnhub ticks are not emitted (no duplicates). */
let twelveDataActive = false;

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
 * Finnhub REST batch — TP/SL, feed log, broadcast only when Finnhub WS is offline.
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
        setLastPrice(tick.symbol, price);
        positionsService
          .checkAndExecuteTPLS(tick.symbol, price)
          .catch((e) => console.warn('[TP/SL]', e.message));
        checkAndTriggerPendingOrders(tick.symbol, price).catch((e) => console.warn('[pendingOrders]', e.message));
      }
      if (!finnhubActive) {
        emitWithLog(tick, 'REST');
      }
    }
    return ticks.length === 0;
  } catch (err) {
    logFeedError({
      symbol:   symbols.join(','),
      endpoint: '/quote',
      error:    err.message,
      latencyMs: Date.now() - t0,
      status:   err.httpStatus ?? null,
    });
    return true;
  }
}

/**
 * Finnhub REST quote poller — TP/SL, feed log, fallback ticks when WS is down.
 */
async function runQuotePoller() {
  const apiKey = (process.env.FINNHUB_API_KEY || '').trim();
  if (!apiKey) {
    console.warn('[poller] FINNHUB_API_KEY not set — REST quote poller disabled (use Finnhub WS-only if keys are set elsewhere)');
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
    const reqPerMin = Math.round((60000 / QUOTE_POLL_INTERVAL_MS) * SUBSCRIBED_SYMBOLS.length);
    console.log(
      `[poller] Finnhub REST: ${SUBSCRIBED_SYMBOLS.length} symbols every ${QUOTE_POLL_INTERVAL_MS}ms (~${reqPerMin} REST req/min) — broadcasts when WS offline`
    );
    logFeedEvent('poller_start', {
      symbols: SUBSCRIBED_SYMBOLS,
      intervalMs: QUOTE_POLL_INTERVAL_MS,
      requestsPerMin: reqPerMin,
    });
  }
}

let feedBannerLogged = null;
function logFeedActive(name) {
  if (feedBannerLogged === name) return;
  feedBannerLogged = name;
  console.log(`[FEED] Active feed: ${name}`);
}

/**
 * Twelve Data WebSocket — preferred live ticks when configured.
 */
function runTwelveDataWebSocket() {
  const apiKey = (process.env.TWELVEDATA_API_KEY || process.env.TWELVE_DATA_API_KEY || '').trim();
  if (!apiKey) {
    return null;
  }
  const wsOff = ['0', 'false', 'no', 'off'].includes(String(process.env.TWELVE_DATA_WS || '').trim().toLowerCase());
  if (wsOff) {
    console.warn('[TwelveData] TWELVE_DATA_WS is off — skipping Twelve Data WebSocket');
    return null;
  }

  const client = createTwelveDataWebSocket({
    apiKey,
    symbols: SUBSCRIBED_SYMBOLS,
    onConnect: () => {
      console.log('[FEED] Twelve connected');
    },
    onTick: (tick) => {
      twelveDataActive = true;
      finnhubActive = false;
      logFeedActive('twelvedata');

      logMarketTick(tick, 'twelvedata_ws');
      logFeedTick({
        symbol: tick.symbol,
        price: tick.close ?? tick.price,
        providerTs: tick.datetime,
        latencyMs: tick.serverReceivedAt ? Date.now() - tick.serverReceivedAt : null,
        status: 200,
      });
      const price = tick.close ?? tick.price;
      if (tick.symbol && price != null) {
        setLastPrice(tick.symbol, price);
        positionsService
          .checkAndExecuteTPLS(tick.symbol, price)
          .catch((e) => console.warn('[TP/SL]', e.message));
        checkAndTriggerPendingOrders(tick.symbol, price).catch((e) => console.warn('[pendingOrders]', e.message));
      }

      emitWithLog(tick, 'TWELVEDATA');
    },
    onDisconnect: () => {
      twelveDataActive = false;
      feedBannerLogged = 'finnhub';
      console.log('[FEED] Twelve disconnected');
      console.log('[FEED] Active feed: finnhub');
    },
    onError: () => {
      twelveDataActive = false;
    },
  });

  return client;
}

/**
 * Finnhub WebSocket — live ticks when Twelve Data is not primary; REST poller fills when both WS quiet.
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
      if (twelveDataActive) {
        return;
      }

      // Mark Finnhub as active — suppresses REST-only broadcasting
      finnhubActive = true;
      logFeedActive('finnhub');

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
        setLastPrice(tick.symbol, price);
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
        console.warn(`[FINNHUB] Stream offline (${reason}) — REST poller will take over broadcasting`);
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
    console.log('[FINNHUB] WebSocket started (REST poller is fallback when WS offline)');
  }
}

const TICK_HEARTBEAT_MS = 1000;

/** Re-broadcast last known price every 1s so charts keep updating when the market is flat or WS reconnects. */
function startMarketTickHeartbeat() {
  setInterval(() => {
    for (const sym of SUBSCRIBED_SYMBOLS) {
      const p = getLastPrice(sym);
      if (p == null || !Number.isFinite(p)) continue;
      broadcastTick({
        symbol: sym,
        price: p,
        close: p,
        open: p,
        high: p,
        low: p,
        volume: 0,
        datetime: new Date().toISOString(),
        source: 'heartbeat',
        heartbeat: true,
      });
    }
  }, TICK_HEARTBEAT_MS);
}

server.listen(PORT, async () => {
  console.log(`[server] Listening on port ${PORT}`);
  console.log(`[server] WebSocket: ws://localhost:${PORT}/ws`);
  console.log(`[server] Socket.IO datafeed: http://localhost:${PORT}/socket.io`);

  const hasMongoUriBoot =
    !!(process.env.CONNECTION_STRING && String(process.env.CONNECTION_STRING).trim()) ||
    !!(process.env.MONGODB_URI && String(process.env.MONGODB_URI).trim());
  if (!hasMongoUriBoot) {
    console.warn('[server] MongoDB not configured. Set CONNECTION_STRING in backend/.env');
    console.warn('[server] Trading, finance, and auth will return 500 until MongoDB is connected.');
  } else {
    try {
      const db = await getDb();
      await db.admin().command({ ping: 1 });
      console.log('[server] MongoDB connected');
      await applyPlatformEnvOverridesFromDatabase();
      refreshMarginRiskRuntime().catch((e) => {
        console.warn('[server] margin risk settings cache refresh failed:', e?.message || e);
      });
      financialTransactionService.tryEnsureWalletLedgerUniqueIndexOnce().catch((e) => {
        console.warn('[server] WALLET ledger index ensure skipped/failed:', e?.message || e);
      });
    } catch (err) {
      console.error('[server] MongoDB connection failed:', err.message);
      console.error('[server] Fix: Check CONNECTION_STRING in backend/.env. Run: npm run check-mongo');
    }
  }

  maintenanceService.refreshCache().catch((e) => {
    console.warn('[maintenance] initial cache refresh failed:', e?.message || e);
  });
  maintenanceService.startMaintenanceScheduler();

  runTwelveDataWebSocket();
  runFinnhubWebSocket();
  runQuotePoller();
  startMarketTickHeartbeat();

  startDailyWalletLedgerReconciliation();
});
