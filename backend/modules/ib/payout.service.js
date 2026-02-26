/**
 * IB payout service — aggregate commission balance, request payout, post to ledger
 */
import ibRepo from './ib.repository.js';
import ledgerService from '../finance/ledger.service.js';

/**
 * Get pending (unpaid) and paid totals for an IB
 */
async function getBalance(ibId) {
  const profile = await ibRepo.getProfileById(ibId) || await ibRepo.getProfileByUserId(ibId);
  const effectiveId = profile ? profile.userId : ibId;
  const { total: pending } = await ibRepo.sumPendingByIb(effectiveId);
  const paid = await ibRepo.sumPaidByIb(effectiveId);
  return {
    pending: Math.round(pending * 100) / 100,
    paid: Math.round(paid * 100) / 100,
    currency: profile?.currency || 'USD',
  };
}

/**
 * Request payout: create payout record for (full) pending, mark commissions as paid
 * @param {string} ibId
 * @param {number} [amount] - if omitted, pays full pending; if provided must be <= pending
 */
async function requestPayout(ibId, amount) {
  const profile = await ibRepo.getProfileById(ibId) || await ibRepo.getProfileByUserId(ibId);
  if (!profile) {
    const err = new Error('IB profile not found');
    err.statusCode = 404;
    throw err;
  }
  const effectiveId = profile.userId;
  const { total: pending } = await ibRepo.sumPendingByIb(effectiveId);
  const payoutAmount = amount != null ? Number(amount) : pending;
  if (payoutAmount <= 0) {
    const err = new Error('No pending commission or invalid amount');
    err.statusCode = 400;
    throw err;
  }
  if (payoutAmount > pending) {
    const err = new Error('Amount exceeds pending commission');
    err.statusCode = 400;
    throw err;
  }
  if (payoutAmount < pending) {
    const err = new Error('Partial payout not supported; request full pending amount or omit amount');
    err.statusCode = 400;
    throw err;
  }

  const payoutId = await ibRepo.createPayout({
    ibId: effectiveId,
    amount: payoutAmount,
    currency: profile.currency || 'USD',
  });
  await ibRepo.markAllPendingPaid(effectiveId, payoutId);
  try {
    await ledgerService.postCommissionPaid(effectiveId, payoutAmount, profile.currency || 'USD', payoutId);
  } catch (e) {
    console.warn('[ib] Ledger post failed:', e.message);
  }
  const payout = await ibRepo.getPayoutById(payoutId, effectiveId);
  return {
    id: payoutId,
    status: 'pending',
    amount: payoutAmount,
    currency: payout.currency,
  };
}

async function listCommissions(ibId, options = {}) {
  const profile = await ibRepo.getProfileById(ibId) || await ibRepo.getProfileByUserId(ibId);
  const effectiveId = profile ? profile.userId : ibId;
  return ibRepo.listCommissionsByIb(effectiveId, options);
}

async function listPayouts(ibId, options = {}) {
  const profile = await ibRepo.getProfileById(ibId) || await ibRepo.getProfileByUserId(ibId);
  const effectiveId = profile ? profile.userId : ibId;
  return ibRepo.listPayoutsByIb(effectiveId, options);
}

async function listReferrals(ibId, options = {}) {
  const profile = await ibRepo.getProfileById(ibId) || await ibRepo.getProfileByUserId(ibId);
  const effectiveId = profile ? profile.userId : ibId;
  return ibRepo.listReferralsByIb(effectiveId, options);
}

async function listReferralJoinings(ibId, options = {}) {
  const profile = await ibRepo.getProfileById(ibId) || await ibRepo.getProfileByUserId(ibId);
  const effectiveId = profile ? profile.userId : ibId;
  return ibRepo.listReferralJoiningsByIb(effectiveId, options);
}

/**
 * Get IB stats: referral count, earnings (pending + paid), joinings
 */
async function getStats(ibId) {
  const profile = await ibRepo.getProfileById(ibId) || await ibRepo.getProfileByUserId(ibId);
  const effectiveId = profile ? profile.userId : ibId;
  const [balance, referralCount] = await Promise.all([
    getBalance(effectiveId),
    ibRepo.countReferralsByIb(effectiveId),
  ]);
  const totalEarnings = (balance.pending || 0) + (balance.paid || 0);
  return {
    referralCount: referralCount ?? 0,
    pending: balance.pending ?? 0,
    paid: balance.paid ?? 0,
    totalEarnings: Math.round(totalEarnings * 100) / 100,
    currency: balance.currency || 'USD',
  };
}

export default { getBalance, requestPayout, listCommissions, listPayouts, listReferrals, listReferralJoinings, getStats };
