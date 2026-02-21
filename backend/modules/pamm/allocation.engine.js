/**
 * PAMM allocation engine
 * Allocate new trades to followers by share
 */
async function allocate(trade, managerId) {
  // TODO: get follower shares, create mirror orders per follower
  return { allocated: [] };
}

module.exports = { allocate };
