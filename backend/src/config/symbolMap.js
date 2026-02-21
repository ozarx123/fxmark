/**
 * Symbol mapping from internal format (EURUSD, XAUUSD) to Twelve Data provider format (EUR/USD, XAU/USD).
 * Use UTC for all timestamps.
 */
export const SYMBOL_MAP = {
  XAUUSD: 'XAU/USD',
  EURUSD: 'EUR/USD',
  GBPUSD: 'GBP/USD',
  USDJPY: 'USD/JPY',
  USDCHF: 'USD/CHF',
  USDCAD: 'USD/CAD',
  AUDUSD: 'AUD/USD',
  NZDUSD: 'NZD/USD',
};

/** Supported timeframes: 1m, 5m, 15m, 1h, 1d */
export const VALID_TIMEFRAMES = ['1m', '5m', '15m', '1h', '1d'];

/** Map internal timeframe to Twelve Data interval */
export const TIMEFRAME_TO_INTERVAL = {
  '1m': '1min',
  '5m': '5min',
  '15m': '15min',
  '1h': '1h',
  '1d': '1day',
};

/**
 * Convert internal symbol to Twelve Data format
 * @param {string} internalSymbol - e.g. EURUSD, XAUUSD
 * @returns {string|null} Twelve Data symbol or null if unknown
 */
export function toTwelveDataSymbol(internalSymbol) {
  const key = String(internalSymbol || '').toUpperCase();
  return SYMBOL_MAP[key] ?? null;
}
