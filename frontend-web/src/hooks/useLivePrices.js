import { useState, useEffect } from 'react';
import { subscribeTick } from '../lib/datafeedSocket.js';

/** Normalize symbol for matching (EUR/USD -> EURUSD) */
function toInternal(s) {
  return String(s || '').replace(/\//g, '').toUpperCase();
}

/**
 * useLivePrices — subscribe to Socket.IO datafeed ticks and store latest price per symbol.
 * Used for real-time P&L on open positions.
 * @returns {{ prices: Record<string, number>, lastUpdate: Date|null }}
 */
export function useLivePrices() {
  const [prices, setPrices] = useState({});
  const [lastUpdate, setLastUpdate] = useState(null);

  useEffect(() => {
    const unsubTick = subscribeTick((tickData) => {
      if (!tickData || typeof tickData !== 'object') return;
      const { symbol, close, price } = tickData;
      const p = close ?? price;
      if (symbol && Number.isFinite(Number(p))) {
        setPrices((prev) => ({ ...prev, [symbol]: Number(p) }));
        setLastUpdate(new Date());
      }
    });
    return () => unsubTick();
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
