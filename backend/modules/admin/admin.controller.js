/**
 * Admin controller
 * Leads, tickets, KYC override, PAMM privacy, broadcast, users, PAMM approval, IB commission, trading monitor
 */
import userRepo from '../users/user.repository.js';
import tradingAccountRepo from '../trading/trading-account.repository.js';
import positionsService from '../trading/positions.service.js';
import orderService from '../trading/order.service.js';
import userService from '../users/user.service.js';
import walletRepo from '../wallet/wallet.repository.js';
import ledgerService from '../finance/ledger.service.js';
import ibRepo from '../ib/ib.repository.js';
import ibHierarchy from '../ib/ib-hierarchy.service.js';
import levelCalculator from '../ib/level.calculator.js';
import payoutService from '../ib/payout.service.js';
import tradingLimitsRepo from './trading-limits.repository.js';
import executionModeService from '../trading/execution-mode.service.js';
import marginRiskSettingsRepo from '../trading/margin-risk-settings.repository.js';
import { refreshMarginRiskRuntime } from '../trading/margin-risk.runtime.js';
import audit from './audit.logs.js';
import paymentSettingsRepo from '../wallet/payment.settings.repository.js';
import withdrawalApprovalSettingsRepo from '../wallet/withdrawal-approval.settings.repository.js';
import pammRepo from '../pamm/pamm.repository.js';
import pammDistRunsRepo from '../pamm/pamm-distribution-runs.repository.js';
import * as bulkImportService from './bulk-import.service.js';
import reconciliationDailyService from '../finance/reconciliation-daily.service.js';
import alertService from './alert.service.js';
import * as profitCommissionAdjustment from './profit-commission-adjustment.service.js';
import * as companyFinancialsService from './company-financials.service.js';
import ledgerRepo from '../finance/ledger.repository.js';
import financialTransactionService from '../finance/financial-transaction.service.js';
import { ACCOUNT_NAMES, ACCOUNTS, ENTITY_COMPANY } from '../finance/chart-of-accounts.js';
import { getDb } from '../../config/mongo.js';
import * as platformEnvService from './platform-env.service.js';
import * as maintenanceService from './maintenance.service.js';
import * as adminAuditService from './admin-audit.service.js';

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
    res.status(410).json({ error: 'PAMM feature has been removed' });
  } catch (e) {
    next(e);
  }
}

// ---------- Admin PAMM / Bull Run fund management ----------
async function listPammFunds(req, res, next) {
  try {
    const list = await pammRepo.listAllManagers({ limit: 100 });
    const withStats = await Promise.all(
      list.map(async (m) => {
        const allocs = await pammRepo.listAllocationsByManager(m.id, { status: 'active' });
        const investorCapital = allocs.reduce((s, a) => s + (a.allocatedBalance || 0), 0);
        const managerCapital = Number(m.currentDeposit) || 0;
        return {
          ...m,
          investors: allocs.length,
          aum: managerCapital + investorCapital,
          reserveBalance: Number(m.reserveBalance) || 0,
        };
      })
    );
    res.json(withStats);
  } catch (e) {
    next(e);
  }
}

async function createPammFund(req, res, next) {
  try {
    const { managerEmail, name, fundType, strategy, approvalStatus, currentDeposit } = req.body;
    const email = (managerEmail || '').trim().toLowerCase();
    if (!email) {
      return res.status(400).json({ error: 'managerEmail is required' });
    }
    const user = await userRepo.findByEmail(email);
    if (!user) {
      return res.status(404).json({ error: `User not found: ${email}` });
    }
    const userId = user.id;
    const fundName = (name || 'BULL RUN').trim();
    const initialDeposit = Number(currentDeposit) || 0;

    const id = await pammRepo.createManager({
      userId,
      name: fundName,
      allocationPercent: 100,
      performanceFeePercent: 0,
      cutoffWithdrawEnabled: false,
      isPublic: true,
      strategy: (strategy || '').trim(),
      fundType: (fundType || 'ai').toLowerCase(),
      fundSize: initialDeposit,
      currentDeposit: initialDeposit,
      approvalStatus: approvalStatus === 'approved' ? 'approved' : 'pending',
    });

    const tradingAccountId = await tradingAccountRepo.create({
      userId,
      type: 'pamm',
      pammManagerId: userId,
      name: `PAMM: ${fundName}`,
      balance: initialDeposit,
    });
    await pammRepo.updateManagerById(id, { tradingAccountId });

    if (initialDeposit > 0) {
      const wallet = await walletRepo.getOrCreateWallet(userId, 'USD');
      if ((wallet.balance ?? 0) >= initialDeposit) {
        await financialTransactionService.runPairedWithTransaction(async (session) => {
          await financialTransactionService.syncWalletToLedgerAfterMutation(session, userId, 'USD', async (s) => {
            await ledgerService.postPammManagerCapitalAdd(userId, initialDeposit, 'USD', id, id, { session: s });
          });
          await walletRepo.createTransaction(
            {
              userId,
              type: 'pamm_manager_cap_in',
              amount: -initialDeposit,
              currency: 'USD',
              status: 'completed',
              reference: id,
              destination: `pamm:${id}`,
              completedAt: new Date(),
            },
            { session }
          );
        }, { label: 'admin_pamm_fund_create_cap' });
      }
    }

    const fund = await pammRepo.getManagerById(id);
    res.status(201).json({ ...fund, tradingAccountId });
  } catch (e) {
    if (e.statusCode) res.status(e.statusCode).json({ error: e.message });
    else next(e);
  }
}

async function getPammFund(req, res, next) {
  try {
    const { fundId } = req.params;
    const fund = await pammRepo.getManagerById(fundId);
    if (!fund) return res.status(404).json({ error: 'Fund not found' });
    const allocs = await pammRepo.listAllocationsByManager(fundId, { status: 'active' });
    const investorCapital = allocs.reduce((s, a) => s + (a.allocatedBalance || 0), 0);
    res.json({
      ...fund,
      investors: allocs.length,
      allocations: allocs,
      aum: (Number(fund.currentDeposit) || 0) + investorCapital,
      reserveBalance: Number(fund.reserveBalance) || 0,
    });
  } catch (e) {
    next(e);
  }
}

async function updatePammFund(req, res, next) {
  try {
    const { fundId } = req.params;
    const { name, isPublic, approvalStatus } = req.body;
    const fund = await pammRepo.getManagerById(fundId);
    if (!fund) return res.status(404).json({ error: 'Fund not found' });
    const update = {};
    if (name !== undefined) update.name = String(name).trim();
    if (typeof isPublic === 'boolean') update.isPublic = isPublic;
    if (approvalStatus === 'approved' || approvalStatus === 'pending' || approvalStatus === 'rejected') update.approvalStatus = approvalStatus;
    if (Object.keys(update).length === 0) {
      return res.status(400).json({ error: 'No name, isPublic or approvalStatus to update' });
    }
    const updated = await pammRepo.updateManagerById(fundId, update);
    res.json(updated);
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
    const { role, kycStatus, kycRejectedReason } = req.body;
    if (role === 'pamm_manager') {
      return res.status(400).json({ error: 'Role pamm_manager is no longer supported. Use trader or investor instead.' });
    }
    const prev = await userRepo.findById(id);
    if (!prev) return res.status(404).json({ error: 'User not found' });
    const update = {};
    if (role !== undefined) update.role = role;
    if (kycStatus !== undefined) update.kycStatus = kycStatus;
    if (kycRejectedReason !== undefined) update.kycRejectedReason = kycRejectedReason;
    if (Object.keys(update).length === 0) {
      return res.status(400).json({ error: 'No role, kycStatus or kycRejectedReason to update' });
    }
    // Use repo directly so admin can set kycRejectedReason (not in user-service allowed list)
    const user = await (update.kycStatus !== undefined || update.kycRejectedReason !== undefined
      ? userRepo.updateById(id, update)
      : userService.update(id, update));
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (audit?.log) {
      audit.log(
        req.user?.id,
        'admin_update_user',
        'user',
        {
          targetUserId: id,
          before: { role: prev.role, kycStatus: prev.kycStatus, kycRejectedReason: prev.kycRejectedReason },
          after: { role: user.role, kycStatus: user.kycStatus, kycRejectedReason: user.kycRejectedReason },
        },
        { clientIp: req.ip || req.socket?.remoteAddress || null }
      );
    }
    res.json({
      ...user,
      id: user.id,
      approvalStatus: user.kycStatus || 'pending',
    });
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
        const uid = p.userId != null ? String(p.userId) : '';
        const u = uid ? await userRepo.findById(uid) : null;
        const level = uid ? await levelCalculator.getLevelByUserId(uid) : 1;
        let parentEmail = null;
        if (p.parentId) {
          const pu = await userRepo.findById(String(p.parentId));
          parentEmail = pu?.email ?? null;
        }
        const directReferralCount = uid ? await ibRepo.countReferralsByIb(uid) : 0;
        return {
          ...p,
          email: u?.email ?? null,
          name: u?.name ?? null,
          level,
          parentEmail,
          directReferralCount,
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
    const data = await ibRepo.getIbSettingsForAdmin();
    res.json(data);
  } catch (e) {
    next(e);
  }
}

async function updateIbSettings(req, res, next) {
  try {
    const { ratePerLotByLevel, defaultReferrerUserId } = req.body || {};
    const hasRates = ratePerLotByLevel != null && typeof ratePerLotByLevel === 'object';
    const hasDefault = defaultReferrerUserId !== undefined;
    if (!hasRates && !hasDefault) {
      return res.status(400).json({
        error: 'Provide ratePerLotByLevel and/or defaultReferrerUserId (empty string clears stored default IB)',
      });
    }
    if (hasDefault && defaultReferrerUserId != null && String(defaultReferrerUserId).trim() !== '') {
      const dr = String(defaultReferrerUserId).trim();
      const ibp = await ibRepo.getProfileByUserId(dr);
      if (!ibp?.userId) {
        return res.status(400).json({ error: 'defaultReferrerUserId must be a user id that has an IB profile' });
      }
    }
    let normalizedRates = null;
    if (hasRates) {
      normalizedRates = {};
      for (const [k, v] of Object.entries(ratePerLotByLevel)) {
        const level = parseInt(k, 10);
        if (level >= 1 && level <= 10 && Number.isFinite(Number(v))) {
          normalizedRates[level] = Number(v);
        }
      }
      if (Object.keys(normalizedRates).length === 0) {
        return res.status(400).json({ error: 'At least one level (1–10) with a number required when sending ratePerLotByLevel' });
      }
    }
    const merged = await ibRepo.updateIbSettingsMerged({
      ...(normalizedRates && { ratePerLotByLevel: normalizedRates }),
      ...(hasDefault && { defaultReferrerUserId }),
    });
    res.json(merged);
  } catch (e) {
    next(e);
  }
}

async function getPammIbCommissionSettings(req, res, next) {
  try {
    const data = await ibRepo.getPammIbCommissionSettings();
    res.json(data);
  } catch (e) {
    next(e);
  }
}

async function updatePammIbCommissionSettings(req, res, next) {
  try {
    const { levels } = req.body || {};
    if (!levels || typeof levels !== 'object') {
      return res.status(400).json({ error: 'levels object required (e.g. { 1: { daily_payout_percent: 0.25, status: "enabled" } })' });
    }
    const updatedBy = req.user?.id || null;
    const result = await ibRepo.updatePammIbCommissionSettings(levels, updatedBy);
    res.json(result);
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

/**
 * PUT/PATCH /admin/ib/profiles/:ibUserId/parent — move IB in hierarchy (parentId). null/omit parent = root.
 */
async function putIbProfileParent(req, res, next) {
  try {
    const ibUserId = (req.params.ibUserId || '').trim();
    if (!ibUserId) return res.status(400).json({ error: 'ibUserId required' });
    const { parentUserId } = req.body || {};
    const { parentVal } = await ibHierarchy.validateIbParentChange(ibUserId, parentUserId);
    const updated = await ibRepo.updateIbParentByUserId(ibUserId, parentVal);
    if (!updated) return res.status(404).json({ error: 'IB profile not found' });
    if (audit?.log) {
      audit.log(
        req.user?.id,
        'reassign_ib_parent',
        'ib_profile',
        {
          actorId: req.user?.id,
          ibUserId,
          newParentUserId: parentVal,
          at: new Date().toISOString(),
        },
        { clientIp: req.ip || req.socket?.remoteAddress || null }
      );
    }
    const level = await levelCalculator.getLevelByUserId(ibUserId);
    res.json({ ...updated, level });
  } catch (e) {
    if (e.statusCode) return res.status(e.statusCode).json({ error: e.message });
    next(e);
  }
}

/** GET /admin/ib/profiles/:ibUserId/referral-overview — signup joinings vs commission-based clients */
async function getIbReferralOverview(req, res, next) {
  try {
    const ibUserId = (req.params.ibUserId || '').trim();
    if (!ibUserId) return res.status(400).json({ error: 'ibUserId required' });
    const prof = await ibRepo.getProfileByUserId(ibUserId);
    if (!prof) return res.status(404).json({ error: 'IB profile not found' });
    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 200);
    const [directReferralsBySignup, clientsWithCommissionActivity] = await Promise.all([
      ibRepo.listReferralJoiningsByIb(ibUserId, { limit }),
      ibRepo.listReferralsByIb(ibUserId, { limit }),
    ]);
    res.json({
      ibUserId,
      directReferralsBySignup,
      directReferralsBySignupNote:
        'Users who registered under this IB (users.referrerId). Includes clients who have not traded yet.',
      clientsWithCommissionActivity,
      clientsWithCommissionNote:
        'Clients with ib_commissions rows for this IB — may omit signups with no trading volume yet.',
    });
  } catch (e) {
    next(e);
  }
}

/** GET /admin/ib/referrer-gaps — users with no referrer or broken referrer → IB chain */
async function getIbReferrerGaps(req, res, next) {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const db = await getDb();
    const usersCol = db.collection('users');
    const noRefDocs = await usersCol
      .find(
        {
          role: 'user',
          $or: [{ referrerId: null }, { referrerId: '' }, { referrerId: { $exists: false } }],
        },
        { projection: { email: 1, name: 1, createdAt: 1, referralSource: 1 } }
      )
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();
    const withRef = await usersCol
      .find(
        { role: 'user', referrerId: { $exists: true, $nin: [null, ''] } },
        { projection: { email: 1, name: 1, referrerId: 1, createdAt: 1, referralSource: 1 } }
      )
      .sort({ createdAt: -1 })
      .limit(500)
      .toArray();
    const brokenReferrer = [];
    for (const u of withRef) {
      if (brokenReferrer.length >= limit) break;
      const rid = u.referrerId != null ? String(u.referrerId) : '';
      const refUser = rid ? await userRepo.findById(rid) : null;
      const ibp = rid ? await ibRepo.getProfileByUserId(rid) : null;
      if (!refUser || !ibp) {
        brokenReferrer.push({
          id: u._id.toString(),
          email: u.email,
          name: u.name,
          referrerId: rid,
          issue: !refUser ? 'referrer_user_missing' : 'referrer_not_ib',
          referralSource: u.referralSource,
          createdAt: u.createdAt,
        });
      }
    }
    res.json({
      noReferrer: noRefDocs.map((u) => ({
        id: u._id.toString(),
        email: u.email,
        name: u.name,
        referralSource: u.referralSource,
        createdAt: u.createdAt,
      })),
      brokenReferrer,
      notes: {
        noReferrer:
          'Users with role=user and no referrerId (expected when default IB is unset and signup had no ref link).',
        brokenReferrer: 'referrerId points to missing user or a user without ib_profiles.',
      },
    });
  } catch (e) {
    next(e);
  }
}

/**
 * PUT/PATCH /admin/ib/clients/:userId/referrer
 * Reassign introducing broker — pass referrerUserId and/or referrerEmail (IB account).
 * Clearing referrer is not allowed.
 */
async function putClientReferrer(req, res, next) {
  try {
    const clientUserId = (req.params.userId || '').trim();
    if (!clientUserId) return res.status(400).json({ error: 'userId required' });
    const rawId = req.body?.referrerUserId;
    const rawEmail = req.body?.referrerEmail ?? req.body?.referrerUserEmail;
    let rid = typeof rawId === 'string' ? rawId.trim() : '';
    const emailStr = typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase() : '';
    if (!rid && !emailStr) {
      return res.status(400).json({
        error:
          'referrerUserId or referrerEmail is required. Clearing referrer is not allowed; assign a valid IB.',
      });
    }
    if (emailStr) {
      const refByEmail = await userRepo.findByEmail(emailStr);
      if (!refByEmail) {
        return res.status(404).json({ error: 'No user found for referrer email' });
      }
      const resolved = String(refByEmail.id);
      if (rid && rid !== resolved) {
        return res.status(400).json({ error: 'referrerUserId does not match the user for referrerEmail' });
      }
      rid = resolved;
    }
    if (rid === clientUserId) {
      return res.status(400).json({ error: 'A user cannot be referred by themselves' });
    }
    const client = await userRepo.findById(clientUserId);
    if (!client) return res.status(404).json({ error: 'User not found' });
    const ibProfile = await ibRepo.getProfileByUserId(rid);
    if (!ibProfile?.userId) {
      return res.status(400).json({ error: 'Referrer must be a user with an IB profile' });
    }
    const canonicalRef = String(ibProfile.userId);
    const oldReferrerId = client.referrerId != null ? String(client.referrerId) : null;
    if (oldReferrerId === canonicalRef) {
      return res.json({
        id: client.id,
        referrerId: canonicalRef,
        previousReferrerId: oldReferrerId,
        unchanged: true,
      });
    }
    const reasonRaw = req.body?.reason;
    const reason = typeof reasonRaw === 'string' ? reasonRaw.trim().slice(0, 500) : '';
    const updated = await userRepo.updateById(client.id, {
      referrerId: canonicalRef,
      referralSource: 'admin',
    });
    if (!updated) return res.status(404).json({ error: 'User not found' });
    if (audit?.log) {
      audit.log(
        req.user?.id,
        'reassign_client_referrer',
        'user',
        {
          actorId: req.user?.id,
          targetUserId: client.id,
          oldReferrerId,
          newReferrerId: canonicalRef,
          referrerEmail: emailStr || undefined,
          reason: reason || undefined,
          at: new Date().toISOString(),
        },
        { clientIp: req.ip || req.socket?.remoteAddress || null }
      );
    }
    res.json({
      id: updated.id,
      referrerId: updated.referrerId != null ? String(updated.referrerId) : canonicalRef,
      previousReferrerId: oldReferrerId,
    });
  } catch (e) {
    next(e);
  }
}

// ---------- Trading monitor (admin view user trading activity) ----------
async function getTopTraders(req, res, next) {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 10, 20);
    const top = await positionsService.getTopTradersWithPositions(limit);
    const result = [];
    for (const { userId, count, totalVolume, positions } of top) {
      const user = await userRepo.findById(userId);
      if (!user) continue;
      result.push({
        id: user.id,
        email: user.email,
        name: user.name || user.email?.split('@')[0] || '—',
        positionCount: count,
        totalVolume,
        positions,
      });
    }
    res.json(result);
  } catch (e) {
    next(e);
  }
}

async function getTradingUserSummary(req, res, next) {
  try {
    const { userId } = req.params;
    if (!userId) return res.status(400).json({ error: 'userId required' });
    const user = await userRepo.findById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({
      id: user.id,
      email: user.email ?? '—',
      name: user.name || user.email?.split('@')[0] || '—',
    });
  } catch (e) {
    next(e);
  }
}

async function getTradingAccounts(req, res, next) {
  try {
    const { userId } = req.params;
    if (!userId) return res.status(400).json({ error: 'userId required' });
    const user = await userRepo.findById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const accounts = await tradingAccountRepo.listByUser(userId);
    res.json(accounts);
  } catch (e) {
    next(e);
  }
}

async function getTradingWallet(req, res, next) {
  try {
    const { userId } = req.params;
    if (!userId) return res.status(400).json({ error: 'userId required' });
    const user = await userRepo.findById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const wallet = await walletRepo.getOrCreateWallet(userId, 'USD');
    res.json({
      balance: wallet?.balance ?? 0,
      locked: wallet?.locked ?? 0,
      currency: wallet?.currency ?? 'USD',
    });
  } catch (e) {
    next(e);
  }
}

async function getTradingPositions(req, res, next) {
  try {
    const { userId } = req.params;
    const accountId = req.query.accountId || null;
    const limit = Math.min(parseInt(req.query.limit, 10) || 200, 500);
    if (!userId) return res.status(400).json({ error: 'userId required' });
    const user = await userRepo.findById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const list = await positionsService.getOpenPositions(userId, {
      limit,
      accountId: accountId || undefined,
    });
    res.json(list);
  } catch (e) {
    next(e);
  }
}

async function getTradingClosedPositions(req, res, next) {
  try {
    const { userId } = req.params;
    const { accountId, limit } = req.query;
    if (!userId) return res.status(400).json({ error: 'userId required' });
    const user = await userRepo.findById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const list = await positionsService.getClosedPositions(userId, {
      limit: Math.min(parseInt(limit, 10) || 50, 100),
      accountId: accountId || undefined,
    });
    res.json(list);
  } catch (e) {
    next(e);
  }
}

async function getTradingOrders(req, res, next) {
  try {
    const { userId } = req.params;
    const { status, accountId, limit } = req.query;
    if (!userId) return res.status(400).json({ error: 'userId required' });
    const user = await userRepo.findById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const list = await orderService.listOrders(userId, {
      status: status || undefined,
      limit: Math.min(parseInt(limit, 10) || 50, 100),
      accountId: accountId || undefined,
    });
    res.json(list);
  } catch (e) {
    next(e);
  }
}

async function adminClosePosition(req, res, next) {
  try {
    const { userId, positionId } = req.params;
    const { volume, closePrice } = req.body;
    if (!userId || !positionId) return res.status(400).json({ error: 'userId and positionId required' });
    const user = await userRepo.findById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const result = await positionsService.closePosition(userId, positionId, {
      volume: volume ? Number(volume) : undefined,
      closePrice: closePrice ? Number(closePrice) : undefined,
      bypassAdmin: true,
    });
    if (audit?.log) {
      audit.log(
        req.user?.id,
        'admin_close_position',
        'position',
        {
          targetUserId: userId,
          positionId,
          volume: volume != null ? Number(volume) : undefined,
          closePrice: closePrice != null ? Number(closePrice) : undefined,
        },
        { clientIp: req.ip || req.socket?.remoteAddress || null }
      );
    }
    res.json(result);
  } catch (e) {
    if (e.statusCode === 404) return res.status(404).json({ error: e.message });
    if (e.statusCode === 400) return res.status(400).json({ error: e.message });
    next(e);
  }
}

async function adminCancelOrder(req, res, next) {
  try {
    const { userId, orderId } = req.params;
    if (!userId || !orderId) return res.status(400).json({ error: 'userId and orderId required' });
    const user = await userRepo.findById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const result = await orderService.cancelOrder(userId, orderId);
    if (audit?.log) {
      audit.log(
        req.user?.id,
        'admin_cancel_order',
        'order',
        { targetUserId: userId, orderId },
        { clientIp: req.ip || req.socket?.remoteAddress || null }
      );
    }
    res.json(result);
  } catch (e) {
    if (e.statusCode === 404) return res.status(404).json({ error: e.message });
    if (e.statusCode === 400) return res.status(400).json({ error: e.message });
    next(e);
  }
}

/** Get trading limits (block status, drawdown limits) for a user */
async function getTradingLimits(req, res, next) {
  try {
    const { userId } = req.params;
    if (!userId) return res.status(400).json({ error: 'userId required' });
    const user = await userRepo.findById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const limits = await tradingLimitsRepo.getByUserId(userId);
    res.json({
      blocked: limits?.blocked ?? false,
      maxDrawdownPercent: limits?.maxDrawdownPercent ?? null,
      maxDailyLoss: limits?.maxDailyLoss ?? null,
    });
  } catch (e) {
    next(e);
  }
}

/** Update trading limits (block, drawdown limits) for a user */
async function updateTradingLimits(req, res, next) {
  try {
    const { userId } = req.params;
    const { blocked, maxDrawdownPercent, maxDailyLoss } = req.body || {};
    if (!userId) return res.status(400).json({ error: 'userId required' });
    const user = await userRepo.findById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const data = {};
    if (blocked !== undefined) data.blocked = !!blocked;
    if (maxDrawdownPercent !== undefined) data.maxDrawdownPercent = maxDrawdownPercent;
    if (maxDailyLoss !== undefined) data.maxDailyLoss = maxDailyLoss;
    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: 'Provide blocked, maxDrawdownPercent, or maxDailyLoss' });
    }
    const oldLimits = await tradingLimitsRepo.getByUserId(userId);
    const limits = await tradingLimitsRepo.upsert(userId, data);
    if (audit?.log) {
      audit.log(
        req.user?.id,
        'update_trading_limits',
        'user_trading_limits',
        {
          targetUserId: userId,
          old: { blocked: oldLimits?.blocked, maxDrawdownPercent: oldLimits?.maxDrawdownPercent, maxDailyLoss: oldLimits?.maxDailyLoss },
          new: { blocked: limits?.blocked, maxDrawdownPercent: limits?.maxDrawdownPercent, maxDailyLoss: limits?.maxDailyLoss },
        },
        { clientIp: req.ip || req.socket?.remoteAddress || null }
      );
    }
    res.json({
      blocked: limits?.blocked ?? false,
      maxDrawdownPercent: limits?.maxDrawdownPercent ?? null,
      maxDailyLoss: limits?.maxDailyLoss ?? null,
    });
  } catch (e) {
    next(e);
  }
}

/** Get CRM/config for a trading account (admin) */
async function getAccountConfig(req, res, next) {
  try {
    const { userId, accountId } = req.params;
    if (!userId || !accountId) return res.status(400).json({ error: 'userId and accountId required' });
    const account = await tradingAccountRepo.findById(accountId, userId);
    if (!account) return res.status(404).json({ error: 'Trading account not found' });
    res.json({
      accountId: account.id,
      accountNumber: account.accountNumber,
      type: account.type,
      accountGroup: account.accountGroup ?? null,
      executionGroup: account.executionGroup ?? null,
      riskGroup: account.riskGroup ?? null,
      leverage: account.leverage ?? null,
      tradingEnabled: account.tradingEnabled !== false,
      accountBlocked: !!account.accountBlocked,
      canTradeForex: account.canTradeForex !== false,
      canTradeMetals: account.canTradeMetals !== false,
      canTradeCrypto: account.canTradeCrypto !== false,
    });
  } catch (e) {
    next(e);
  }
}

/** Update CRM/config for a trading account (admin). Audit logged. */
async function updateAccountConfig(req, res, next) {
  try {
    const { userId, accountId } = req.params;
    const body = req.body || {};
    if (!userId || !accountId) return res.status(400).json({ error: 'userId and accountId required' });
    const account = await tradingAccountRepo.findById(accountId, userId);
    if (!account) return res.status(404).json({ error: 'Trading account not found' });
    const update = {};
    if (body.accountGroup !== undefined) update.accountGroup = body.accountGroup;
    if (body.executionGroup !== undefined) update.executionGroup = body.executionGroup;
    if (body.riskGroup !== undefined) update.riskGroup = body.riskGroup;
    if (body.leverage !== undefined) update.leverage = Number(body.leverage);
    if (body.tradingEnabled !== undefined) update.tradingEnabled = !!body.tradingEnabled;
    if (body.accountBlocked !== undefined) update.accountBlocked = !!body.accountBlocked;
    if (body.canTradeForex !== undefined) update.canTradeForex = !!body.canTradeForex;
    if (body.canTradeMetals !== undefined) update.canTradeMetals = !!body.canTradeMetals;
    if (body.canTradeCrypto !== undefined) update.canTradeCrypto = !!body.canTradeCrypto;
    if (Object.keys(update).length === 0) {
      return res.status(400).json({ error: 'Provide at least one field to update' });
    }
    const updated = await tradingAccountRepo.updateAccountConfig(accountId, userId, update);
    if (audit?.log) {
      audit.log(
        req.user?.id,
        'update_account_config',
        'trading_account',
        {
          targetUserId: userId,
          accountId,
          accountNumber: account.accountNumber,
          changes: update,
        },
        { clientIp: req.ip || req.socket?.remoteAddress || null }
      );
    }
    res.json({
      accountId: updated.id,
      accountNumber: updated.accountNumber,
      type: updated.type,
      accountGroup: updated.accountGroup ?? null,
      executionGroup: updated.executionGroup ?? null,
      riskGroup: updated.riskGroup ?? null,
      leverage: updated.leverage ?? null,
      tradingEnabled: updated.tradingEnabled !== false,
      accountBlocked: !!updated.accountBlocked,
      canTradeForex: updated.canTradeForex !== false,
      canTradeMetals: updated.canTradeMetals !== false,
      canTradeCrypto: updated.canTradeCrypto !== false,
    });
  } catch (e) {
    next(e);
  }
}

/** Admin: platform-wide company financials (ledger aggregates) */
async function getCompanyFinancials(req, res, next) {
  try {
    const data = await companyFinancialsService.getCompanyFinancials(req.query || {});
    res.json(data);
  } catch (e) {
    next(e);
  }
}

/** Admin: platform-wide ledger lines (drill-down from company financials KPIs) */
async function getCompanyLedgerEntries(req, res, next) {
  try {
    const { from, to, accountCode, referenceType, accountClass, limit } = req.query || {};
    const list = await ledgerRepo.listEntriesGlobal({
      from,
      to,
      accountCode,
      referenceType,
      accountClass,
      limit,
    });
    const entries = list.map((e) => ({
      ...e,
      accountName: ACCOUNT_NAMES[e.accountCode] || e.accountCode,
    }));
    res.json({ entries, count: entries.length });
  } catch (e) {
    next(e);
  }
}

/**
 * Admin: company super wallet and main ledger summary.
 * Company entity owns all platform income, expenses, assets, liabilities; not owned by any user.
 * Superadmins (and admin-panel roles) have full access.
 * Company wallet balance = ledger Cash/Bank (1200) for company — all company cash is held there.
 */
async function getCompanyWallet(req, res, next) {
  try {
    const wallet = await walletRepo.getOrCreateWallet(ENTITY_COMPANY, 'USD');
    const ledgerBalances = await ledgerRepo.getBalancesByEntity(ENTITY_COMPANY, null);
    const balancesWithNames = Object.entries(ledgerBalances).map(([code, balance]) => ({
      accountCode: code,
      accountName: ACCOUNT_NAMES[code] || code,
      balance: Math.round(balance * 100) / 100,
    }));
    balancesWithNames.sort((a, b) => a.accountCode.localeCompare(b.accountCode));
    // Company cash is in ledger 1200 (Cash/Bank), not the wallets doc — use ledger as source of truth
    const companyCashFromLedger = Number(ledgerBalances[ACCOUNTS.CASH_BANK] ?? 0);
    const balanceRounded = Math.round(companyCashFromLedger * 100) / 100;
    res.json({
      entityId: ENTITY_COMPANY,
      description: 'Company super wallet — main ledger and wallet of the platform. All company income, expenses, liabilities and assets connect here.',
      wallet: {
        id: wallet?.id,
        currency: wallet?.currency ?? 'USD',
        balance: balanceRounded,
        locked: Number(wallet?.locked ?? 0),
        note: 'Balance = ledger Cash/Bank (1200) for company entity.',
      },
      ledgerBalances: balancesWithNames,
    });
  } catch (e) {
    next(e);
  }
}

/** Superadmin: context for manual profit / commission adjustment form */
async function getUserProfitCommissionContext(req, res, next) {
  try {
    const ctx = await profitCommissionAdjustment.getAdjustmentContext(req.params.userId);
    res.json(ctx);
  } catch (e) {
    if (e.statusCode) return res.status(e.statusCode).json({ error: e.message });
    next(e);
  }
}

/** Superadmin: apply PAMM P&L delta, wallet credit, IB pending commission in one transaction */
async function postUserProfitCommissionAdjustment(req, res, next) {
  try {
    const r = await profitCommissionAdjustment.applyAdjustment({
      targetUserId: req.params.userId,
      adminUserId: req.user?.id,
      reason: req.body?.reason,
      pammAllocationId: req.body?.pammAllocationId,
      pammRealizedPnlDelta: req.body?.pammRealizedPnlDelta,
      walletProfitCreditUsd: req.body?.walletProfitCreditUsd,
      ibCommissionPendingUsd: req.body?.ibCommissionPendingUsd,
      clientIp: req.ip || req.socket?.remoteAddress || null,
    });
    res.json(r);
  } catch (e) {
    if (e.statusCode) return res.status(e.statusCode).json({ error: e.message });
    next(e);
  }
}

/** Superadmin only: add funds to a customer wallet. Atomic: ledger + wallet + transaction. */
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
    const { wallet, txId: adminCreditTxId } = await financialTransactionService.runPairedWithTransaction(
      async (session) => {
        const txId = await walletRepo.createTransaction(
          {
            userId,
            type: 'admin_credit',
            amount: amt,
            currency: currency || 'USD',
            status: 'completed',
            reference: null,
            completedAt: new Date(),
          },
          { session }
        );
        await walletRepo.updateTransaction(txId, { reference: txId }, { session });
        await ledgerService.postAdminCredit(userId, amt, currency || 'USD', txId, { session });
        const w = await walletRepo.updateBalance(userId, currency || 'USD', amt, { session });
        return { wallet: w, txId };
      },
      { label: 'admin_add_funds' }
    );
    await financialTransactionService.verifyWalletLedgerAfterMutation(userId, currency || 'USD', {
      flow: 'admin_credit',
    });
    const { queueWalletBalanceNotifyById } = await import('../email/wallet-balance-notify.js');
    if (adminCreditTxId) queueWalletBalanceNotifyById(adminCreditTxId);
    if (audit?.log) {
      audit.log(
        req.user?.id,
        'admin_add_funds',
        'wallet',
        {
          targetUserId: userId,
          amount: amt,
          currency: currency || 'USD',
          reference: reference || null,
        },
        { clientIp: req.ip || req.socket?.remoteAddress || null }
      );
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

// ---------- Payment settings (admin) ----------
async function getPaymentSettings(req, res, next) {
  try {
    const settings = await paymentSettingsRepo.getPaymentSettings();
    res.json(settings);
  } catch (e) {
    next(e);
  }
}

async function updatePaymentSettings(req, res, next) {
  try {
    const { pspEnabled, minDeposit, maxDeposit, methods } = req.body || {};
    const update = {};
    if (typeof pspEnabled === 'boolean') update.pspEnabled = pspEnabled;
    if (Number.isFinite(minDeposit) && minDeposit >= 0) update.minDeposit = minDeposit;
    if (Number.isFinite(maxDeposit) && maxDeposit > 0) update.maxDeposit = maxDeposit;
    if (methods && typeof methods === 'object') update.methods = methods;
    const settings = await paymentSettingsRepo.updatePaymentSettings(update);
    res.json(settings);
  } catch (e) {
    next(e);
  }
}

async function getWithdrawalApprovalSettings(req, res, next) {
  try {
    const settings = await withdrawalApprovalSettingsRepo.getWithdrawalApprovalSettings();
    res.json(settings);
  } catch (e) {
    next(e);
  }
}

async function updateWithdrawalApprovalSettings(req, res, next) {
  try {
    const { autoApproveSmallWithdrawals, autoApproveThresholdUsd } = req.body || {};
    const update = {};
    if (typeof autoApproveSmallWithdrawals === 'boolean') update.autoApproveSmallWithdrawals = autoApproveSmallWithdrawals;
    if (Number.isFinite(autoApproveThresholdUsd) && autoApproveThresholdUsd >= 0) update.autoApproveThresholdUsd = autoApproveThresholdUsd;
    const settings = await withdrawalApprovalSettingsRepo.updateWithdrawalApprovalSettings(update);
    res.json(settings);
  } catch (e) {
    next(e);
  }
}

// ---------- Bulk user import (superadmin only) ----------
async function bulkImport(req, res, next) {
  try {
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    const dryRun = req.body?.dryRun !== false;
    const report = await bulkImportService.runBulkImport(rows, dryRun);
    res.json({ dryRun, report });
  } catch (e) {
    next(e);
  }
}

async function getBulkImportConfig(req, res, next) {
  try {
    const config = bulkImportService.getImportConfig();
    res.json(config);
  } catch (e) {
    next(e);
  }
}

async function getLatestWalletLedgerReconciliation(req, res, next) {
  try {
    const doc = await reconciliationDailyService.getLatestRun();
    if (!doc) return res.json({ message: 'No reconciliation runs yet', run: null });
    const { _id, ...rest } = doc;
    res.json({ run: { ...rest, id: _id?.toString?.() } });
  } catch (e) {
    next(e);
  }
}

async function listRecentActivity(req, res, next) {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 80, 200);
    const list = await walletRepo.listRecentActivityForAdmin(limit);
    res.json(list);
  } catch (e) {
    next(e);
  }
}

async function listWithdrawals(req, res, next) {
  try {
    const risk = req.query.risk;
    const status = req.query.status;
    const from = req.query.from;
    const to = req.query.to;
    const amountMin = req.query.amountMin;
    const amountMax = req.query.amountMax;
    const search = req.query.search;
    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);
    const list = await walletRepo.listWithdrawalsForAdmin({
      limit,
      risk: risk || undefined,
      status: status || undefined,
      from: from || undefined,
      to: to || undefined,
      amountMin: amountMin || undefined,
      amountMax: amountMax || undefined,
      search: search || undefined,
    });
    res.json(list);
  } catch (e) {
    next(e);
  }
}

async function getWithdrawalDetail(req, res, next) {
  try {
    const { id } = req.params;
    const w = await walletRepo.getWithdrawalByIdForAdmin(id);
    if (!w) return res.status(404).json({ error: 'Withdrawal not found' });
    res.json(w);
  } catch (e) {
    next(e);
  }
}

/** Admin PATCH only; completed is set only by processWithdrawal. */
function isAllowedWithdrawalStatusTransition(from, to) {
  if (from === to) return true;
  if (from === 'completed' || from === 'rejected') return false;
  if (to === 'completed') return false;
  const next = {
    pending: ['review', 'rejected'],
    review: ['approved', 'rejected'],
    approved: ['rejected'],
  };
  return (next[from] || []).includes(to);
}

async function updateWithdrawalStatus(req, res, next) {
  try {
    const { id } = req.params;
    const { status, adminNote: rawNote } = req.body || {};
    const patchable = ['pending', 'review', 'approved', 'rejected'];
    if (typeof status !== 'string' || !patchable.includes(status)) {
      return res.status(400).json({
        error:
          'Invalid status. Allowed values: pending, review, approved, rejected. Use process API to complete.',
      });
    }
    const w = await walletRepo.getWithdrawalByIdForAdmin(id);
    if (!w) return res.status(404).json({ error: 'Withdrawal not found' });
    const from = w.status;
    if (!isAllowedWithdrawalStatusTransition(from, status)) {
      return res.status(400).json({
        error: `Invalid status transition: ${from} → ${status}. Allowed: pending→review|rejected, review→approved|rejected, approved→rejected. Completed/rejected are final.`,
      });
    }
    const adminId = req.user?.id != null ? String(req.user.id) : null;
    const note =
      rawNote != null && String(rawNote).trim() !== ''
        ? String(rawNote).trim().slice(0, 2000)
        : undefined;
    const update = { status };
    if (note !== undefined) update.adminNote = note;
    const now = new Date();
    if (status === 'approved' && from !== 'approved') {
      update.approvedBy = adminId;
      update.approvedAt = now;
    }
    if (status === 'rejected' && from !== 'rejected') {
      update.rejectedBy = adminId;
      update.rejectedAt = now;
    }
    await walletRepo.updateTransaction(id, update);
    const updated = await walletRepo.getWithdrawalByIdForAdmin(id);
    console.log(
      `[admin] withdrawal status id=${id} ${from}→${status} by=${adminId || 'unknown'} note=${note ? 'yes' : 'no'}`
    );
    if (audit?.log) {
      audit.log(
        adminId,
        'withdrawal_status_update',
        'wallet_transaction',
        {
          withdrawalId: id,
          fromStatus: from,
          toStatus: status,
          adminNote: note,
        },
        { clientIp: req.ip || req.socket?.remoteAddress || null }
      );
    }
    res.json(updated);
  } catch (e) {
    next(e);
  }
}

async function getFraudDashboardStats(req, res, next) {
  try {
    const now = new Date();
    const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
    const list = await walletRepo.listWithdrawalsForAdmin({
      from: todayStart.toISOString(),
      to: now.toISOString(),
      limit: 2000,
    });
    let highRiskToday = 0;
    let mediumRiskToday = 0;
    let blockedToday = 0;
    for (const w of list) {
      const s = w.fraudRiskScore;
      if (w.status === 'rejected') blockedToday += 1;
      if (s >= 70) highRiskToday += 1;
      else if (s >= 41 && s < 70) mediumRiskToday += 1;
    }
    const latestRecon = await reconciliationDailyService.getLatestRun();
    res.json({
      highRiskToday,
      mediumRiskToday,
      blockedToday,
      totalWithdrawalsToday: list.length,
      reconciliationMismatches: latestRecon?.mismatchCount ?? 0,
      reconciliationCheckedAt: latestRecon?.checkedAt ?? null,
    });
  } catch (e) {
    next(e);
  }
}

async function getAlerts(req, res, next) {
  try {
    const type = req.query.type;
    const resolved = req.query.resolved;
    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 200);
    const list = await alertService.listAlerts({
      type: type || undefined,
      resolved: resolved === 'true' ? true : resolved === 'false' ? false : undefined,
      limit,
    });
    res.json(list);
  } catch (e) {
    next(e);
  }
}

async function resolveAlert(req, res, next) {
  try {
    const { id } = req.params;
    const updated = await alertService.resolveAlert(id);
    if (!updated) return res.status(404).json({ error: 'Alert not found' });
    res.json(updated);
  } catch (e) {
    next(e);
  }
}

/** GET /admin/pamm/distribution-runs — audit log of PAMM distribution runs */
async function listPammDistributionRuns(req, res, next) {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const runs = await pammDistRunsRepo.listRuns(limit);
    res.json({ runs });
  } catch (e) {
    next(e);
  }
}

/** GET /admin/pamm/distribution-runs/:positionId — runs for one closed position */
async function getPammDistributionRunsByPosition(req, res, next) {
  try {
    const { positionId } = req.params;
    const runs = await pammDistRunsRepo.findRunsByPositionId(positionId);
    res.json({ positionId, runs });
  } catch (e) {
    next(e);
  }
}

/** GET /admin/maintenance — current flags + effective state */
async function getMaintenance(req, res, next) {
  try {
    const data = await maintenanceService.getAdminPayload();
    res.json(data);
  } catch (e) {
    next(e);
  }
}

/** PUT /admin/maintenance — manual toggle, message, optional schedule window */
async function putMaintenance(req, res, next) {
  try {
    const adminId = req.user?.id;
    const data = await maintenanceService.updateSettings(req.body || {}, adminId);
    if (audit?.log) {
      audit.log(
        adminId,
        'platform_maintenance_update',
        'settings',
        { at: new Date().toISOString(), patch: req.body || {} },
        { clientIp: req.ip || req.socket?.remoteAddress || null }
      );
    }
    res.json(data);
  } catch (e) {
    if (e.statusCode) return res.status(e.statusCode).json({ error: e.message });
    next(e);
  }
}

/** GET /admin/audit-logs — persisted admin actions + execution mode history (read-only) */
async function listAuditLogs(req, res, next) {
  try {
    const { limit, action, resource, from, to } = req.query;
    const data = await adminAuditService.listUnifiedAuditEntries({
      limit: limit != null && limit !== '' ? Number(limit) : undefined,
      action: action || undefined,
      resource: resource || undefined,
      from: from || undefined,
      to: to || undefined,
    });
    res.json(data);
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
  addFundsToWallet,
  getUserProfitCommissionContext,
  postUserProfitCommissionAdjustment,
  getCompanyFinancials,
  getCompanyLedgerEntries,
  getCompanyWallet,
  listPammFunds,
  createPammFund,
  getPammFund,
  updatePammFund,
  getIbProfiles,
  putIbProfileParent,
  getIbReferralOverview,
  getIbReferrerGaps,
  getIbCommissions,
  getIbWallets,
  getIbSettings,
  updateIbSettings,
  getPammIbCommissionSettings,
  updatePammIbCommissionSettings,
  processIbPayout,
  putClientReferrer,
  getTopTraders,
  getTradingUserSummary,
  getTradingAccounts,
  getTradingWallet,
  getTradingPositions,
  getTradingClosedPositions,
  getTradingOrders,
  adminClosePosition,
  adminCancelOrder,
  getTradingLimits,
  updateTradingLimits,
  getAccountConfig,
  updateAccountConfig,

  // Execution mode (broker A-Book / B-Book / Hybrid)
  getExecutionMode,
  putExecutionMode,
  getHybridRules,
  putHybridRules,
  getMarginRiskSettings,
  putMarginRiskSettings,
  getPlatformEnv,
  putPlatformEnv,

  getPaymentSettings,
  updatePaymentSettings,
  getWithdrawalApprovalSettings,
  updateWithdrawalApprovalSettings,

  bulkImport,
  getBulkImportConfig,
  getLatestWalletLedgerReconciliation,
  listRecentActivity,
  listAuditLogs,
  listWithdrawals,
  getWithdrawalDetail,
  updateWithdrawalStatus,
  getFraudDashboardStats,
  getAlerts,
  resolveAlert,
  listPammDistributionRuns,
  getPammDistributionRunsByPosition,
  getMaintenance,
  putMaintenance,
};

async function getExecutionMode(req, res, next) {
  try {
    const settings = await executionModeService.getExecutionMode();
    res.json(settings);
  } catch (e) {
    next(e);
  }
}

async function putExecutionMode(req, res, next) {
  try {
    const { executionMode } = req.body;
    const adminId = req.user?.id;
    const settings = await executionModeService.setExecutionMode(executionMode, adminId);
    res.json(settings);
  } catch (e) {
    if (e.statusCode) return next(e);
    next(e);
  }
}

async function getHybridRules(req, res, next) {
  try {
    const rules = await executionModeService.getHybridRules();
    res.json(rules);
  } catch (e) {
    next(e);
  }
}

async function putHybridRules(req, res, next) {
  try {
    const adminId = req.user?.id;
    const rules = await executionModeService.updateHybridRules(req.body || {}, adminId);
    res.json(rules);
  } catch (e) {
    next(e);
  }
}

async function getMarginRiskSettings(req, res, next) {
  try {
    const s = await marginRiskSettingsRepo.get();
    res.json({
      stopOutBelowPct: s.stopOutBelowPct,
      warnBelowPct: s.warnBelowPct,
      warnIntervalMs: s.warnIntervalMs,
      updatedAt: s.updatedAt,
      updatedBy: s.updatedBy,
      fromDatabase: s.fromDatabase,
    });
  } catch (e) {
    next(e);
  }
}

async function putMarginRiskSettings(req, res, next) {
  try {
    const adminId = req.user?.id;
    const before = await marginRiskSettingsRepo.get();
    const saved = await marginRiskSettingsRepo.set(req.body || {}, adminId);
    await refreshMarginRiskRuntime();
    if (audit?.log) {
      audit.log(
        adminId,
        'update_margin_risk',
        'margin_risk_settings',
        {
          before: {
            stopOutBelowPct: before.stopOutBelowPct,
            warnBelowPct: before.warnBelowPct,
            warnIntervalMs: before.warnIntervalMs,
          },
          after: {
            stopOutBelowPct: saved.stopOutBelowPct,
            warnBelowPct: saved.warnBelowPct,
            warnIntervalMs: saved.warnIntervalMs,
          },
        },
        { clientIp: req.ip || req.socket?.remoteAddress || null }
      );
    }
    res.json({
      stopOutBelowPct: saved.stopOutBelowPct,
      warnBelowPct: saved.warnBelowPct,
      warnIntervalMs: saved.warnIntervalMs,
      updatedAt: saved.updatedAt,
      updatedBy: saved.updatedBy,
      fromDatabase: true,
    });
  } catch (e) {
    if (e.statusCode) {
      return res.status(e.statusCode).json({ error: e.message });
    }
    next(e);
  }
}

/** GET /admin/platform-env — Super Admin; masked values only */
async function getPlatformEnv(req, res, next) {
  try {
    const data = await platformEnvService.listForAdmin();
    res.json(data);
  } catch (e) {
    next(e);
  }
}

/** PUT /admin/platform-env — body { key, value } — empty value removes override */
async function putPlatformEnv(req, res, next) {
  try {
    const adminId = req.user?.id;
    const { key, value } = req.body || {};
    if (key == null || String(key).trim() === '') {
      return res.status(400).json({ error: 'key is required' });
    }
    const val = value === undefined || value === null ? '' : String(value);
    await platformEnvService.setOverride(String(key).trim(), val, adminId);
    if (audit?.log) {
      audit.log(
        adminId,
        'platform_env_set',
        'platform_env',
        {
          key: String(key).trim(),
          cleared: val === '',
          at: new Date().toISOString(),
        },
        { clientIp: req.ip || req.socket?.remoteAddress || null }
      );
    }
    res.json({
      ok: true,
      key: String(key).trim(),
      hasOverride: val !== '',
      maskedEffective: platformEnvService.maskSecret(process.env[String(key).trim()]),
    });
  } catch (e) {
    if (e.statusCode) {
      return res.status(e.statusCode).json({ error: e.message });
    }
    next(e);
  }
}
