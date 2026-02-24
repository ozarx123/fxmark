/**
 * Admin controller
 * Leads, tickets, KYC override, PAMM privacy, broadcast, users, PAMM approval
 */
import userRepo from '../users/user.repository.js';
import userService from '../users/user.service.js';
import walletRepo from '../wallet/wallet.repository.js';
import pammRepo from '../pamm/pamm.repository.js';

async function getLeads(req, res, next) {
  try {
    res.json([]);
  } catch (e) {
    next(e);
  }
}

async function kycOverride(req, res, next) {
  try {
    res.json({ status: 'updated' });
  } catch (e) {
    next(e);
  }
}

async function pammPrivacy(req, res, next) {
  try {
    res.json({ status: 'updated' });
  } catch (e) {
    next(e);
  }
}

async function broadcast(req, res, next) {
  try {
    res.status(202).json({ campaignId: '', status: 'queued' });
  } catch (e) {
    next(e);
  }
}

async function listUsers(req, res, next) {
  try {
    const { role, kycStatus, search } = req.query;
    const list = await userRepo.list({ role, kycStatus, search });
    const withBalance = await Promise.all(
      list.map(async (u) => {
        const wallet = await walletRepo.getOrCreateWallet(u.id, 'USD');
        return {
          ...u,
          name: u.name || u.email?.split('@')[0] || '—',
          balance: (wallet?.balance ?? 0) + (wallet?.locked ?? 0),
          approvalStatus: u.kycStatus || 'pending',
        };
      })
    );
    res.json(withBalance);
  } catch (e) {
    next(e);
  }
}

async function updateUser(req, res, next) {
  try {
    const { id } = req.params;
    const { role, kycStatus } = req.body;
    const update = {};
    if (role !== undefined) update.role = role;
    if (kycStatus !== undefined) update.kycStatus = kycStatus;
    if (Object.keys(update).length === 0) {
      return res.status(400).json({ error: 'No role or kycStatus to update' });
    }
    const user = await userService.update(id, update);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({
      ...user,
      id: user.id,
      approvalStatus: user.kycStatus || 'pending',
    });
  } catch (e) {
    next(e);
  }
}

async function listPammManagers(req, res, next) {
  try {
    const { approvalStatus, limit } = req.query;
    const list = await pammRepo.listAllManagers({
      approvalStatus: approvalStatus || undefined,
      limit: Math.min(parseInt(limit, 10) || 100, 200),
    });
    res.json(list);
  } catch (e) {
    next(e);
  }
}

async function approvePammManager(req, res, next) {
  try {
    const { id } = req.params;
    const { approvalStatus } = req.body;
    if (!['approved', 'rejected'].includes(approvalStatus)) {
      return res.status(400).json({ error: 'approvalStatus must be approved or rejected' });
    }
    const manager = await pammRepo.updateManagerById(id, { approvalStatus });
    if (!manager) return res.status(404).json({ error: 'PAMM manager not found' });
    res.json(manager);
  } catch (e) {
    next(e);
  }
}

export default {
  getLeads,
  kycOverride,
  pammPrivacy,
  broadcast,
  listUsers,
  updateUser,
  listPammManagers,
  approvePammManager,
};
