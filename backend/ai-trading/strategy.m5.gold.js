/**
 * M5 Gold strategy
 * AI/rule-based signals on 5m XAUUSD
 */
function getSignal(candles, params) {
  // TODO: indicators, entry/exit rules
  return { signal: 'none', sl: 0, tp: 0 };
}

module.exports = { getSignal };
