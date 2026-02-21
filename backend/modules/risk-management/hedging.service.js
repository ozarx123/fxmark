/**
 * Hedging service
 * Hedge B-Book exposure to LP (FIX)
 */
const aBookRouter = require('./a-book.router');

async function hedge(symbol, side, volume) {
  // TODO: create hedge order, send via a-book
  return aBookRouter.route({ symbol, side, volume });
}

module.exports = { hedge };
