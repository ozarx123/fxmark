/**
 * FIX ExecutionReport handler
 * Parse fill/partial fill/reject, update order state, notify
 */
const fixRouter = require('./fix.router');

function handle(fixMessage) {
  const parsed = fixRouter.routeExecutionReport(fixMessage);
  // TODO: persist order state, update position, emit event
  return parsed;
}

module.exports = { handle };
