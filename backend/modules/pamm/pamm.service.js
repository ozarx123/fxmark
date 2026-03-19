/**
 * Trade Manager / PAMM service — managers, follow, unfollow, withdraw, trades
 * Bull Run (fundType 'ai'): withdraw/unfollow blocked when fund has open positions
 */
import pammRepo from './pamm.repository.js';
import pammFlagsRepo from './pamm.flags.repository.js';
import tradingAccountRepo from '../trading/trading-account.repository.js';
import walletRepo from '../wallet/wallet.repository.js';
import ledgerService from '../finance/ledger.service.js';
import financialTransactionService from '../finance/financial-transaction.service.js';
import positionRepo from '../trading/position.repository.js';
import userRepo from '../users/user.repository.js';

function isBullRunFund(fund) {
  if (!fund) return false;
  const name = String(fund.name || '').toUpperCase();
  const type = String(fund.fundType || '').toLowerCase();
  return name === 'BULL RUN' || type === 'ai';
}

/** Stable 24-char hex user id for DB lookups (allocations may store ObjectId). */
function normalizeFollowerId(v) {
  if (v == null || v === '') return '';
  if (typeof v === 'object' && v !== null) {
    if (typeof v.toHexString === 'function') return v.toHexString();
    if (v.$oid) return String(v.$oid);
  }
  return String(v).trim();
}

async function hasOpenPositionsForFund(fundId) {
  const fund = await pammRepo.getManagerById(fundId);
  if (!fund?.tradingAccountId || !fund?.userId) return false;
  const open = await positionRepo.listOpen(fund.userId, { accountId: fund.tradingAccountId, limit: 1 });
  return open.length > 0;
}

async function ensureClassicPammEnabledForFund(fund) {
  if (!fund) return;
  if (isBullRunFund(fund)) return; // PAMM AI should never be disabled by kill switch
  const envEnabled = process.env.PAMM_ENABLED !== 'false';
  const kill = await pammFlagsRepo.getFlag('pamm_global_kill_switch', false);
  if (!envEnabled || kill) {
    const err = new Error('PAMM is temporarily disabled for users.');
    err.statusCode = 503;
    throw err;
  }
}

// ---------- Managers ----------
async function listManagers(options = {}) {
  const list = await pammRepo.listManagers(options);
  for (const m of list) {
    const allocs = await pammRepo.listAllocationsByManager(m.id, { status: 'active' });
    m.investors = allocs.length;
    m.aum = allocs.reduce((s, a) => s + (a.allocatedBalance || 0), 0) + (m.currentDeposit ?? 0);
  }
  return list;
}

async function getManager(managerId) {
  const byId = await pammRepo.getManagerById(managerId);
  if (byId) return byId;
  return pammRepo.getManagerByUserId(managerId);
}

/**
 * Fund detail for investor: fund info, stats (AUM, followers, growth), recent trades, and current user's allocation if any.
 * Bull Run (fundType 'ai'): extended with total_fund_pool, daily_profit_cap, today_profit, monthly_profit, monthly_performance, transaction_history, hasActiveTrade.
 */
async function getFundDetail(fundId, followerId = null) {
  const fund = await pammRepo.getManagerById(fundId) || await pammRepo.getManagerByUserId(fundId);
  if (!fund) return null;

  // Classic PAMM detail can be disabled; PAMM AI (Bull Run) stays enabled
  await ensureClassicPammEnabledForFund(fund);

  const allocations = await pammRepo.listAllocationsByManager(fund.id, { status: 'active' });
  const managerCapital = Number(fund.currentDeposit) || 0;
  const investorCapital = allocations.reduce((s, a) => s + (a.allocatedBalance || 0), 0);
  const aum = managerCapital + investorCapital;
  const cumulativePnl = await pammRepo.getFundCumulativePnl(fund.id);
  const fundGrowthRate = aum > 0 ? (cumulativePnl / aum) * 100 : 0;
  const reserveBalance = Number(fund.reserveBalance) || 0;

  const stats = {
    aum,
    investors: allocations.length,
    fundGrowthRate,
    cumulativePnl,
    managerCapital,
    investorCapital,
    performanceFeePercent: Number(fund.performanceFeePercent) || 0,
    reserveBalance,
  };

  const recentTrades = await pammRepo.listTradesByManager(fund.id, { limit: 30 });

  let myAllocation = null;
  if (followerId) {
    const myAllocations = await pammRepo.listAllocationsByFollower(followerId, { status: 'active' });
    const alloc = myAllocations.find((a) => a.managerId === fund.id);
    if (alloc) {
      const realizedPnl = Number(alloc.realizedPnl);
      myAllocation = {
        id: alloc.id,
        allocatedBalance: alloc.allocatedBalance,
        realizedPnl: Number.isFinite(realizedPnl) ? realizedPnl : 0,
        allocationPercent: aum > 0 ? ((alloc.allocatedBalance || 0) / aum) * 100 : 0,
        status: alloc.status,
        createdAt: alloc.createdAt,
      };
    }
  }

  const result = {
    fund: {
      id: fund.id,
      userId: fund.userId,
      name: fund.name,
      strategy: fund.strategy,
      fundType: fund.fundType,
      isPublic: fund.isPublic,
      allocationPercent: fund.allocationPercent,
      performanceFeePercent: fund.performanceFeePercent,
      cutoffWithdrawEnabled: fund.cutoffWithdrawEnabled,
      createdAt: fund.createdAt,
    },
    stats,
    recentTrades,
    myAllocation,
  };

  if (isBullRunFund(fund)) {
    const hasActiveTrade = await hasOpenPositionsForFund(fund.id);
    const { todayProfit, monthlyPerformance } = await pammRepo.getFundTradesPnLByPeriod(fund.id);
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const monthlyTrades = await pammRepo.listTradesByManager(fund.id, { limit: 500 });
    const monthlyPnl = monthlyTrades
      .filter((t) => t.createdAt && new Date(t.createdAt) >= monthStart)
      .reduce((s, t) => s + (Number(t.pnl) || 0), 0);
    const monthlyProfitPercent = aum > 0 ? (monthlyPnl / aum) * 100 : 0;
    const todayProfitPercent = aum > 0 ? (todayProfit / aum) * 100 : 0;
    for (const m of monthlyPerformance) {
      m.profitPercent = aum > 0 ? (m.profit / aum) * 100 : 0;
    }
    let transactionHistory = [];
    if (followerId) {
      const txns = await walletRepo.getTransactions(followerId, { type: ['pamm_alloc', 'pamm_unalloc'], limit: 50 });
      transactionHistory = txns
        .filter((t) => t.reference === fund.id || t.destination === `pamm:${fund.id}` || t.reference === (myAllocation?.id))
        .map((t) => ({
          type: t.type === 'pamm_alloc' ? 'Add funds' : 'Withdrawal',
          amount: Math.abs(t.amount),
          date: t.createdAt || t.created_at,
          liveAccount: 'Live',
        }))
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, 30);
    }
    const fundGrowthData = monthlyPerformance.map((m, i) => ({
      month: m.month,
      value: cumulativePnl > 0 && monthlyPerformance.length > 0
        ? (monthlyPerformance.slice(0, i + 1).reduce((s, x) => s + (x.profit || 0), 0) / aum) * 100
        : 0,
    }));
    result.bullRun = {
      total_fund_pool: aum,
      total_investors: allocations.length,
      strategy_type: 'AI Bull Run',
      daily_profit_cap: 1,
      today_profit: todayProfitPercent,
      monthly_profit: monthlyProfitPercent,
      today_earnings: todayProfitPercent,
      monthly_earnings: monthlyProfitPercent,
      fund_growth_data: fundGrowthData.length ? fundGrowthData : [{ month: 'Inception', value: 0 }],
      monthly_performance: monthlyPerformance.map((m) => ({ month: m.month, profitPercent: m.profitPercent })),
      investor_balance: myAllocation ? Number(myAllocation.allocatedBalance) || 0 : null,
      investor_balance_logic: 'Compound trading enabled. Investor daily profit capped at 1%. Extra profit stored in Bull Run Reserve Account.',
      transaction_history: transactionHistory,
      hasActiveTrade,
      reserve_balance: reserveBalance,
    };
  }

  return result;
}

async function registerAsManager(userId, payload) {
  let id;
  try {
    id = await pammRepo.createManager({
      userId,
      name: payload.name || 'My Strategy',
      allocationPercent: Number(payload.allocationPercent) || 100,
      performanceFeePercent: Number(payload.performanceFeePercent) || 0,
      cutoffWithdrawEnabled: Boolean(payload.cutoffWithdrawEnabled),
      isPublic: payload.isPublic !== false,
      strategy: payload.strategy || '',
      fundType: payload.fundType || 'growth',
      fundSize: Number(payload.fundSize) || 0,
      currentDeposit: Number(payload.currentDeposit) || 0,
    });
  } catch (e) {
    if (e.code === 11000 || (e.message || '').includes('duplicate key')) {
      const err = new Error('Database still has old unique constraint. Run: npm run drop-pamm-userid-unique');
      err.statusCode = 409;
      throw err;
    }
    throw e;
  }
  const fundName = payload.name || 'My Strategy';
  const initialDeposit = Number(payload.currentDeposit) || 0;
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
      }, { label: 'pamm_register_manager_cap' });
    }
  }
  const manager = await pammRepo.getManagerById(id);
  return { ...manager, tradingAccountId };
}

/** Step 2: Create PAMM trading account for existing fund (with PAMM identifier) */
async function createPammTradingAccount(userId, fundId = null) {
  const funds = await pammRepo.listFundsByManagerId(userId);
  const fund = fundId ? funds.find((f) => f.id === fundId) : funds.find((f) => !f.tradingAccountId) || funds[0];
  if (!fund) {
    const err = new Error('Create a fund first');
    err.statusCode = 400;
    throw err;
  }
  if (fund.tradingAccountId) {
    const err = new Error('PAMM trading account already exists for this fund');
    err.statusCode = 409;
    throw err;
  }
  const fundName = fund.name || 'My Strategy';
  const tradingAccountId = await tradingAccountRepo.create({
    userId,
    type: 'pamm',
    pammManagerId: userId,
    name: `PAMM: ${fundName}`,
    balance: Number(fund.currentDeposit) || 0,
  });
  await pammRepo.updateManagerById(fund.id, { tradingAccountId });
  const account = await tradingAccountRepo.findById(tradingAccountId, userId);
  return { tradingAccountId, account };
}

async function getPammTradingAccount(userId, fundId = null) {
  const funds = await pammRepo.listFundsByManagerId(userId);
  if (funds.length === 0) return null;
  if (fundId) {
    const fund = funds.find((f) => f.id === fundId);
    if (!fund?.tradingAccountId) return null;
    return tradingAccountRepo.findById(fund.tradingAccountId, userId);
  }
  const first = funds[0];
  if (!first?.tradingAccountId) return null;
  return tradingAccountRepo.findById(first.tradingAccountId, userId);
}

async function listPammTradingAccounts(userId) {
  const funds = await pammRepo.listFundsByManagerId(userId);
  const result = [];
  for (const f of funds) {
    if (!f.tradingAccountId) continue;
    const account = await tradingAccountRepo.findById(f.tradingAccountId, userId);
    if (account) result.push({ fundId: f.id, fundName: f.name, account });
  }
  return result;
}

async function listMyFunds(userId) {
  const funds = await pammRepo.listFundsByManagerId(userId);
  const result = [];
  for (const f of funds) {
    const stats = await getManagerStatsForFund(f.userId, f.id);
    result.push({ ...f, ...stats });
  }
  return result;
}

async function getManagerStatsForFund(managerUserId, fundId) {
  const allocations = await pammRepo.listAllocationsByManager(fundId, { status: 'active' });
  const manager = await pammRepo.getManagerById(fundId);
  const currentDeposit = manager?.currentDeposit ?? 0;
  const fundSize = manager?.fundSize ?? 0;
  const aum = allocations.reduce((s, a) => s + (a.allocatedBalance || 0), 0) + currentDeposit;
  return {
    aum,
    investors: allocations.length,
    fundSize,
    currentDeposit,
  };
}

async function updateManagerProfile(userId, payload) {
  const allowed = ['name', 'allocationPercent', 'performanceFeePercent', 'cutoffWithdrawEnabled', 'isPublic', 'strategy', 'fundType', 'fundSize', 'currentDeposit'];
  const update = {};
  for (const k of allowed) {
    if (payload[k] !== undefined) update[k] = payload[k];
  }
  if (payload.allocationPercent !== undefined) update.allocationPercent = Number(payload.allocationPercent);
  if (payload.performanceFeePercent !== undefined) update.performanceFeePercent = Number(payload.performanceFeePercent);
  if (payload.fundSize !== undefined) update.fundSize = Number(payload.fundSize);
  if (payload.currentDeposit !== undefined) update.currentDeposit = Number(payload.currentDeposit);

  if (payload.currentDeposit !== undefined) {
    const current = await pammRepo.getManagerByUserId(userId);
    if (current?.tradingAccountId) {
      const oldDeposit = Number(current.currentDeposit) || 0;
      const newDeposit = Number(payload.currentDeposit) || 0;
      const delta = newDeposit - oldDeposit;
      const uid = String(userId);
      if (delta > 0) {
        const wallet = await walletRepo.getOrCreateWallet(uid, 'USD');
        if ((wallet.balance ?? 0) >= delta) {
          await financialTransactionService.runPairedWithTransaction(async (session) => {
            await financialTransactionService.syncWalletToLedgerAfterMutation(session, uid, 'USD', async (s) => {
              await ledgerService.postPammManagerCapitalAdd(userId, delta, 'USD', current.id, current.id, { session: s });
            });
            await walletRepo.createTransaction(
              {
                userId: uid,
                type: 'pamm_manager_cap_in',
                amount: -delta,
                currency: 'USD',
                status: 'completed',
                reference: current.id,
                destination: `pamm:${current.id}`,
                completedAt: new Date(),
              },
              { session }
            );
          }, { label: 'pamm_manager_cap_in' });
          await tradingAccountRepo.updateBalance(current.tradingAccountId, userId, delta);
        }
      } else if (delta < 0) {
        const withdrawAmount = -delta;
        await financialTransactionService.runPairedWithTransaction(async (session) => {
          await financialTransactionService.syncWalletToLedgerAfterMutation(session, uid, 'USD', async (s) => {
            await ledgerService.postPammManagerCapitalWithdraw(userId, withdrawAmount, 'USD', current.id, current.id, {
              session: s,
            });
          });
          await walletRepo.createTransaction(
            {
              userId: uid,
              type: 'pamm_manager_cap_out',
              amount: withdrawAmount,
              currency: 'USD',
              status: 'completed',
              reference: current.id,
              completedAt: new Date(),
            },
            { session }
          );
        }, { label: 'pamm_manager_cap_out' });
        await tradingAccountRepo.updateBalance(current.tradingAccountId, userId, -withdrawAmount);
      }
    }
  }

  if (Object.keys(update).length === 0) return pammRepo.getManagerByUserId(userId);
  return pammRepo.updateManager(userId, update);
}

async function getManagerStats(userId, fundId = null) {
  const funds = await pammRepo.listFundsByManagerId(userId);
  if (funds.length === 0) return { aum: 0, investors: 0, fundSize: 0, currentDeposit: 0 };
  const fund = fundId ? funds.find((f) => f.id === fundId) : funds[0];
  if (!fund) return { aum: 0, investors: 0, fundSize: 0, currentDeposit: 0 };
  return getManagerStatsForFund(userId, fund.id);
}

// ---------- Allocations (follow / unfollow) ----------
async function follow(followerId, managerId, allocatedBalance = 0) {
  const manager = await pammRepo.getManagerByUserId(managerId) || await pammRepo.getManagerById(managerId);
  if (!manager) {
    const err = new Error('Manager not found');
    err.statusCode = 404;
    throw err;
  }
  if (!manager.isPublic) {
    const err = new Error('Manager is not accepting followers');
    err.statusCode = 403;
    throw err;
  }
  const status = manager.approvalStatus;
  if (status === 'pending' || status === 'rejected') {
    const err = new Error('This fund is pending admin approval');
    err.statusCode = 403;
    throw err;
  }
  const amount = Number(allocatedBalance) || 0;
  if (amount <= 0) {
    const err = new Error('Allocation amount must be greater than 0');
    err.statusCode = 400;
    throw err;
  }
  const fundId = manager.id;
  if (isBullRunFund(manager)) {
    const accepted = await pammRepo.hasAccepted(followerId, fundId);
    if (!accepted) {
      const err = new Error('Accept Investor Terms before following.');
      err.statusCode = 403;
      throw err;
    }
  }
  const existing = await pammRepo.getActiveAllocation(followerId, fundId);
  if (existing) {
    const err = new Error('Already following this manager');
    err.statusCode = 409;
    throw err;
  }
  if (!manager.tradingAccountId) {
    const err = new Error('Fund has no trading account yet');
    err.statusCode = 400;
    throw err;
  }
  const uid = String(followerId || '');
  const wallet = await walletRepo.getOrCreateWallet(uid, 'USD');
  if ((wallet.balance ?? 0) < amount) {
    const err = new Error('Insufficient wallet balance');
    err.statusCode = 400;
    throw err;
  }
  await financialTransactionService.runPairedWithTransaction(async (session) => {
    await financialTransactionService.syncWalletToLedgerAfterMutation(session, uid, 'USD', async (s) => {
      await ledgerService.postPammAllocation(followerId, amount, 'USD', fundId, fundId, { session: s });
    });
    await walletRepo.createTransaction(
      {
        userId: uid,
        type: 'pamm_alloc',
        amount: -amount,
        currency: 'USD',
        status: 'completed',
        reference: fundId,
        destination: `pamm:${fundId}`,
        completedAt: new Date(),
      },
      { session }
    );
  }, { label: 'pamm_follow_alloc' });
  const managerUserId = manager.userId;
  await tradingAccountRepo.updateBalance(manager.tradingAccountId, managerUserId, amount);
  const id = await pammRepo.createAllocation(followerId, fundId, amount);
  const allocation = await pammRepo.getAllocationById(id, followerId);
  return { allocationId: id, status: 'active', allocation };
}

/** Record investor terms acceptance for Bull Run (required before follow). */
async function recordAcceptance(followerId, fundId, ipAddress) {
  await pammRepo.recordAcceptance(followerId, fundId, true, ipAddress);
  return { accepted: true };
}

async function unfollow(followerId, allocationId) {
  const allocation = await pammRepo.getAllocationById(allocationId, followerId);
  if (!allocation) {
    const err = new Error('Allocation not found');
    err.statusCode = 404;
    throw err;
  }
  if (allocation.status !== 'active') {
    const err = new Error('Allocation is not active');
    err.statusCode = 400;
    throw err;
  }
  const manager = await pammRepo.getManagerById(allocation.managerId);
  await ensureClassicPammEnabledForFund(manager);
  if (manager && isBullRunFund(manager)) {
    const hasOpen = await hasOpenPositionsForFund(allocation.managerId);
    if (hasOpen) {
      const err = new Error('Active trade running. You cannot unfollow until the trade closes.');
      err.statusCode = 403;
      throw err;
    }
  }
  const amount = allocation.allocatedBalance || 0;
  if (amount > 0) {
    const manager = await pammRepo.getManagerById(allocation.managerId);
    if (manager?.tradingAccountId) {
      const managerUserId = manager.userId;
      const fid = String(followerId || '');
      await financialTransactionService.runPairedWithTransaction(async (session) => {
        await financialTransactionService.syncWalletToLedgerAfterMutation(session, fid, 'USD', async (s) => {
          await ledgerService.postPammUnallocation(followerId, amount, 'USD', allocationId, allocation.managerId, {
            session: s,
          });
        });
        await walletRepo.createTransaction(
          {
            userId: fid,
            type: 'pamm_unalloc',
            amount,
            currency: 'USD',
            status: 'completed',
            reference: allocationId,
            completedAt: new Date(),
          },
          { session }
        );
      }, { label: 'pamm_unfollow_unalloc' });
      await tradingAccountRepo.updateBalance(manager.tradingAccountId, managerUserId, -amount);
    }
  }
  await pammRepo.updateAllocation(allocationId, {
    status: 'closed',
    closedAt: new Date(),
  });
  return { status: 'closed' };
}

async function addFunds(followerId, allocationId, amount) {
  const allocation = await pammRepo.getAllocationById(allocationId, followerId);
  if (!allocation) {
    const err = new Error('Allocation not found');
    err.statusCode = 404;
    throw err;
  }
  if (allocation.status !== 'active') {
    const err = new Error('Allocation is not active');
    err.statusCode = 400;
    throw err;
  }
  const addAmount = Number(amount) || 0;
  if (addAmount <= 0) {
    const err = new Error('Invalid amount');
    err.statusCode = 400;
    throw err;
  }
  const manager = await pammRepo.getManagerById(allocation.managerId);
  await ensureClassicPammEnabledForFund(manager);
  if (!manager?.tradingAccountId) {
    const err = new Error('Fund has no trading account');
    err.statusCode = 400;
    throw err;
  }
  const uid = String(followerId || '');
  const wallet = await walletRepo.getOrCreateWallet(uid, 'USD');
  if ((wallet.balance || 0) < addAmount) {
    const err = new Error('Insufficient wallet balance');
    err.statusCode = 400;
    throw err;
  }
  await financialTransactionService.runPairedWithTransaction(async (session) => {
    await financialTransactionService.syncWalletToLedgerAfterMutation(session, uid, 'USD', async (s) => {
      await ledgerService.postPammAllocation(followerId, addAmount, 'USD', allocationId, allocation.managerId, {
        session: s,
      });
    });
    await walletRepo.createTransaction(
      {
        userId: uid,
        type: 'pamm_alloc',
        amount: -addAmount,
        currency: 'USD',
        status: 'completed',
        reference: allocationId,
        destination: `pamm:${allocation.managerId}`,
        completedAt: new Date(),
      },
      { session }
    );
  }, { label: 'pamm_add_funds_alloc' });
  await tradingAccountRepo.updateBalance(manager.tradingAccountId, manager.userId, addAmount);
  const newBalance = (allocation.allocatedBalance || 0) + addAmount;
  await pammRepo.updateAllocation(allocationId, { allocatedBalance: newBalance });
  return { allocationId, allocatedBalance: newBalance };
}

async function requestWithdraw(followerId, allocationId, amount) {
  const allocation = await pammRepo.getAllocationById(allocationId, followerId);
  if (!allocation) {
    const err = new Error('Allocation not found');
    err.statusCode = 404;
    throw err;
  }
  if (allocation.status !== 'active') {
    const err = new Error('Allocation is not active');
    err.statusCode = 400;
    throw err;
  }
  const manager = await pammRepo.getManagerById(allocation.managerId);
  await ensureClassicPammEnabledForFund(manager);
  if (manager && isBullRunFund(manager)) {
    const hasOpen = await hasOpenPositionsForFund(allocation.managerId);
    if (hasOpen) {
      const err = new Error('Active trade running. Withdrawal is not allowed until trades close.');
      err.statusCode = 403;
      throw err;
    }
  }
  const withdrawAmount = Number(amount) || allocation.allocatedBalance;
  if (withdrawAmount <= 0 || withdrawAmount > (allocation.allocatedBalance || 0)) {
    const err = new Error('Invalid withdrawal amount');
    err.statusCode = 400;
    throw err;
  }
  if (!manager?.tradingAccountId) {
    const err = new Error('Fund has no trading account');
    err.statusCode = 400;
    throw err;
  }
  const uid = String(followerId || '');
  await financialTransactionService.runPairedWithTransaction(async (session) => {
    await financialTransactionService.syncWalletToLedgerAfterMutation(session, uid, 'USD', async (s) => {
      await ledgerService.postPammUnallocation(followerId, withdrawAmount, 'USD', allocationId, allocation.managerId, {
        session: s,
      });
    });
    await walletRepo.createTransaction(
      {
        userId: uid,
        type: 'pamm_unalloc',
        amount: withdrawAmount,
        currency: 'USD',
        status: 'completed',
        reference: allocationId,
        completedAt: new Date(),
      },
      { session }
    );
  }, { label: 'pamm_request_withdraw_unalloc' });
  await tradingAccountRepo.updateBalance(manager.tradingAccountId, manager.userId, -withdrawAmount);
  const newBalance = (allocation.allocatedBalance || 0) - withdrawAmount;
  if (newBalance <= 0) {
    await pammRepo.updateAllocation(allocationId, {
      status: 'closed',
      allocatedBalance: 0,
      closedAt: new Date(),
    });
    return { allocationId, status: 'closed', amount: withdrawAmount };
  }
  await pammRepo.updateAllocation(allocationId, { allocatedBalance: newBalance });
  return { allocationId, status: 'active', amount: withdrawAmount, allocatedBalance: newBalance };
}

async function getMyAllocations(followerId, options = {}) {
  const list = await pammRepo.listAllocationsByFollower(followerId, options);
  for (const a of list) {
    const m = await pammRepo.getManagerById(a.managerId) || await pammRepo.getManagerByUserId(a.managerId);
    a.managerName = m?.name || 'Unknown';
    if (m?.id) {
      const fundAllocations = await pammRepo.listAllocationsByManager(m.id, { status: 'active' });
      const managerCapital = Number(m.currentDeposit) || 0;
      const investorCapital = fundAllocations.reduce((s, x) => s + (x.allocatedBalance || 0), 0);
      const fundAum = managerCapital + investorCapital;
      a.fundAum = fundAum;
      a.allocationPercent = fundAum > 0 ? ((a.allocatedBalance || 0) / fundAum) * 100 : 0;
      const cumulativePnl = await pammRepo.getFundCumulativePnl(m.id);
      a.fundGrowthRate = fundAum > 0 ? (cumulativePnl / fundAum) * 100 : 0;
      a.fundCumulativePnl = cumulativePnl;
    } else {
      a.fundAum = 0;
      a.allocationPercent = 0;
      a.fundGrowthRate = 0;
      a.fundCumulativePnl = 0;
    }
  }
  return list;
}

async function getMyFollowerTrades(followerId, options = {}) {
  const allocations = await pammRepo.listAllocationsByFollower(followerId, { status: 'active' });
  const fundIds = [...new Set(allocations.map((a) => a.managerId))];
  const allTrades = [];
  for (const fundId of fundIds) {
    const trades = await pammRepo.listTradesByManager(fundId, { limit: options.limit || 20 });
    const m = await pammRepo.getManagerById(fundId);
    for (const t of trades) {
      allTrades.push({ ...t, managerName: m?.name || 'Unknown' });
    }
  }
  return allTrades.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, options.limit || 50);
}

async function getMyInvestors(fundId, options = {}) {
  const allocations = await pammRepo.listAllocationsByManager(fundId, { ...options, status: 'active' });
  if (!allocations.length) return [];
  const userIds = [...new Set(allocations.map((a) => normalizeFollowerId(a.followerId)).filter(Boolean))];
  const userMap = {};
  await Promise.all(
    userIds.map(async (uid) => {
      const u = await userRepo.findById(uid);
      if (u) {
        const fullName = u.name != null && String(u.name).trim() ? String(u.name).trim() : null;
        userMap[uid] = { name: fullName, email: u.email || null };
      }
    })
  );
  return allocations.map((a) => {
    const fid = normalizeFollowerId(a.followerId);
    const u = userMap[fid] || {};
    const fullName = u.name ?? null;
    return {
      ...a,
      followerId: fid,
      investorName: fullName,
      investorEmail: u.email ?? null,
      investorFullName: fullName,
    };
  });
}

/**
 * Manager-only: deposit/withdraw log and profit/ROI for one investor in manager's fund.
 * Access: caller must be the fund manager.
 */
async function getInvestorDetail(fundId, followerId, managerUserId) {
  const fund = await pammRepo.getManagerById(fundId) || await pammRepo.getManagerByUserId(fundId);
  if (!fund) return null;
  const myFunds = await pammRepo.listFundsByManagerId(managerUserId);
  const isMyFund = myFunds.some((f) => String(f.id) === String(fundId));
  if (!isMyFund) return null;
  const allocations = await pammRepo.listAllocationsByManager(fundId, { status: 'active' });
  const allocation = allocations.find((a) => String(a.followerId) === String(followerId));
  if (!allocation) return null;

  const txns = await walletRepo.getTransactions(followerId, { type: ['pamm_alloc', 'pamm_unalloc'], limit: 100 });
  const fundTxns = txns.filter(
    (t) => t.reference === fundId || t.destination === `pamm:${fundId}` || t.reference === allocation.id
  );
  let totalInvested = 0;
  const depositWithdrawLog = fundTxns
    .map((t) => {
      const amount = Number(t.amount) || 0;
      const isAlloc = t.type === 'pamm_alloc';
      if (isAlloc) totalInvested += amount;
      else totalInvested -= Math.abs(amount);
      return {
        type: isAlloc ? 'Deposit' : 'Withdraw',
        amount: Math.abs(amount),
        date: t.createdAt || t.created_at,
        status: t.status ?? null,
        referenceId: t.id ?? null,
      };
    })
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  const currentActiveCapital = Number(allocation.allocatedBalance) || 0;
  const totalProfit = currentActiveCapital - totalInvested;
  const roi = totalInvested > 0 ? (totalProfit / totalInvested) * 100 : 0;
  const realizedPnl = Number(allocation.realizedPnl) || 0;

  const user = await userRepo.findById(followerId);
  return {
    depositWithdrawLog,
    totalInvested,
    totalProfit,
    roi,
    currentActiveCapital,
    currentValue: currentActiveCapital,
    realizedPnl,
    investorName: user?.name ?? null,
    investorEmail: user?.email ?? null,
  };
}

// ---------- Trades ----------
async function getTrades(managerIdOrFundId, options = {}) {
  const fund = await pammRepo.getManagerById(managerIdOrFundId) || await pammRepo.getManagerByUserId(managerIdOrFundId);
  const id = fund ? fund.id : managerIdOrFundId;
  return pammRepo.listTradesByManager(id, options);
}

export default {
  listManagers,
  getManager,
  getFundDetail,
  getManagerStats,
  listMyFunds,
  registerAsManager,
  createPammTradingAccount,
  getPammTradingAccount,
  listPammTradingAccounts,
  updateManagerProfile,
  follow,
  recordAcceptance,
  unfollow,
  addFunds,
  requestWithdraw,
  getMyAllocations,
  getMyFollowerTrades,
  getMyInvestors,
  getInvestorDetail,
  getTrades,
};
