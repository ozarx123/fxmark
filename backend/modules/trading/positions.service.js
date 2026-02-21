/**
 * Positions service
 * Open/closed positions, P&L
 */
async function getOpenPositions(userId) {
  // TODO: from DB or execution layer
  return [];
}

async function getClosedPositions(userId, from, to) {
  return [];
}

async function closePosition(userId, positionId, volume) {
  // TODO: close full or partial
  return { status: 'closed' };
}

module.exports = { getOpenPositions, getClosedPositions, closePosition };
