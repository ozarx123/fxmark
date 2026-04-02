/**
 * Internal symbol (FXMARK) → Twelve Data WebSocket symbol (slash format).
 * @see https://twelvedata.com/docs/websocket/ws-real-time-price
 */
export const TO_TWELVEDATA = {
  XAUUSD: 'XAU/USD',
  EURUSD: 'EUR/USD',
  GBPUSD: 'GBP/USD',
  USDJPY: 'USD/JPY',
  USDCHF: 'USD/CHF',
  USDCAD: 'USD/CAD',
  AUDUSD: 'AUD/USD',
  NZDUSD: 'NZD/USD',
};

/** Twelve Data symbol string → internal symbol */
export const FROM_TWELVEDATA = Object.fromEntries(
  Object.entries(TO_TWELVEDATA).map(([internal, td]) => [td, internal])
);
