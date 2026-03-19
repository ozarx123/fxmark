/**
 * PAMM profit distribution — distribute P&L among participants and post to ledger
 * Bull Run (fundType 'ai'): share-based allocation, 1% daily cap per investor, compound into balance, excess to reserve
 *
 * Reliability: owner lock + heartbeat (multi-instance), per-user success/fail stats, audit runs, safe retry.
 */
import pammRepo from './pamm.repository.js';
import tradingAccountRepo from '../trading/trading-account.repository.js';
import ledgerService from '../finance/ledger.service.js';
import walletRepo from '../wallet/wallet.repository.js';
import financialTransactionService from '../finance/financial-transaction.service.js';
import commissionEngine from '../ib/commission.engine.js';
import ibRepo from '../ib/ib.repository.js';
import { processPammIbCommissionOnTradeClose } from '../ib/pamm-ib-commission.service.js';
import { emitPammAllocationUpdate } from './pamm.events.js';
import positionRepo from '../trading/position.repository.js';
import pammDistRunsRepo from './pamm-distribution-runs.repository.js';

const DAILY_PROFIT_CAP_PERCENT = 1;
const HEARTBEAT_MIN_MS = 10_000;
const HEARTBEAT_MAX_MS = 30_000;
const HEARTBEAT_EVERY_N_USERS = 5;

function isBullRunFund(fund) {
  if (!fund) return false;
  const name = String(fund.name || '').toUpperCase();
  const type = String(fund.fundType || '').toLowerCase();
  return name === 'BULL RUN' || type === 'ai';
}

function heartbeatIntervalMs() {
  const n = parseInt(process.env.PAMM_DIST_HEARTBEAT_MS || '', 10);
  if (!Number.isFinite(n) || n < HEARTBEAT_MIN_MS) return 20_000;
  return Math.min(HEARTBEAT_MAX_MS, Math.max(HEARTBEAT_MIN_MS, n));
}

function createRunCtx(positionId, managerId, ownerId, runId) {
  const stats = { totalUsers: 0, successCount: 0, failedCount: 0, failedUserIds: [] };
  let lastHb = 0;
  let ix = 0;
  return {
    positionId,
    managerId,
    ownerId,
    runId,
    stats,
    async pulse() {
      ix += 1;
      const interval = heartbeatIntervalMs();
      const now = Date.now();
      if (now - lastHb < interval && ix % HEARTBEAT_EVERY_N_USERS !== 0) return;
      lastHb = now;
      await positionRepo.touchPammDistributionHeartbeat(positionId, managerId, ownerId);
      if (runId) {
        await pammDistRunsRepo.touchRunHeartbeat(runId);
        await pammDistRunsRepo.updateRunProgress(runId, {
          totalUsers: stats.totalUsers,
          successCount: stats.successCount,
          failedCount: stats.failedCount,
          failedUserIds: stats.failedUserIds,
          lastHeartbeatAt: new Date(),
        });
      }
    },
    recordSuccess() {
      stats.successCount += 1;
    },
    recordFail(uid) {
      stats.failedCount += 1;
      if (stats.failedUserIds.length < 50) stats.failedUserIds.push(String(uid));
    },
    incTotal() {
      stats.totalUsers += 1;
    },
  };
}

async function getIbIdsForFollower(followerId) {
  const resolved = (await ibRepo.resolveUserIdFromFollowerId(followerId)) || String(followerId);
  return ibRepo.getUplineChainForClient(resolved);
}

async function endDistributionRun(ctx) {
  await positionRepo.setPammDistributionStats(ctx.positionId, ctx.managerId, ctx.ownerId, {
    totalUsers: ctx.stats.totalUsers,
    successCount: ctx.stats.successCount,
    failedCount: ctx.stats.failedCount,
    failedUserIds: ctx.stats.failedUserIds,
  });
  if (ctx.stats.failedCount > 0) {
    await positionRepo.markPammDistributionFailed(
      ctx.positionId,
      ctx.managerId,
      `partial_failures:${ctx.stats.failedCount}`,
      ctx.ownerId
    );
    if (ctx.runId) {
      await pammDistRunsRepo.finalizeRun(ctx.runId, 'failed', {
        totalUsers: ctx.stats.totalUsers,
        successCount: ctx.stats.successCount,
        failedCount: ctx.stats.failedCount,
        failedUserIds: ctx.stats.failedUserIds,
        error: `${ctx.stats.failedCount} user distribution(s) failed`,
      });
    }
  } else {
    await positionRepo.markPammDistributionCompleted(ctx.positionId, ctx.managerId, ctx.ownerId);
    if (ctx.runId) {
      await pammDistRunsRepo.finalizeRun(ctx.runId, 'completed', {
        totalUsers: ctx.stats.totalUsers,
        successCount: ctx.stats.successCount,
        failedCount: ctx.stats.failedCount,
        failedUserIds: ctx.stats.failedUserIds,
      });
    }
  }
}

/**
 * Distribute PAMM trade P&L to participants (manager + investors) and post to financial modules
 * @param {string} managerId - PAMM manager userId
 * @param {string} positionId - closed position id
 * @param {number} pnl - realized P&L (positive = profit, negative = loss)
 * @param {string} accountId - PAMM trading account id
 * @param {object} position - position doc (symbol, side, volume, openPrice)
 */
async function distributePammPnl(managerId, positionId, pnl, accountId, position = {}) {
  const fund = await pammRepo.getFundByTradingAccountId(accountId) || (await pammRepo.getManagerByUserId(managerId));
  const fundId = fund?.id;
  if (!fundId) return;

  try {
    await pammRepo.createTrade({
      managerId: fundId,
      positionId,
      symbol: position.symbol,
      side: position.side,
      volume: position.volume,
      price: position.openPrice,
      pnl,
    });
  } catch (e) {
    console.warn('[pamm] createTrade failed:', e.message);
  }
  const manager = fund;
  if (!manager) return;

  const allocations = await pammRepo.listAllocationsByManager(fundId, { status: 'active' });
  const managerCapital = Number(manager.currentDeposit) || 0;
  const investorCapital = allocations.reduce((s, a) => s + (a.allocatedBalance || 0), 0);
  const totalCapital = managerCapital + investorCapital;
  if (totalCapital <= 0) return;

  const distStart = await positionRepo.tryStartPammDistribution(positionId, managerId);
  if (!distStart.started) {
    console.log('[pamm] distribution not started:', distStart.reason, positionId);
    return;
  }
  const { ownerId } = distStart;

  let runId = null;
  try {
    runId = await pammDistRunsRepo.createRun({
      positionId,
      managerId,
      fundId,
      ownerId,
    });
  } catch (e) {
    console.warn('[pamm] distribution run log insert failed:', e.message);
  }

  const ctx = createRunCtx(positionId, managerId, ownerId, runId);

  try {
    const bullRun = isBullRunFund(manager);
    const performanceFeePercent = Number(manager.performanceFeePercent) || 0;
    const isProfit = pnl > 0;

    if (isProfit && performanceFeePercent > 0 && !bullRun) {
      const feeAmount = Math.round((pnl * performanceFeePercent) / 100 * 100) / 100;
      if (feeAmount > 0.001) {
        try {
          await financialTransactionService.runPairedWithTransaction(async (session) => {
            await financialTransactionService.syncWalletToLedgerAfterMutation(session, managerId, 'USD', async (s) => {
              await ledgerService.postPammFee(managerId, feeAmount, 'USD', positionId, fundId, { session: s });
            });
            await walletRepo.createTransaction(
              {
                userId: managerId,
                type: 'pamm_fee',
                amount: feeAmount,
                currency: 'USD',
                status: 'completed',
                reference: positionId,
                completedAt: new Date(),
              },
              { session }
            );
          }, { label: 'pamm_dist_performance_fee' });
        } catch (e) {
          console.warn('[pamm] Ledger/wallet post fee failed:', e.message);
        }
      }
    }

    const remainingPnl = isProfit && !bullRun ? pnl - (pnl * performanceFeePercent) / 100 : pnl;
    const tradeTimeMs = position?.closedAt ? new Date(position.closedAt).getTime() : Date.now();

    if (bullRun && isProfit) {
      await distributeBullRunProfit(
        fundId,
        managerId,
        accountId,
        positionId,
        position,
        allocations,
        remainingPnl,
        totalCapital,
        tradeTimeMs,
        ctx
      );
      await endDistributionRun(ctx);
      return;
    }

    if (bullRun && !isProfit) {
      await distributeBullRunLoss(
        fundId,
        managerId,
        accountId,
        positionId,
        position,
        allocations,
        remainingPnl,
        totalCapital,
        tradeTimeMs,
        ctx
      );
      await endDistributionRun(ctx);
      return;
    }

    // Non–Bull Run: original logic
    const managerShare = totalCapital > 0 ? (managerCapital / totalCapital) * remainingPnl : 0;
    const managerShareRounded = Math.round(managerShare * 100) / 100;

    if (Math.abs(managerShareRounded) > 0.001) {
      await tradingAccountRepo.updateBalance(accountId, managerId, managerShareRounded);
    }

    const updatedFollowerIds = [];
    for (const alloc of allocations) {
      await ctx.pulse();
      if (alloc.createdAt && new Date(alloc.createdAt).getTime() > tradeTimeMs) continue;
      const allocationShareOfFund = totalCapital > 0 ? (alloc.allocatedBalance || 0) / totalCapital : 0;
      const share = allocationShareOfFund * remainingPnl;
      const shareRounded = Math.round(share * 100) / 100;
      if (Math.abs(shareRounded) <= 0.001) continue;

      ctx.incTotal();
      if (await walletRepo.existsPammDistribution(alloc.followerId, positionId)) {
        ctx.recordSuccess();
        continue;
      }

      try {
        let createdDistTx = false;
        await financialTransactionService.runPairedWithTransaction(async (session) => {
          const { delta } = await financialTransactionService.syncWalletToLedgerAfterMutation(
            session,
            alloc.followerId,
            'USD',
            async (s) => {
              await ledgerService.postPammDistribution(
                alloc.followerId,
                Math.abs(shareRounded),
                'USD',
                positionId,
                isProfit,
                fundId,
                { session: s }
              );
            }
          );
          if (await walletRepo.existsPammDistribution(alloc.followerId, positionId, { session })) {
            return;
          }
          if (Math.abs(delta) < 0.001 && Math.abs(shareRounded) > 0.001) {
            await walletRepo.updateBalance(alloc.followerId, 'USD', shareRounded, { session });
          }
          await walletRepo.createTransaction(
            {
              userId: alloc.followerId,
              type: 'pamm_dist',
              amount: shareRounded,
              currency: 'USD',
              status: 'completed',
              reference: positionId,
              completedAt: new Date(),
            },
            { session }
          );
          createdDistTx = true;
        }, { label: 'pamm_dist_classic_follower' });
        ctx.recordSuccess();
        if (createdDistTx) {
          await pammRepo.incrementAllocationRealizedPnl(alloc.id, shareRounded);
          updatedFollowerIds.push(alloc.followerId);
        }
      } catch (e) {
        console.warn('[pamm] Ledger/wallet post dist for', alloc.followerId, 'failed:', e.message);
        ctx.recordFail(alloc.followerId);
      }

      try {
        const ibIds = await getIbIdsForFollower(alloc.followerId);
        const volLots = Number(position?.volume) || 0.01;
        if (ibIds.length && volLots > 0) {
          await commissionEngine.calculateForHierarchy(
            { id: positionId, volume: volLots, symbol: position?.symbol || 'PAMM', currency: 'USD' },
            ibIds,
            alloc.followerId
          );
        }
      } catch (e) {
        console.warn('[pamm] IB commission for follower failed:', e.message);
      }
    }

    if (updatedFollowerIds.length > 0 || Math.abs(managerShareRounded) > 0.001) {
      try {
        await emitPammAllocationUpdate(fundId, updatedFollowerIds, managerId);
      } catch (e) {
        console.warn('[pamm] emitPammAllocationUpdate failed:', e.message);
      }
    }

    await endDistributionRun(ctx);
  } catch (e) {
    const msg = e?.message || String(e);
    await positionRepo.markPammDistributionFailed(positionId, managerId, msg, ownerId);
    if (runId) {
      try {
        await pammDistRunsRepo.finalizeRun(runId, 'failed', {
          totalUsers: ctx.stats.totalUsers,
          successCount: ctx.stats.successCount,
          failedCount: ctx.stats.failedCount,
          failedUserIds: ctx.stats.failedUserIds,
          error: msg,
        });
      } catch (err) {
        console.warn('[pamm] finalizeRun failed:', err.message);
      }
    }
    console.warn('[pamm] distribution run failed:', positionId, msg);
  }
}

/** Bull Run profit: share allocation, 1% cap per investor, compound into allocatedBalance, excess to reserve */
async function distributeBullRunProfit(
  fundId,
  managerId,
  accountId,
  positionId,
  position,
  allocations,
  remainingPnl,
  totalCapital,
  tradeTimeMs,
  ctx
) {
  const updatedFollowerIds = [];
  let totalReserve = 0;

  await tradingAccountRepo.updateBalance(accountId, managerId, remainingPnl);

  for (const alloc of allocations) {
    await ctx.pulse();
    if (alloc.createdAt && new Date(alloc.createdAt).getTime() > tradeTimeMs) continue;
    const balance = Number(alloc.allocatedBalance) || 0;
    const investorSharePercent = totalCapital > 0 ? balance / totalCapital : 0;
    const calculatedProfit = investorSharePercent * remainingPnl;
    const capAmount = balance * (DAILY_PROFIT_CAP_PERCENT / 100);
    const investorCredit = Math.round(Math.min(calculatedProfit, capAmount) * 100) / 100;
    const extraProfit = Math.round((calculatedProfit - investorCredit) * 100) / 100;

    if (extraProfit > 0) totalReserve += extraProfit;
    if (investorCredit <= 0.001) continue;

    ctx.incTotal();
    if (await walletRepo.existsPammDistribution(alloc.followerId, positionId)) {
      ctx.recordSuccess();
      continue;
    }

    try {
      let createdDistTx = false;
      await financialTransactionService.runPairedWithTransaction(async (session) => {
        const { delta } = await financialTransactionService.syncWalletToLedgerAfterMutation(
          session,
          alloc.followerId,
          'USD',
          async (s) => {
            await ledgerService.postPammDistribution(
              alloc.followerId,
              investorCredit,
              'USD',
              positionId,
              true,
              fundId,
              { session: s }
            );
          }
        );
        if (await walletRepo.existsPammDistribution(alloc.followerId, positionId, { session })) {
          return;
        }
        if (Math.abs(delta) < 0.001 && investorCredit > 0.001) {
          await walletRepo.updateBalance(alloc.followerId, 'USD', investorCredit, { session });
        }
        await walletRepo.createTransaction(
          {
            userId: alloc.followerId,
            type: 'pamm_dist',
            amount: investorCredit,
            currency: 'USD',
            status: 'completed',
            reference: positionId,
            completedAt: new Date(),
          },
          { session }
        );
        createdDistTx = true;
      }, { label: 'pamm_dist_bull_profit' });
      ctx.recordSuccess();
      if (createdDistTx) {
        await pammRepo.incrementAllocationRealizedPnl(alloc.id, investorCredit);
        const newBalance = balance + investorCredit;
        await pammRepo.updateAllocation(alloc.id, { allocatedBalance: newBalance });
        updatedFollowerIds.push(alloc.followerId);
      }
    } catch (e) {
      console.warn('[pamm] Bull Run dist for', alloc.followerId, 'failed:', e.message);
      ctx.recordFail(alloc.followerId);
    }

    try {
      const activeCapital = balance;
      if (activeCapital > 0.001 && investorCredit > 0) {
        const normalizedInvestorId = (await ibRepo.resolveUserIdFromFollowerId(alloc.followerId)) || String(alloc.followerId);
        await ibRepo.incrementPammInvestorDailyCreditedProfit(normalizedInvestorId, investorCredit);
        const todayCreditedProfit = await ibRepo.getPammInvestorDailyCreditedProfit(normalizedInvestorId);
        await processPammIbCommissionOnTradeClose(
          normalizedInvestorId,
          activeCapital,
          fundId,
          positionId,
          todayCreditedProfit
        );
      }
    } catch (e) {
      console.warn('[pamm] Bull Run IB commission for follower failed:', e.message);
    }
  }

  if (totalReserve > 0.001) {
    await pammRepo.incrementFundReserve(fundId, totalReserve);
  }
  if (updatedFollowerIds.length > 0) {
    try {
      await emitPammAllocationUpdate(fundId, updatedFollowerIds, managerId);
    } catch (e) {
      console.warn('[pamm] emitPammAllocationUpdate failed:', e.message);
    }
  }
}

/** Bull Run loss: share-based, deduct from allocation balance and wallet */
async function distributeBullRunLoss(
  fundId,
  managerId,
  accountId,
  positionId,
  position,
  allocations,
  remainingPnl,
  totalCapital,
  tradeTimeMs,
  ctx
) {
  const updatedFollowerIds = [];
  await tradingAccountRepo.updateBalance(accountId, managerId, remainingPnl);

  for (const alloc of allocations) {
    await ctx.pulse();
    if (alloc.createdAt && new Date(alloc.createdAt).getTime() > tradeTimeMs) continue;
    const balance = Number(alloc.allocatedBalance) || 0;
    const investorSharePercent = totalCapital > 0 ? balance / totalCapital : 0;
    const share = investorSharePercent * remainingPnl;
    const shareRounded = Math.round(share * 100) / 100;
    if (Math.abs(shareRounded) <= 0.001) continue;

    ctx.incTotal();
    try {
      await financialTransactionService.runPairedWithTransaction(async (session) => {
        await financialTransactionService.syncWalletToLedgerAfterMutation(
          session,
          alloc.followerId,
          'USD',
          async (s) => {
            await ledgerService.postPammDistribution(
              alloc.followerId,
              Math.abs(shareRounded),
              'USD',
              positionId,
              false,
              fundId,
              { session: s }
            );
          }
        );
      }, { label: 'pamm_dist_bull_loss' });
      await pammRepo.incrementAllocationRealizedPnl(alloc.id, shareRounded);
      const newBalance = Math.max(0, balance + shareRounded);
      await pammRepo.updateAllocation(alloc.id, { allocatedBalance: newBalance });
      updatedFollowerIds.push(alloc.followerId);
      ctx.recordSuccess();
    } catch (e) {
      console.warn('[pamm] Bull Run loss dist for', alloc.followerId, 'failed:', e.message);
      ctx.recordFail(alloc.followerId);
    }
  }

  if (updatedFollowerIds.length > 0) {
    try {
      await emitPammAllocationUpdate(fundId, updatedFollowerIds, managerId);
    } catch (e) {
      console.warn('[pamm] emitPammAllocationUpdate failed:', e.message);
    }
  }
}

export default { distributePammPnl };
