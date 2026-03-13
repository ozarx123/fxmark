/**
 * Position PnL and contract size — shared for panels and chart.
 * BUY:  PnL = (current - entry) × volume × contractSize
 * SELL: PnL = (entry - current) × volume × contractSize
 */

export const CONTRACT_SIZE = {
  XAUUSD: 100,
  GOLD: 100,
  DEFAULT: 100_000,
};

export function getContractSize(symbol) {
  const s = String(symbol ?? '').replace(/\//g, '').toUpperCase();
  if (s.includes('XAU') || s === 'GOLD') return CONTRACT_SIZE.XAUUSD;
  return CONTRACT_SIZE.DEFAULT;
}

export function computeFloatingPnL(position, currentPrice) {
  const entry = position.openPrice ?? position.open_price ?? 0;
  const volume = position.volume ?? position.lots ?? 0;
  const side = (position.side || position.type || 'BUY').toUpperCase();
  if (currentPrice == null || !entry || !volume) return null;
  const contractSize = getContractSize(position.symbol);
  const direction = side === 'BUY' ? 1 : -1;
  return direction * (currentPrice - entry) * volume * contractSize;
}

export function getPriceDifference(position, currentPrice) {
  const entry = position.openPrice ?? position.open_price ?? 0;
  const side = (position.side || position.type || 'BUY').toUpperCase();
  if (currentPrice == null || entry == null) return null;
  const diff = currentPrice - entry;
  return side === 'SELL' ? -diff : diff;
}
