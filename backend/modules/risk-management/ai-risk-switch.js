/**
 * AI risk switch
 * Decide A-Book vs B-Book per order/symbol/client
 */
const aBookRouter = require('./a-book.router');
const bBookRouter = require('./b-book.router');

async function route(order, context) {
  // TODO: ML/model or rules: send to A-Book or B-Book
  const useABook = false; // placeholder
  return useABook ? aBookRouter.route(order) : bBookRouter.route(order);
}

module.exports = { route };
