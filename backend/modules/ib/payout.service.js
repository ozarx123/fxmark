/**
 * IB payout service
 * Aggregate commission, payout to IB wallet
 */
async function getBalance(ibId) {
  return { pending: 0, paid: 0 };
}

async function requestPayout(ibId, amount) {
  return { id: '', status: 'pending' };
}

module.exports = { getBalance, requestPayout };
