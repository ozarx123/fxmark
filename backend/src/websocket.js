import { WebSocketServer } from 'ws';
import { Server as SocketIOServer } from 'socket.io';
import jwtStrategy from '../modules/auth/jwt.strategy.js';

let wss = null;
let io = null;

/** Get Socket.IO instance for trade events (user-specific emit) */
export function getTradeIo() {
  return io;
}

/**
 * Initialize WebSocket and Socket.IO servers for datafeed (tick + candle broadcasts)
 * @param {import('http').Server} server - HTTP server to attach to
 * @param {object} [options]
 * @param {string[]|null} [options.corsOrigins] - When set, same-origin policy as HTTP CORS; otherwise `*` (dev only).
 */
export function initWebSocket(server, options = {}) {
  const { corsOrigins } = options;
  const socketCors =
    corsOrigins && corsOrigins.length > 0
      ? { origin: corsOrigins, methods: ['GET', 'POST'], credentials: true }
      : { origin: '*' };
  wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws) => {
    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong' }));
        }
      } catch {
        // ignore invalid messages
      }
    });
  });

  io = new SocketIOServer(server, {
    path: '/socket.io',
    // Match /socket.io and /socket.io/ so path checks succeed behind varied proxies.
    addTrailingSlash: false,
    cors: socketCors,
    // Polling first matches client: avoids Engine.IO 400 when websocket transport hits HTTP GET without Upgrade.
    transports: ['polling', 'websocket'],
    allowUpgrades: true,
    allowEIO3: true,
    pingTimeout: 20000,
    pingInterval: 25000,
    upgradeTimeout: 10000,
    perMessageDeflate: false,
  });

  // Auth: verify JWT, join user to room for trade updates
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace('Bearer ', '');
    if (!token) {
      socket.auth = false;
      return next();
    }
    const payload = jwtStrategy.decode(token);
    if (!payload?.id) {
      socket.auth = false;
      return next();
    }
    socket.userId = payload.id;
    socket.auth = true;
    const aid = socket.handshake.auth?.accountId;
    socket.tradingAccountId = aid != null && String(aid).trim() ? String(aid).trim() : null;
    next();
  });

  io.on('connection', async (socket) => {
    socket.on('ping', () => socket.emit('pong'));
    if (socket.auth && socket.userId) {
      socket.join(`user:${socket.userId}`);
      try {
        const { emitTradeUpdate } = await import('./services/tradeEvents.js');
        // Scope to active trading account when client sends handshake auth.accountId (avoids null = all accounts snapshot).
        if (socket.tradingAccountId) {
          emitTradeUpdate(socket.userId, socket.tradingAccountId);
        }
      } catch (e) {
        console.warn('[ws] Initial trade emit failed:', e.message);
      }
    }
  });

  return { wss, io };
}

// ── Price precision helpers ───────────────────────────────────────────────────
/**
 * Decimal places per instrument class:
 *   Gold / silver / commodities → 2 dp  (e.g. 3042.15)
 *   JPY crosses                 → 3 dp  (e.g. 153.420)
 *   All other forex             → 5 dp  (e.g. 1.08345)
 */
function getPrecision(symbol) {
  const s = String(symbol).toUpperCase();
  if (s.includes('XAU') || s.includes('XAG') || s.includes('GOLD')) return 2;
  if (s.endsWith('JPY')) return 3;
  return 5;
}

function roundPrice(rawPrice, symbol) {
  const prec = getPrecision(symbol);
  // Use toFixed then back to Number to strip floating-point artifacts
  // e.g. 5118.5599999999995 → 5118.56
  return Number(rawPrice.toFixed(prec));
}

// ── normalizeTick ─────────────────────────────────────────────────────────────
/** Validate, round, and shape a raw tick into the canonical internal format */
function normalizeTick(tick) {
  if (!tick || typeof tick !== 'object') return null;
  const rawPrice = Number(tick.close ?? tick.price);
  if (!tick.symbol || !Number.isFinite(rawPrice) || rawPrice <= 0) return null;

  const symbol = String(tick.symbol);
  const price  = roundPrice(rawPrice, symbol);
  const now    = Date.now();

  return {
    symbol,
    price,
    close:  price,
    open:   roundPrice(Number(tick.open)   || rawPrice, symbol),
    high:   roundPrice(Number(tick.high)   || rawPrice, symbol),
    low:    roundPrice(Number(tick.low)    || rawPrice, symbol),
    volume: Number(tick.volume) || 0,
    datetime:          tick.datetime        ?? new Date().toISOString(),
    source:            tick.source          || 'unknown',
    providerTs:        tick.providerTs      ?? null,
    serverReceivedAt:  tick.serverReceivedAt ?? now,
    serverBroadcastAt: now,
  };
}

// ── Live tick sanity filter (per symbol) — drop spikes / out-of-order before broadcast ──
const lastPrices = new Map();
const lastTsMap = new Map();

/** Provider time in ms (Finnhub WS uses `timestamp`; REST uses `providerTs`). */
function getTickTimestampMs(tick) {
  if (tick.providerTs != null && Number.isFinite(Number(tick.providerTs))) {
    const t = Number(tick.providerTs);
    return t < 1e12 ? t * 1000 : t;
  }
  if (tick.timestamp != null && Number.isFinite(Number(tick.timestamp))) {
    const t = Number(tick.timestamp);
    return t < 1e12 ? t * 1000 : t;
  }
  return Date.now();
}

// ── Tick rate limiter ─────────────────────────────────────────────────────────
//
// Bursts: buffer and emit at most ~50/sec per symbol (latest wins in buffer).
// Same-price ticks are still emitted (chart/UI need continuous updates).
// Heartbeat ticks bypass the throttle (see tick.heartbeat in broadcastTick).

const MIN_EMIT_INTERVAL_MS = 20; // max ~50 emits/sec per symbol (non-heartbeat)

/** @type {Map<string, { lastPrice: number|null, lastEmitAt: number, bufferedTick: object|null, flushTimer: NodeJS.Timeout|null }>} */
const tickState = new Map();

function getTickState(symbol) {
  let s = tickState.get(symbol);
  if (!s) {
    s = { lastPrice: null, lastEmitAt: 0, bufferedTick: null, flushTimer: null };
    tickState.set(symbol, s);
  }
  return s;
}

function emitRawTick(data) {
  if (wss) {
    const payload = JSON.stringify({ type: 'tick', data });
    wss.clients.forEach((client) => {
      if (client.readyState === 1) client.send(payload);
    });
  }
  if (io) io.emit('tick', data);
}

/** Send the latest buffered tick to all connected clients */
function flushTick(symbol, state) {
  state.flushTimer = null;
  const data = state.bufferedTick;
  if (!data) return;

  state.bufferedTick  = null;
  state.lastPrice     = data.price;
  state.lastEmitAt    = Date.now();

  emitRawTick(data);
}

/**
 * Broadcast tick (quote) update to all connected clients.
 *
 * Optional tick.heartbeat: emit immediately (1 Hz keepalive for charts when price is flat).
 * Otherwise: normalize → rate-limited buffer (≤~50/sec per symbol, latest wins).
 *
 * @param {Object} tick - { symbol, price, open, high, low, close, volume, datetime, source, heartbeat?, … }
 */
export function broadcastTick(tick) {
  const isHeartbeat = tick && tick.heartbeat === true;
  const data = normalizeTick(tick);
  if (!data) return;

  const symbol = data.symbol;
  const price = Number(data.price ?? data.close);

  if (!isHeartbeat) {
    const lastPrice = lastPrices.get(symbol);
    if (lastPrice != null && Number.isFinite(lastPrice)) {
      const diff = Math.abs(price - lastPrice);
      const upperSym = String(symbol).toUpperCase();
      const isGold = upperSym.includes('XAU') || upperSym.includes('GOLD');
      const MAX_MOVE = 10;
      if (isGold && diff > MAX_MOVE) {
        console.warn('[TICK FILTERED - SPIKE]', { symbol, price, lastPrice, diff });
        return;
      }
    }

    const ts = getTickTimestampMs(tick);
    const lastTs = lastTsMap.get(symbol);
    if (lastTs != null && ts < lastTs) {
      console.warn('[TICK FILTERED - OLD]', { symbol, ts, lastTs });
      return;
    }

    lastPrices.set(symbol, price);
    lastTsMap.set(symbol, ts);
  } else {
    const ts = Date.now();
    lastPrices.set(symbol, price);
    lastTsMap.set(symbol, ts);
  }

  if (isHeartbeat) {
    emitRawTick(data);
    const state = getTickState(data.symbol);
    state.lastPrice = data.price;
    state.lastEmitAt = Date.now();
    return;
  }

  const state = getTickState(data.symbol);

  state.bufferedTick = data;

  if (state.flushTimer !== null) {
    return;
  }

  const sinceLastEmit = Date.now() - state.lastEmitAt;

  if (sinceLastEmit >= MIN_EMIT_INTERVAL_MS) {
    state.flushTimer = setTimeout(() => flushTick(data.symbol, state), 0);
  } else {
    const delay = MIN_EMIT_INTERVAL_MS - sinceLastEmit;
    state.flushTimer = setTimeout(() => flushTick(data.symbol, state), delay);
  }
}

/**
 * Broadcast candle update to all connected clients (WebSocket + Socket.IO datafeed)
 * @param {Object} candle - { symbol, tf, time, open, high, low, close, volume }
 */
export function broadcastCandle(candle) {
  if (!candle || typeof candle !== 'object' || candle.symbol == null) return;
  const data = {
    symbol: String(candle.symbol),
    tf: candle.tf,
    time: candle.time,
    open: Number(candle.open) || 0,
    high: Number(candle.high) || 0,
    low: Number(candle.low) || 0,
    close: Number(candle.close) || 0,
    volume: Number(candle.volume) || 0,
  };
  if (wss) {
    const payload = JSON.stringify({ type: 'candle', data });
    wss.clients.forEach((client) => {
      if (client.readyState === 1) client.send(payload);
    });
  }
  if (io) io.emit('candle', data);
}
