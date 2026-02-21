/**
 * Backtesting engine
 * Run strategy on historical data, output equity curve
 */
async function run(strategy, candles, params) {
  // TODO: iterate candles, apply strategy, record trades
  return { trades: [], equityCurve: [], sharpe: 0 };
}

module.exports = { run };
