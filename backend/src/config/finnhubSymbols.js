/**
 * Internal symbol → Finnhub OANDA symbol (REST quote + forex candle + WebSocket).
 */
export const TO_FINNHUB = {
  XAUUSD: 'OANDA:XAU_USD',
  EURUSD: 'OANDA:EUR_USD',
  GBPUSD: 'OANDA:GBP_USD',
  USDJPY: 'OANDA:USD_JPY',
  USDCHF: 'OANDA:USD_CHF',
  USDCAD: 'OANDA:USD_CAD',
  AUDUSD: 'OANDA:AUD_USD',
  NZDUSD: 'OANDA:NZD_USD',
};

/** Reverse map: Finnhub symbol → internal symbol */
export const FROM_FINNHUB = Object.fromEntries(
  Object.entries(TO_FINNHUB).map(([internal, fh]) => [fh, internal])
);

export function toFinnhubSymbol(internalSymbol) {
  const key = String(internalSymbol || '').toUpperCase();
  return TO_FINNHUB[key] ?? null;
}
