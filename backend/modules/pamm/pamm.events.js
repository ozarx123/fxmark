/**
 * PAMM real-time events — emit to Socket.IO when profit/earnings (realizedPnl) are updated.
 * Clients listening for 'pamm:allocation_update' can refetch allocations / fund detail.
 */

/** Emit pamm:allocation_update to affected users (followers + manager) so they get real-time profit/earnings */
export async function emitPammAllocationUpdate(fundId, followerIds, managerId) {
  let io;
  try {
    const mod = await import('../../src/websocket.js');
    io = mod.getTradeIo();
  } catch {
    return;
  }
  if (!io) return;
  const at = new Date().toISOString();
  const payload = { fundId, at };
  const userIds = new Set([...(followerIds || []), ...(managerId ? [managerId] : [])]);
  for (const userId of userIds) {
    if (userId) io.to(`user:${userId}`).emit('pamm:allocation_update', payload);
  }
}
