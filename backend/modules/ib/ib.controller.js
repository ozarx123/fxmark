/**
 * IB controller — profile, balance, commissions, payouts
 */
import ibRepo from './ib.repository.js';
import payoutService from './payout.service.js';
import levelCalculator from './level.calculator.js';

async function getMyProfile(req, res, next) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const profile = await ibRepo.getProfileByUserId(userId);
    if (!profile) return res.status(404).json({ error: 'IB profile not found' });
    const level = await levelCalculator.getLevelByUserId(userId);
    res.json({ ...profile, level });
  } catch (e) {
    next(e);
  }
}

async function registerAsIb(req, res, next) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const { parentId, ratePerLot, currency } = req.body;
    const existing = await ibRepo.getProfileByUserId(userId);
    if (existing) {
      return res.status(409).json({ error: 'Already registered as IB' });
    }
    const id = await ibRepo.createProfile({
      userId,
      parentId: parentId || null,
      ratePerLot: ratePerLot != null ? Number(ratePerLot) : 7,
      currency: currency || 'USD',
    });
    const profile = await ibRepo.getProfileById(id);
    res.status(201).json(profile);
  } catch (e) {
    next(e);
  }
}

async function updateProfile(req, res, next) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const { ratePerLot, currency } = req.body;
    const update = {};
    if (ratePerLot != null) update.ratePerLot = Number(ratePerLot);
    if (currency != null) update.currency = currency;
    const profile = await ibRepo.updateProfile(userId, update);
    if (!profile) return res.status(404).json({ error: 'IB profile not found' });
    res.json(profile);
  } catch (e) {
    next(e);
  }
}

async function getBalance(req, res, next) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const balance = await payoutService.getBalance(userId);
    res.json(balance);
  } catch (e) {
    next(e);
  }
}

async function listCommissions(req, res, next) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const { status, from, to, limit } = req.query;
    const list = await payoutService.listCommissions(userId, {
      status,
      from,
      to,
      limit: Math.min(parseInt(limit, 10) || 50, 100),
    });
    res.json(list);
  } catch (e) {
    next(e);
  }
}

async function listPayouts(req, res, next) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const { status, limit } = req.query;
    const list = await payoutService.listPayouts(userId, {
      status,
      limit: Math.min(parseInt(limit, 10) || 50, 100),
    });
    res.json(list);
  } catch (e) {
    next(e);
  }
}

async function requestPayout(req, res, next) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const { amount } = req.body || {};
    const result = await payoutService.requestPayout(userId, amount);
    res.status(202).json(result);
  } catch (e) {
    next(e);
  }
}

async function listReferrals(req, res, next) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
    const list = await payoutService.listReferrals(userId, { limit });
    res.json(list);
  } catch (e) {
    next(e);
  }
}

async function listReferralJoinings(req, res, next) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
    const list = await payoutService.listReferralJoinings(userId, { limit });
    res.json(list);
  } catch (e) {
    next(e);
  }
}

async function getStats(req, res, next) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const stats = await payoutService.getStats(userId);
    res.json(stats);
  } catch (e) {
    next(e);
  }
}

export default {
  getMyProfile,
  registerAsIb,
  updateProfile,
  getBalance,
  listCommissions,
  listPayouts,
  requestPayout,
  listReferrals,
  listReferralJoinings,
  getStats,
};
