/**
 * Trade Manager / PAMM controller
 */
import pammService from './pamm.service.js';
import pammFlagsRepo from './pamm.flags.repository.js';
import featureFlagsService from '../feature-flags/feature-flags.service.js';

async function listManagers(req, res, next) {
  try {
    const isPublic = req.query.public !== 'false';
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
    const list = await pammService.listManagers({ isPublic, limit });
    res.json(list);
  } catch (e) {
    next(e);
  }
}

async function getMyManager(req, res, next) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const funds = await pammService.listMyFunds(userId);
    if (funds.length === 0) return res.status(404).json({ error: 'No fund yet. Create one first.' });
    res.json(funds[0]);
  } catch (e) {
    next(e);
  }
}

async function getMyFunds(req, res, next) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const funds = await pammService.listMyFunds(userId);
    res.json(funds);
  } catch (e) {
    next(e);
  }
}

async function getManager(req, res, next) {
  try {
    const { managerId } = req.params;
    const manager = await pammService.getManager(managerId);
    if (!manager) {
      return res.status(404).json({ error: 'Manager not found' });
    }
    res.json(manager);
  } catch (e) {
    next(e);
  }
}

async function getFundDetail(req, res, next) {
  try {
    const { fundId } = req.params;
    const userId = req.user?.id || null;
    const viewerRole = req.user?.role || 'user';
    const detail = await pammService.getFundDetail(fundId, userId, viewerRole);
    if (!detail) {
      return res.status(404).json({ error: 'Fund not found' });
    }
    res.json(detail);
  } catch (e) {
    next(e);
  }
}

async function registerAsManager(req, res, next) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const manager = await pammService.registerAsManager(userId, req.body);
    const stats = await pammService.getManagerStats(userId);
    res.status(201).json({ ...manager, ...stats });
  } catch (e) {
    next(e);
  }
}

async function createPammTradingAccount(req, res, next) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const { account } = await pammService.createPammTradingAccount(userId);
    res.status(201).json(account);
  } catch (e) {
    next(e);
  }
}

async function getPammTradingAccount(req, res, next) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const fundId = req.query.fundId || null;
    const listAll = req.query.list === 'true';
    if (listAll) {
      const list = await pammService.listPammTradingAccounts(userId);
      res.json(list);
      return;
    }
    const account = await pammService.getPammTradingAccount(userId, fundId);
    res.json(account || null);
  } catch (e) {
    next(e);
  }
}

async function updateManagerProfile(req, res, next) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const manager = await pammService.updateManagerProfile(userId, req.body);
    res.json(manager);
  } catch (e) {
    next(e);
  }
}

async function follow(req, res, next) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const { managerId, allocatedBalance } = req.body;
    if (!managerId) {
      return res.status(400).json({ error: 'managerId is required' });
    }
    const result = await pammService.follow(userId, managerId, allocatedBalance);
    res.status(201).json(result);
  } catch (e) {
    next(e);
  }
}

async function acceptTerms(req, res, next) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const { fundId } = req.body;
    if (!fundId) {
      return res.status(400).json({ error: 'fundId is required' });
    }
    const ipAddress = req.ip || req.headers?.['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || null;
    const result = await pammService.recordAcceptance(userId, fundId, ipAddress);
    res.status(201).json(result);
  } catch (e) {
    next(e);
  }
}

async function unfollow(req, res, next) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const { allocationId } = req.body;
    if (!allocationId) {
      return res.status(400).json({ error: 'allocationId is required' });
    }
    const result = await pammService.unfollow(userId, allocationId);
    res.json(result);
  } catch (e) {
    next(e);
  }
}

async function addFunds(req, res, next) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized', reason: 'user_id_missing_after_auth' });
    }
    let { allocationId, amount } = req.body || {};
    allocationId = allocationId != null ? String(allocationId).trim() : '';
    if (!allocationId) return res.status(400).json({ error: 'allocationId is required' });
    const result = await pammService.addFunds(userId, allocationId, amount);
    res.json(result);
  } catch (e) {
    next(e);
  }
}

async function withdraw(req, res, next) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    let { allocationId, amount } = req.body || {};
    allocationId = allocationId != null ? String(allocationId).trim() : '';
    if (!allocationId) {
      return res.status(400).json({ error: 'allocationId is required' });
    }
    const result = await pammService.requestWithdraw(userId, allocationId, amount);
    res.json(result);
  } catch (e) {
    next(e);
  }
}

async function getMyAllocations(req, res, next) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const status = req.query.status; // active | closed | withdrawing
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
    const list = await pammService.getMyAllocations(userId, { status, limit });
    res.json(list);
  } catch (e) {
    next(e);
  }
}

async function getMyFollowerTrades(req, res, next) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
    const list = await pammService.getMyFollowerTrades(userId, { limit });
    res.json(list);
  } catch (e) {
    next(e);
  }
}

async function getMyInvestors(req, res, next) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const fundId = req.query.fundId || null;
    const funds = await pammService.listMyFunds(userId);
    const targetFundId = fundId || (funds[0]?.id);
    if (!targetFundId) return res.json([]);
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
    const list = await pammService.getMyInvestors(targetFundId, { limit });
    res.json(list);
  } catch (e) {
    next(e);
  }
}

async function getInvestorDetail(req, res, next) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const fundId = req.query.fundId || null;
    const followerId = req.query.followerId || null;
    if (!fundId || !followerId) return res.status(400).json({ error: 'fundId and followerId required' });
    const detail = await pammService.getInvestorDetail(fundId, followerId, userId);
    if (!detail) return res.status(404).json({ error: 'Investor not found or access denied' });
    res.json(detail);
  } catch (e) {
    next(e);
  }
}

async function getMyTrades(req, res, next) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const fundId = req.query.fundId || null;
    const funds = await pammService.listMyFunds(userId);
    const targetFundId = fundId || (funds[0]?.id);
    if (!targetFundId) return res.json([]);
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
    const symbol = req.query.symbol;
    const list = await pammService.getTrades(targetFundId, { limit, symbol });
    res.json(list);
  } catch (e) {
    next(e);
  }
}

async function getTrades(req, res, next) {
  try {
    const { managerId } = req.params;
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
    const symbol = req.query.symbol;
    const list = await pammService.getTrades(managerId, { limit, symbol });
    res.json(list);
  } catch (e) {
    next(e);
  }
}

async function getConfig(req, res, next) {
  try {
    const globalKillSwitch = await featureFlagsService.isFeatureEnabled('pamm_global_kill_switch', {
      defaultValue: false,
      envVar: 'FEATURE_PAMM_GLOBAL_KILL_SWITCH',
    });
    const legacyKillSwitch = await pammFlagsRepo.getFlag('pamm_global_kill_switch', false);
    const killSwitch = globalKillSwitch || legacyKillSwitch;
    const envEnabled = process.env.PAMM_ENABLED !== 'false';
    const enabledForUsers = envEnabled && !killSwitch;
    res.json({
      enabledForUsers,
      message: enabledForUsers ? 'PAMM is enabled for users.' : 'PAMM is temporarily disabled for users.',
    });
  } catch (e) {
    next(e);
  }
}

export default {
  listManagers,
  getManager,
  getFundDetail,
  getMyManager,
  getMyFunds,
  registerAsManager,
  createPammTradingAccount,
  getPammTradingAccount,
  updateManagerProfile,
  follow,
  acceptTerms,
  unfollow,
  addFunds,
  withdraw,
  getMyAllocations,
  getMyFollowerTrades,
  getMyInvestors,
  getInvestorDetail,
  getMyTrades,
  getTrades,
  getConfig,
};
