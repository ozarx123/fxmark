import { WebSocketServer } from 'ws';

let wss = null;

/**
 * Initialize WebSocket server to broadcast tick and candle updates
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

  return wss;
}

/**
 * Broadcast tick (quote) update to all connected clients
 * @param {Object} tick - { symbol, price, open, high, low, close, volume, datetime }
 */
export function broadcastTick(tick) {
  if (!wss) return;
  const payload = JSON.stringify({ type: 'tick', data: tick });
  wss.clients.forEach((client) => {
    if (client.readyState === 1) client.send(payload);
  });
}

/**
 * Broadcast candle update to all connected clients
 * @param {Object} candle - { symbol, tf, time, open, high, low, close, volume }
 */
export function broadcastCandle(candle) {
  if (!wss) return;
  const payload = JSON.stringify({ type: 'candle', data: candle });
  wss.clients.forEach((client) => {
    if (client.readyState === 1) client.send(payload);
  });
}
