/**
 * Liquidity provider and routing configuration
 * A-Book / B-Book, LP endpoints, symbols
 */
module.exports = {
  defaultRoute: process.env.LIQUIDITY_DEFAULT_ROUTE || 'a-book',
  symbols: process.env.LIQUIDITY_SYMBOLS
    ? process.env.LIQUIDITY_SYMBOLS.split(',')
    : ['EURUSD', 'GBPUSD', 'XAUUSD'],
  lpEndpoints: [],
};
