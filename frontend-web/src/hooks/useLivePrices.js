import { useState, useEffect } from 'react';

const WS_URL = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`;

/** Normalize symbol for matching (EUR/USD -> EURUSD) */
function toInternal(s) {
  return String(s || '').replace(/\//g, '').toUpperCase();
}

/**
 * useLivePrices — subscribe to WebSocket ticks and store latest price per symbol.
 * Used for real-time P&L on open positions.
 * @returns {{ prices: Record<string, number>, lastUpdate: Date|null }}
 */
export function useLivePrices() {
  const [prices, setPrices] = useState({});
  const [lastUpdate, setLastUpdate] = useState(null);

  const MAX_RECONNECT_FAILURES = 5;
  useEffect(() => {
    let ws = null;
    let reconnectFailures = 0;
    const connect = () => {
      if (reconnectFailures >= MAX_RECONNECT_FAILURES) return;
      ws = new WebSocket(WS_URL);
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type === 'tick' && msg.data) {
            const { symbol, close, price } = msg.data;
            const p = close ?? price;
            if (symbol && typeof p === 'number') {
              setPrices((prev) => ({ ...prev, [symbol]: p }));
              setLastUpdate(new Date());
              reconnectFailures = 0;
            }
          }
        } catch {
          // ignore
        }
      };
      ws.onclose = () => {
        reconnectFailures++;
        if (reconnectFailures < MAX_RECONNECT_FAILURES) {
          setTimeout(connect, 3000);
        }
      };
    };
    connect();
    return () => { if (ws) ws.close(); };
  }, []);

  return { prices, lastUpdate };
}

/**
 * Get current price for a symbol (display format EUR/USD or XAU/USD)
 */
export function getPriceForSymbol(prices, displaySymbol) {
  const internal = toInternal(displaySymbol);
  return prices[internal] ?? null;
}

/**
 * Compute P&L for a position given current price.
 * @param {Object} pos - { symbol, side, volume, openPrice }
 * @param {number} currentPrice
 * @returns {number} P&L in account currency (USD)
 */
export function computePnL(pos, currentPrice) {
  const open = Number(pos.openPrice) || 0;
  const vol = Number(pos.volume) || 0;
  if (!open || !vol || !currentPrice) return pos.pnl ?? 0;

  const sym = String(pos.symbol || '').toUpperCase();
  const isGold = sym.includes('XAU');
  const contractSize = isGold ? 100 : 100000; // 100 oz for gold, 100k for forex

  const diff = currentPrice - open;
  const pnl = (pos.side === 'sell' ? -diff : diff) * vol * contractSize;
  return pnl;
}
