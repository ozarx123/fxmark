/**
 * Shared unrealized P&L math for positions, account summary, and risk checks.
 * Must match positions.service close P&L convention.
 */

/** XAU/USD and GOLD: 100 oz per lot. All other symbols: 100k units (forex). */
export function getContractSize(symbol) {
  const s = String(symbol || '').toUpperCase();
  return s.includes('XAU') || s === 'GOLD' ? 100 : 100000;
}

export function normalizeSymbolKey(s) {
  return String(s || '').replace(/\//g, '').replace(/\s/g, '').toUpperCase();
}

/**
 * Unrealized P&L in account currency (USD): mark vs open, signed by side.
 * @param {object} pos - openPrice, volume|lots, side|type, symbol
 * @param {number|null|undefined} markPrice - current market; null/invalid → 0 contribution
 */
export function computeUnrealizedPnl(pos, markPrice) {
  const open = Number(pos.openPrice) || 0;
  const vol = Number(pos.volume ?? pos.lots) || 0;
  const mark = Number(markPrice);
  if (!open || !vol || !Number.isFinite(mark)) return 0;
  const contractSize = getContractSize(pos.symbol);
  const diff = mark - open;
  const side = String(pos.side ?? pos.type ?? '').toLowerCase();
  return (side === 'sell' ? -diff : diff) * vol * contractSize;
}
