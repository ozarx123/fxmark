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

/** Pip size for pip distance: XAU 1 (per 1 unit), JPY pairs 0.01, others 0.0001. */
export function getPipSize(symbol) {
  const s = String(symbol ?? '').replace(/\//g, '').toUpperCase();
  if (s.includes('XAU') || s === 'GOLD') return 1;
  if (s.includes('JPY')) return 0.01;
  return 0.0001;
}

/** Distance between two prices in pips. */
export function getPipDistance(priceA, priceB, symbol) {
  if (priceA == null || priceB == null || !Number.isFinite(Number(priceA)) || !Number.isFinite(Number(priceB))) return null;
  const pip = getPipSize(symbol);
  return Math.abs(Number(priceA) - Number(priceB)) / pip;
}

/**
 * Suggested volume (lots) from risk % of equity: riskAmount = equity * (riskPct/100),
 * loss per lot = |entry - sl| * contractSize, lots = riskAmount / lossPerLot.
 * @param {number} equity - Account equity
 * @param {number} riskPct - Risk percentage (e.g. 1 for 1%)
 * @param {number} entryPrice - Entry price
 * @param {number} slPrice - Stop loss price
 * @param {string} symbol - Symbol
 * @param {string} side - 'buy' or 'sell'
 * @returns {number|null} Lots or null if invalid
 */
export function volumeFromRiskPct(equity, riskPct, entryPrice, slPrice, symbol, side = 'buy') {
  if (!Number.isFinite(equity) || equity <= 0 || !Number.isFinite(riskPct) || riskPct <= 0) return null;
  if (!Number.isFinite(entryPrice) || !Number.isFinite(slPrice)) return null;
  const riskAmount = equity * (riskPct / 100);
  const contractSize = getContractSize(symbol);
  const lossPerLot = Math.abs(entryPrice - slPrice) * contractSize;
  if (lossPerLot <= 0) return null;
  const lots = riskAmount / lossPerLot;
  return Math.max(0, Math.min(lots, 100)); // clamp to 0–100 lots
}

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
