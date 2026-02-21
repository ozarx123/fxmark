/**
 * P&L service
 * Realized/unrealized P&L by user, period
 */
async function getPnl(userId, from, to) {
  return { realized: 0, unrealized: 0, currency: 'USD' };
}

module.exports = { getPnl };
