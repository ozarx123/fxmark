import WebSocket from 'ws';
import { SYMBOL_MAP } from '../config/symbolMap.js';

const WS_URL = 'wss://ws.twelvedata.com/v1';

/**
 * Twelve Data WebSocket client for real-time price streaming.
 * Connects to wss://ws.twelvedata.com/v1, subscribes to symbols, and forwards ticks.
 * @param {Object} opts
 * @param {string} opts.apiKey - Twelve Data API key
 * @param {string[]} [opts.symbols] - Internal symbols (EURUSD, XAUUSD, ...). Default: all from SYMBOL_MAP
 * @param {function(tick)} opts.onTick - Callback when price update received
 * @param {function(err)} [opts.onError] - Callback on error
 */
export function createTwelveDataWebSocket({ apiKey, symbols, onTick, onError }) {
  const symbolList = symbols ?? Object.keys(SYMBOL_MAP);
  const twelveSymbols = symbolList
    .map((s) => SYMBOL_MAP[s.toUpperCase()])
    .filter(Boolean);
  if (twelveSymbols.length === 0) {
    onError?.(new Error('No valid symbols for WebSocket'));
    return null;
  }

  const url = `${WS_URL}?apikey=${apiKey}`;
  const ws = new WebSocket(url);

  ws.on('open', () => {
    const payload = {
      action: 'subscribe',
      params: {
        symbols: twelveSymbols.join(','),
      },
    };
    ws.send(JSON.stringify(payload));
    console.log('[twelveDataWS] Connected, subscribed to', twelveSymbols.join(', '));
  });

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      const event = msg.event || msg.type;
      if ((event === 'price' || event === 'quote') && msg.symbol) {
        const d = msg;
        const symbol = (d.symbol || '').replace(/\//g, '').toUpperCase();
        const price = parseFloat(d.price ?? d.close ?? d.c ?? 0);
        if (symbol && Number.isFinite(price)) {
          onTick({
            symbol,
            price,
            close: price,
            open: parseFloat(d.open ?? d.o ?? 0),
            high: parseFloat(d.high ?? d.h ?? 0),
            low: parseFloat(d.low ?? d.l ?? 0),
            volume: parseFloat(d.volume ?? d.v ?? 0),
            datetime: d.datetime ?? d.t ?? new Date().toISOString(),
          });
        }
      } else if ((event === 'subscribe' || event === 'heartbeat') && msg.status === 'ok') {
        if (event === 'subscribe') console.log('[twelveDataWS] Subscription confirmed');
      } else if (msg.status === 'error') {
        console.error('[twelveDataWS]', msg.message || msg);
        onError?.(new Error(msg.message || 'WebSocket error'));
      }
    } catch (err) {
      // ignore parse errors
    }
  });

  ws.on('error', (err) => {
    console.error('[twelveDataWS]', err.message);
    onError?.(err);
  });

  ws.on('close', (code, reason) => {
    console.warn('[twelveDataWS] Closed', code, reason?.toString());
  });

  return {
    close: () => ws.close(),
    get readyState() {
      return ws.readyState;
    },
  };
}
