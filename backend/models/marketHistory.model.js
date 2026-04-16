/**
 * Server-side XAUUSD (and future symbols) tick + OHLC history for internal charts and ML.
 * Run: node scripts/ensure-indexes.js
 */
export const TICKS_COLLECTION = 'market_ticks';

export const ticksIndexes = [
  { keys: { symbol: 1, ts: 1 }, options: { name: 'market_ticks_symbol_ts' } },
];

export const OHLC_COLLECTION = 'market_ohlc_bars';

export const ohlcIndexes = [
  {
    keys: { symbol: 1, tf: 1, time: 1 },
    options: { unique: true, name: 'market_ohlc_symbol_tf_time' },
  },
];
