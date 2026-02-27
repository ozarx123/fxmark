import { useMemo } from 'react';
import { useMarketDataContext } from '../context/MarketDataContext.jsx';

/** Normalize symbol for matching (EUR/USD -> EURUSD) */
function toInternal(s) {
  return String(s || '').replace(/\//g, '').toUpperCase();
}

/**
 * useLivePrices — consume prices from the central market data pool.
 * Used for real-time P&L on open positions.
 * @returns {{ prices: Record<string, number>, lastUpdate: Date|null, connected: boolean }}
 */
export function useLivePrices() {
  const { ticks, lastUpdate, connected } = useMarketDataContext();
  const prices = useMemo(() => {
    const out = {};
    for (const [sym, t] of Object.entries(ticks)) {
      const p = t?.close ?? t?.price;
      if (Number.isFinite(p)) out[sym] = p;
    }
    return out;
  }, [ticks]);
  return { prices, lastUpdate, connected };
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
