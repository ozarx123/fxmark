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
 */
export function initWebSocket(server) {
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
    cors: { origin: '*' },
    transports: ['websocket', 'polling'],
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

/** Ensure tick is a plain object with symbol and price for serialization (Socket.IO/WS) */
function normalizeTick(tick) {
  if (!tick || typeof tick !== 'object') return null;
  const price = Number(tick.close ?? tick.price);
  if (!tick.symbol || !Number.isFinite(price)) return null;
  return {
    symbol: String(tick.symbol),
    price,
    close: price,
    open: Number(tick.open) || 0,
    high: Number(tick.high) || 0,
    low: Number(tick.low) || 0,
    volume: Number(tick.volume) || 0,
    datetime: tick.datetime ?? new Date().toISOString(),
  };
}

/**
 * Broadcast tick (quote) update to all connected clients (WebSocket + Socket.IO datafeed)
 * @param {Object} tick - { symbol, price, open, high, low, close, volume, datetime }
 */
export function broadcastTick(tick) {
  const data = normalizeTick(tick);
  if (!data) return;
  if (wss) {
    const payload = JSON.stringify({ type: 'tick', data });
    wss.clients.forEach((client) => {
      if (client.readyState === 1) client.send(payload);
    });
  }
  if (io) io.emit('tick', data);
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
