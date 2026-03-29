/**
 * In-process last trade/quote price per symbol (fed by market tick pipeline in src/index.js).
 * Used by trading account summary and equity logic so HTTP reads see the same marks as recent ticks.
 */

/** Canonical key: strip slashes/spaces, uppercase (e.g. EUR/USD → EURUSD). */
export function normalizeQuoteSymbol(symbol) {
  return String(symbol || '')
    .replace(/[\s/]/g, '')
    .toUpperCase();
}

/** @type {Map<string, number>} */
const lastByKey = new Map();

/**
 * Record latest price for a symbol (any display form).
 * @param {string} symbol
 * @param {number} price
 */
export function setLastPrice(symbol, price) {
  const p = Number(price);
  if (!Number.isFinite(p)) return;
  const key = normalizeQuoteSymbol(symbol);
  if (!key) return;
  lastByKey.set(key, p);
}

/**
 * @param {string} symbol
 * @returns {number|null}
 */
export function getLastPrice(symbol) {
  const key = normalizeQuoteSymbol(symbol);
  if (!key) return null;
  const p = lastByKey.get(key);
  return Number.isFinite(p) ? p : null;
}

/** For tests / diagnostics */
export function clearLastPrices() {
  lastByKey.clear();
}
