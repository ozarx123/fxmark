import { useMemo } from 'react';
import { useMarketDataContext } from '../context/MarketDataContext.jsx';

/** Normalize symbol for matching (EUR/USD -> EURUSD, xAUUSD -> XAUUSD) */
function toInternal(s) {
  return String(s || '').replace(/\//g, '').toUpperCase();
}

/** True if symbol is gold (XAU/USD or GOLD) for contract size / decimals */
function isGoldSymbol(sym) {
  const s = toInternal(sym);
  return s.includes('XAU') || s === 'GOLD';
}

/**
 * useLivePrices — consume prices from the central market data pool.
 * Used for real-time P&L on open positions.
 * @returns {{ prices: Record<string, number>, lastUpdate: Date|null, connected: boolean }}
 */
export function useLivePrices() {
  const { ticks, lastUpdate, connected } = useMarketDataContext();
  const { prices, latency } = useMemo(() => {
    const outPrices = {};
    const outLatency = {};
    for (const [sym, t] of Object.entries(ticks)) {
      const p = t?.close ?? t?.price;
      if (Number.isFinite(p)) outPrices[sym] = p;
      if (t?.latency) outLatency[sym] = t.latency;
    }
    return { prices: outPrices, latency: outLatency };
  }, [ticks]);
  return { prices, latency, lastUpdate, connected };
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
  const open = Number(pos.openPrice ?? pos.entryPrice) || 0;
  const vol = Number(pos.volume ?? pos.lots) || 0;
  if (!open || !vol || !currentPrice) return pos.pnl ?? 0;

  const isGold = isGoldSymbol(pos.symbol);
  const contractSize = isGold ? 100 : 100000; // 100 oz per lot for XAU/GOLD, 100k for forex

  const diff = currentPrice - open;
  const side = String(pos.side ?? pos.type ?? 'buy').toLowerCase();
  const pnl = (side === 'sell' ? -diff : diff) * vol * contractSize;
  return pnl;
}
