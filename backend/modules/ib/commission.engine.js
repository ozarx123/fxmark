/**
 * IB commission engine — calculate commission per trade by level/volume, persist, post to ledger
 */
import ibRepo from './ib.repository.js';
import levelCalculator from './level.calculator.js';
import ledgerService from '../finance/ledger.service.js';

/** Default rate per lot by level (USD). Level 1 = top IB. */
const DEFAULT_RATE_PER_LOT_BY_LEVEL = {
  1: 7,
  2: 5,
  3: 3,
  4: 2,
  5: 1,
};

/**
 * Calculate commission for one trade and one IB, persist as pending.
 * @param {object} trade - { id?, volume, symbol?, currency? } (volume in lots)
 * @param {string} ibId - IB profile id or userId
 * @param {string} [clientUserId] - client who did the trade (for attribution)
 * @returns {Promise<{ amount: number, currency: string, commissionId: string }>}
 */
async function calculate(trade, ibId, clientUserId = null) {
  const profile = await ibRepo.getProfileById(ibId) || await ibRepo.getProfileByUserId(ibId);
  if (!profile) {
    return { amount: 0, currency: 'USD', commissionId: null };
  }

  const level = await levelCalculator.getLevel(profile.userId);
  const ratePerLot = profile.ratePerLot ?? DEFAULT_RATE_PER_LOT_BY_LEVEL[level] ?? DEFAULT_RATE_PER_LOT_BY_LEVEL[1];
  const volumeLots = Number(trade.volume) || 0;
  const amount = Math.round((volumeLots * ratePerLot) * 100) / 100;
  const currency = trade.currency || profile.currency || 'USD';

  if (amount <= 0) {
    return { amount: 0, currency, commissionId: null };
  }

  const commissionId = await ibRepo.createCommission({
    ibId: profile.userId,
    tradeId: trade.id || null,
    clientUserId: clientUserId || null,
    volume: volumeLots,
    symbol: trade.symbol || null,
    ratePerLot: ratePerLot,
    amount,
    currency,
  });

  try {
    await ledgerService.postCommissionEarned(profile.userId, amount, currency, commissionId, clientUserId);
  } catch (e) {
    console.warn('[ib] Ledger post commission earned failed:', e.message);
  }

  return { amount, currency, commissionId };
}

/**
 * Calculate and persist commission for multiple IBs (e.g. hierarchy: parent + uplines).
 * @param {object} trade
 * @param {string[]} ibIds - list of IB user ids (e.g. [direct IB, parent IB, ...])
 * @param {string} [clientUserId]
 */
async function calculateForHierarchy(trade, ibIds, clientUserId = null) {
  const results = [];
  for (const ibId of ibIds) {
    const r = await calculate(trade, ibId, clientUserId);
    if (r.commissionId) results.push({ ibId, ...r });
  }
  return results;
}

export default { calculate, calculateForHierarchy, DEFAULT_RATE_PER_LOT_BY_LEVEL };
