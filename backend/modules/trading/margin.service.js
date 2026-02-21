/**
 * Margin service
 * Free margin, margin level, margin call
 */
async function getMargin(userId) {
  // TODO: balance, equity, open positions → free margin, level
  return {
    balance: 0,
    equity: 0,
    freeMargin: 0,
    marginLevel: 0,
  };
}

async function checkMargin(userId, symbol, volume) {
  // TODO: required margin for volume, compare with free
  return { allowed: true };
}

module.exports = { getMargin, checkMargin };
