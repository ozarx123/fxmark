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
    cors: socketCors,
    // Start with polling for reliable session handshake.
    // Upgrade to WebSocket is attempted automatically by the client; the server
    // allows it but does not force it — prevents upgrade failures from spamming
    // the console when the raw WS handshake is blocked by a proxy.
    transports: ['polling', 'websocket'],
    allowUpgrades: true,
    allowEIO3: true,
    pingTimeout: 20000,
    pingInterval: 25000,
    upgradeTimeout: 10000,
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
    next();
  });

  io.on('connection', async (socket) => {
    socket.on('ping', () => socket.emit('pong'));
    if (socket.auth && socket.userId) {
      socket.join(`user:${socket.userId}`);
      try {
        const { emitTradeUpdate } = await import('./services/tradeEvents.js');
        emitTradeUpdate(socket.userId, null);
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

// ── Tick rate limiter & deduplication ─────────────────────────────────────────
//
// Goals:
//   1. Skip identical prices — no chart update needed, no wasted serialization.
//   2. Rate-limit bursts — Finnhub can fire multiple ticks within 1–5 ms.
//      Buffer them for MIN_EMIT_INTERVAL_MS and emit only the LATEST price.
//      This is "latest-wins" — correct for price feeds (we want current, not queued).
//
// Architecture:
//   broadcastTick(tick)
//     → normalizeTick()          [validate + round]
//     → same-price check         [TICK_SKIPPED_SAME_PRICE]
//     → schedule / update buffer [TICK_BUFFERED | immediate flush]
//     → flushTick()              [actual wss + io.emit]
//
// Per-symbol state is kept in `tickState` Map — never grows beyond the number
// of subscribed symbols (typically 1–8), so memory impact is negligible.

const MIN_EMIT_INTERVAL_MS = 20; // max 50 ticks/sec per symbol

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

/** Send the latest buffered tick to all connected clients */
function flushTick(symbol, state) {
  state.flushTimer = null;
  const data = state.bufferedTick;
  if (!data) return;

  state.bufferedTick  = null;
  state.lastPrice     = data.price;
  state.lastEmitAt    = Date.now();

  if (wss) {
    const payload = JSON.stringify({ type: 'tick', data });
    wss.clients.forEach((client) => {
      if (client.readyState === 1) client.send(payload);
    });
  }
  if (io) io.emit('tick', data);
}

/**
 * Broadcast tick (quote) update to all connected clients.
 *
 * Applies in order:
 *   1. normalizeTick  — validate, round prices
 *   2. same-price dedup  — drop if price unchanged
 *   3. rate limiter   — hold-and-replace buffer, emit at ≤50 ticks/sec
 *
 * @param {Object} tick - { symbol, price, open, high, low, close, volume, datetime, source, … }
 */
export function broadcastTick(tick) {
  const data = normalizeTick(tick);
  if (!data) return;

  const state = getTickState(data.symbol);

  // ── 1. Same-price deduplication ──────────────────────────────────────────
  if (state.lastPrice === data.price) {
    console.log(`TICK_SKIPPED_SAME_PRICE ${data.symbol} ${data.price}`);
    return;
  }

  // ── 2. Update the buffer with the latest tick ─────────────────────────────
  state.bufferedTick = data;

  // ── 3. Rate limiter ───────────────────────────────────────────────────────
  // If a flush is already pending, the new price is stored in the buffer and
  // will be picked up when the timer fires — no extra timer needed.
  if (state.flushTimer !== null) {
    console.log(`TICK_BUFFERED ${data.symbol} ${data.price}`);
    return;
  }

  const sinceLastEmit = Date.now() - state.lastEmitAt;

  if (sinceLastEmit >= MIN_EMIT_INTERVAL_MS) {
    // Last emit was long enough ago — flush immediately (zero-delay setTimeout
    // keeps us non-blocking and consistent with the buffered path)
    state.flushTimer = setTimeout(() => flushTick(data.symbol, state), 0);
  } else {
    // Within the rate-limit window — wait out the remaining interval
    const delay = MIN_EMIT_INTERVAL_MS - sinceLastEmit;
    console.log(`TICK_BUFFERED ${data.symbol} ${data.price}`);
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
