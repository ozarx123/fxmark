/**
 * Display / doc mapping: internal symbol → human-readable pair (charts, UI).
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

/** Supported candle timeframes (Finnhub forex/candle resolutions). */
export const VALID_TIMEFRAMES = ['1m', '5m', '15m', '1h', '1d'];

/** Human-readable interval names (e.g. technical analysis). */
export const TIMEFRAME_TO_INTERVAL = {
  '1m': '1min',
  '5m': '5min',
  '15m': '15min',
  '1h': '1h',
  '1d': '1day',
};
