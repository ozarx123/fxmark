/**
 * Admin controller
 * Leads, tickets, KYC override, PAMM privacy, broadcast, users, PAMM approval, IB commission
 */
import userRepo from '../users/user.repository.js';
import userService from '../users/user.service.js';
import walletRepo from '../wallet/wallet.repository.js';
import ledgerService from '../finance/ledger.service.js';
import pammRepo from '../pamm/pamm.repository.js';
import ibRepo from '../ib/ib.repository.js';
import payoutService from '../ib/payout.service.js';

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

// ---------- IB commission (admin) ----------
async function getIbProfiles(req, res, next) {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 200);
    const list = await ibRepo.listAllProfiles({ limit });
    const withUser = await Promise.all(
      list.map(async (p) => {
        const u = await userRepo.findById(p.userId);
        return {
          ...p,
          email: u?.email ?? null,
          name: u?.name ?? null,
        };
      })
    );
    res.json(withUser);
  } catch (e) {
    next(e);
  }
}

async function getIbCommissions(req, res, next) {
  try {
    const { ibId, status, limit } = req.query;
    const list = await ibRepo.listCommissionsAll({
      ibId: ibId || undefined,
      status: status || undefined,
      limit: Math.min(parseInt(limit, 10) || 100, 500),
    });
    res.json(list);
  } catch (e) {
    next(e);
  }
}

async function getIbWallets(req, res, next) {
  try {
    const profiles = await ibRepo.listAllProfiles({ limit: 200 });
    const wallets = await Promise.all(
      profiles.map(async (p) => {
        const balance = await payoutService.getBalance(p.userId);
        const u = await userRepo.findById(p.userId);
        return {
          userId: p.userId,
          email: u?.email ?? null,
          ratePerLot: p.ratePerLot ?? null,
          currency: p.currency ?? 'USD',
          pending: balance.pending ?? 0,
          paid: balance.paid ?? 0,
          totalEarned: (balance.pending ?? 0) + (balance.paid ?? 0),
        };
      })
    );
    res.json(wallets);
  } catch (e) {
    next(e);
  }
}

async function getIbSettings(req, res, next) {
  try {
    const stored = await ibRepo.getSettings();
    const defaults = { 1: 7, 2: 5, 3: 3, 4: 2, 5: 1 };
    res.json({ ratePerLotByLevel: stored || defaults });
  } catch (e) {
    next(e);
  }
}

async function updateIbSettings(req, res, next) {
  try {
    const { ratePerLotByLevel } = req.body || {};
    if (!ratePerLotByLevel || typeof ratePerLotByLevel !== 'object') {
      return res.status(400).json({ error: 'ratePerLotByLevel object required (e.g. { 1: 7, 2: 5 })' });
    }
    const normalized = {};
    for (const [k, v] of Object.entries(ratePerLotByLevel)) {
      const level = parseInt(k, 10);
      if (level >= 1 && level <= 10 && Number.isFinite(Number(v))) {
        normalized[level] = Number(v);
      }
    }
    if (Object.keys(normalized).length === 0) {
      return res.status(400).json({ error: 'At least one level (1–10) with a number required' });
    }
    await ibRepo.updateSettings(normalized);
    res.json({ ratePerLotByLevel: normalized });
  } catch (e) {
    next(e);
  }
}

async function processIbPayout(req, res, next) {
  try {
    const { userId } = req.params;
    if (!userId) return res.status(400).json({ error: 'userId required' });
    const result = await payoutService.requestPayout(userId);
    res.status(202).json(result);
  } catch (e) {
    if (e.statusCode === 404) return res.status(404).json({ error: e.message });
    if (e.statusCode === 400) return res.status(400).json({ error: e.message });
    next(e);
  }
}

/** Superadmin only: add funds to a customer wallet */
async function addFundsToWallet(req, res, next) {
  try {
    const { userId } = req.params;
    const { amount, currency = 'USD', reference } = req.body;
    const amt = Number(amount);
    if (!userId || !Number.isFinite(amt) || amt <= 0) {
      return res.status(400).json({ error: 'userId and positive amount required' });
    }
    const user = await userRepo.findById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const txId = await walletRepo.createTransaction({
      userId,
      type: 'admin_credit',
      amount: amt,
      currency: currency || 'USD',
      status: 'completed',
      reference: reference || `Admin credit by ${req.user?.email || req.user?.id}`,
      completedAt: new Date(),
    });
    const wallet = await walletRepo.updateBalance(userId, currency || 'USD', amt);
    try {
      await ledgerService.postAdminCredit(userId, amt, currency || 'USD', txId);
    } catch (e) {
      console.warn('[admin] Ledger post admin credit failed:', e.message);
    }
    res.json({
      success: true,
      wallet: { balance: wallet.balance, currency: wallet.currency },
      message: `Added ${amt} ${currency || 'USD'} to ${user.email}`,
    });
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
  addFundsToWallet,
  getIbProfiles,
  getIbCommissions,
  getIbWallets,
  getIbSettings,
  updateIbSettings,
  processIbPayout,
};
