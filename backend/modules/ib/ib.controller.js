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

async function listPammCommissions(req, res, next) {
  try {
    const rawId = req.user?.id;
    if (rawId == null) return res.status(401).json({ error: 'Unauthorized' });
    const userId = (rawId?.toString?.() ?? String(rawId)).trim();
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const profile = await ibRepo.getProfileByUserId(userId) || await ibRepo.getProfileById(userId);
    const effectiveIbId = profile?.userId != null ? String(profile.userId) : userId;

    const { from, to, limit, startDate } = req.query;
    const options = {};
    if (from) options.from = new Date(from);
    if (to) options.to = new Date(to);
    if (limit != null) options.limit = Math.min(parseInt(limit, 10) || 100, 200);
    if (startDate) options.startDate = String(startDate).trim();
    const payload = await ibRepo.listPammIbCommissionLogsWithInvestorDetails(effectiveIbId, options);
    res.json(payload);
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
  listPammCommissions,
};
