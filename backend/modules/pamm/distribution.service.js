/**
 * PAMM profit distribution — distribute P&L among participants and post to ledger
 * Bull Run (fundType 'ai'): share-based allocation, 1% daily cap per investor, compound into balance, excess to reserve
 *
 * Reliability: owner lock + heartbeat (multi-instance), per-user success/fail stats, audit runs, safe retry.
 */
import pammRepo from './pamm.repository.js';
import tradingAccountRepo from '../trading/trading-account.repository.js';
import ledgerService from '../finance/ledger.service.js';
import ledgerRepo from '../finance/ledger.repository.js';
import walletRepo from '../wallet/wallet.repository.js';
import financialTransactionService from '../finance/financial-transaction.service.js';
import commissionEngine from '../ib/commission.engine.js';
import ibRepo from '../ib/ib.repository.js';
import { processPammIbCommissionOnTradeClose } from '../ib/pamm-ib-commission.service.js';
import { emitPammAllocationUpdate } from './pamm.events.js';
import positionRepo from '../trading/position.repository.js';
import pammDistRunsRepo from './pamm-distribution-runs.repository.js';
import { getDb, withTransaction } from '../../config/mongo.js';
import { ObjectId } from 'mongodb';

const DAILY_PROFIT_CAP_PERCENT = 1;
const INVESTOR_DAILY_CAP_PERCENT = 0.8;
const HEARTBEAT_MIN_MS = 10_000;
const HEARTBEAT_MAX_MS = 30_000;
const HEARTBEAT_EVERY_N_USERS = 5;
const INVESTOR_DAILY_CAPS_COLLECTION = 'pamm_investor_daily_caps';
const IB_DAILY_CAPS_COLLECTION = 'pamm_ib_daily_caps';
const EQUITY_SNAPSHOTS_COLLECTION = 'pamm_equity_snapshots';
const RESERVE_WALLETS_COLLECTION = 'pamm_reserve_wallets';
const RESERVE_TRANSACTIONS_COLLECTION = 'pamm_reserve_transactions';
const RESERVE_WALLET_TYPE = 'pamm_ai_reserve';
const RESERVE_DIST_RUNS_COLLECTION = 'pamm_reserve_distribution_runs';
const RESERVE_DIST_ITEMS_COLLECTION = 'pamm_reserve_distribution_items';

function round2(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.round(x * 100) / 100;
}

/**
 * UTC date key for daily cap rows.
 * @param {Date} [inputDate]
 * @returns {string} YYYY-MM-DD (UTC)
 */
export function getUtcDateKey(inputDate = new Date()) {
  const d = inputDate instanceof Date ? inputDate : new Date(inputDate);
  if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
  return d.toISOString().slice(0, 10);
}

/**
 * Get existing or create a new investor daily cap row for UTC date.
 * Does not increment investorCreditedToday in this step.
 */
export async function getOrCreateInvestorDailyCapRow({
  fundId,
  investorId,
  asOfDate,
  startOfDayActiveCapital,
}) {
  const dateKeyUtc = getUtcDateKey(asOfDate || new Date());
  const fund = String(fundId || '');
  const investor = String(investorId || '');
  const baseCapital = Math.max(0, round2(startOfDayActiveCapital));
  const capAmount = round2(baseCapital * (INVESTOR_DAILY_CAP_PERCENT / 100));
  const now = new Date();

  const db = await getDb();
  const col = db.collection(INVESTOR_DAILY_CAPS_COLLECTION);

  const existing = await col.findOne({ fundId: fund, investorId: investor, dateKeyUtc });
  if (existing) return existing;

  const doc = {
    fundId: fund,
    investorId: investor,
    dateKeyUtc,
    startOfDayActiveCapital: baseCapital,
    investorDailyCapAmount: capAmount,
    investorCreditedToday: 0,
    createdAt: now,
    updatedAt: now,
  };

  try {
    const { insertedId } = await col.insertOne(doc);
    return { _id: insertedId, ...doc };
  } catch (e) {
    // Race-safe fallback: if another writer inserted same unique key, read it back.
    if (e?.code === 11000) {
      const row = await col.findOne({ fundId: fund, investorId: investor, dateKeyUtc });
      if (row) return row;
    }
    throw e;
  }
}

/**
 * Read-only cap state helper for Bull Run investor cumulative daily cap.
 */
export async function getInvestorDailyCapState({
  fundId,
  investorId,
  asOfDate,
  startOfDayActiveCapital,
}) {
  const row = await getOrCreateInvestorDailyCapRow({
    fundId,
    investorId,
    asOfDate,
    startOfDayActiveCapital,
  });

  const cap = round2(row?.investorDailyCapAmount);
  const credited = round2(row?.investorCreditedToday);
  const remaining = round2(Math.max(0, cap - credited));

  return {
    dateKeyUtc: String(row?.dateKeyUtc || getUtcDateKey(asOfDate || new Date())),
    startOfDayActiveCapital: Math.max(0, round2(row?.startOfDayActiveCapital)),
    investorDailyCapAmount: cap,
    investorCreditedToday: credited,
    remainingInvestorCap: remaining,
  };
}

async function incrementInvestorDailyCapCreditedToday({
  fundId,
  investorId,
  asOfDate,
  amount,
}) {
  const inc = round2(amount);
  if (inc <= 0) return;
  const dateKeyUtc = getUtcDateKey(asOfDate || new Date());
  const db = await getDb();
  const col = db.collection(INVESTOR_DAILY_CAPS_COLLECTION);
  await col.updateOne(
    {
      fundId: String(fundId || ''),
      investorId: String(investorId || ''),
      dateKeyUtc,
    },
    { $inc: { investorCreditedToday: inc }, $set: { updatedAt: new Date() } }
  );
}

/**
 * Resolve true start-of-day active capital for investor/day.
 * Reads once-per-day snapshot; if missing, falls back to current allocation balance
 * and persists snapshot row (idempotent via unique key fallback).
 */
async function getStartOfDayActiveCapital({
  fundId,
  investorId,
  dateKeyUtc,
  currentAllocatedBalance,
}) {
  const fund = String(fundId || '');
  const investor = String(investorId || '');
  const key = String(dateKeyUtc || getUtcDateKey(new Date()));
  const fallback = Math.max(0, round2(currentAllocatedBalance));
  const now = new Date();
  const db = await getDb();
  const col = db.collection(EQUITY_SNAPSHOTS_COLLECTION);

  await col.createIndex(
    { fundId: 1, investorId: 1, dateKeyUtc: 1 },
    { unique: true, name: 'pamm_equity_snapshots_unique' }
  );

  const existing = await col.findOne({ fundId: fund, investorId: investor, dateKeyUtc: key });
  if (existing) {
    return Math.max(0, round2(existing.activeCapitalSnapshot));
  }

  const doc = {
    fundId: fund,
    investorId: investor,
    dateKeyUtc: key,
    activeCapitalSnapshot: fallback,
    source: 'allocation_fallback',
    createdAt: now,
    updatedAt: now,
  };
  try {
    await col.insertOne(doc);
    return fallback;
  } catch (e) {
    if (e?.code === 11000) {
      const row = await col.findOne({ fundId: fund, investorId: investor, dateKeyUtc: key });
      if (row) return Math.max(0, round2(row.activeCapitalSnapshot));
    }
    throw e;
  }
}

/**
 * Get/create IB daily cap row by (fundId, investorId, ibUserId, level, dateKeyUtc).
 * Cap fixed at 0.25% of start-of-day active capital for this step.
 */
async function getOrCreateIbDailyCapRow({
  fundId,
  investorId,
  ibUserId,
  level,
  asOfDate,
  startOfDayActiveCapital,
}) {
  const dateKeyUtc = getUtcDateKey(asOfDate || new Date());
  const fund = String(fundId || '');
  const investor = String(investorId || '');
  const ib = String(ibUserId || '');
  const lvl = Number(level) || 0;
  const baseCapital = Math.max(0, round2(startOfDayActiveCapital));
  const capAmount = round2(baseCapital * 0.0025);
  const now = new Date();

  const db = await getDb();
  const col = db.collection(IB_DAILY_CAPS_COLLECTION);
  const filter = {
    fundId: fund,
    investorId: investor,
    ibUserId: ib,
    level: lvl,
    dateKeyUtc,
  };
  const existing = await col.findOne(filter);
  if (existing) return existing;

  const doc = {
    fundId: fund,
    investorId: investor,
    ibUserId: ib,
    level: lvl,
    dateKeyUtc,
    startOfDayActiveCapital: baseCapital,
    ibDailyCapAmount: capAmount,
    ibCreditedToday: 0,
    createdAt: now,
    updatedAt: now,
  };
  try {
    const { insertedId } = await col.insertOne(doc);
    return { _id: insertedId, ...doc };
  } catch (e) {
    if (e?.code === 11000) {
      const row = await col.findOne(filter);
      if (row) return row;
    }
    throw e;
  }
}

async function getIbDailyCapState({
  fundId,
  investorId,
  ibUserId,
  level,
  asOfDate,
  startOfDayActiveCapital,
}) {
  const row = await getOrCreateIbDailyCapRow({
    fundId,
    investorId,
    ibUserId,
    level,
    asOfDate,
    startOfDayActiveCapital,
  });
  const cap = round2(row?.ibDailyCapAmount);
  const credited = round2(row?.ibCreditedToday);
  return {
    ibDailyCapAmount: cap,
    ibCreditedToday: credited,
    remainingIbCap: round2(Math.max(0, cap - credited)),
    dateKeyUtc: String(row?.dateKeyUtc || getUtcDateKey(asOfDate || new Date())),
  };
}

async function setIbDailyCapStatus({
  fundId,
  investorId,
  ibUserId,
  level,
  asOfDate,
  reference,
  status,
  error = null,
}) {
  const dateKeyUtc = getUtcDateKey(asOfDate || new Date());
  const db = await getDb();
  const col = db.collection(IB_DAILY_CAPS_COLLECTION);
  const patch = {
    payoutStatus: status,
    lastReference: String(reference || ''),
    updatedAt: new Date(),
  };
  if (error) patch.lastError = String(error).slice(0, 500);
  await col.updateOne(
    {
      fundId: String(fundId || ''),
      investorId: String(investorId || ''),
      ibUserId: String(ibUserId || ''),
      level: Number(level) || 0,
      dateKeyUtc,
    },
    { $set: patch }
  );
}

async function incrementIbDailyCapCreditedToday({
  fundId,
  investorId,
  ibUserId,
  level,
  asOfDate,
  amount,
}) {
  const inc = round2(amount);
  if (inc <= 0) return;
  const dateKeyUtc = getUtcDateKey(asOfDate || new Date());
  const db = await getDb();
  const col = db.collection(IB_DAILY_CAPS_COLLECTION);
  await col.updateOne(
    {
      fundId: String(fundId || ''),
      investorId: String(investorId || ''),
      ibUserId: String(ibUserId || ''),
      level: Number(level) || 0,
      dateKeyUtc,
    },
    { $inc: { ibCreditedToday: inc }, $set: { updatedAt: new Date() } }
  );
}

/**
 * Get/create fund reserve wallet (Bull Run vNext).
 * Race-safe via unique (fundId, walletType) fallback.
 */
async function getOrCreateReserveWallet({ fundId, managerId, currency, session = null }) {
  const db = await getDb();
  const col = db.collection(RESERVE_WALLETS_COLLECTION);
  const now = new Date();
  const fund = String(fundId || '');
  const manager = String(managerId || '');
  const cur = (currency && String(currency).trim()) || 'USD';
  const filter = { fundId: fund, walletType: RESERVE_WALLET_TYPE };
  const existing = await col.findOne(filter, session ? { session } : undefined);
  if (existing) return existing;
  const doc = {
    fundId: fund,
    managerId: manager,
    currency: cur,
    walletType: RESERVE_WALLET_TYPE,
    balance: 0,
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };
  try {
    const { insertedId } = await col.insertOne(doc, session ? { session } : undefined);
    return { _id: insertedId, ...doc };
  } catch (e) {
    if (e?.code === 11000) {
      const row = await col.findOne(filter, session ? { session } : undefined);
      if (row) return row;
    }
    throw e;
  }
}

/**
 * Idempotent overflow credit to Bull Run reserve wallet.
 * Deterministic reference:
 * preserve|fund:{fundId}|pos:{positionId}|inv:{investorId}|type:overflow
 */
async function creditReserveWallet({
  fundId,
  managerId,
  investorId,
  positionId,
  amount,
  currency,
}) {
  const amt = round2(amount);
  if (amt <= 0) return { ok: true, skipped: true, already_processed: false, reference: null };
  const fund = String(fundId || '');
  const manager = String(managerId || '');
  const investor = String(investorId || '');
  const position = String(positionId || '');
  const cur = (currency && String(currency).trim()) || 'USD';
  const reference = `preserve|fund:${fund}|pos:${position}|inv:${investor}|type:overflow`;

  return withTransaction(async (session) => {
    const db = await getDb();
    const walletsCol = db.collection(RESERVE_WALLETS_COLLECTION);
    const txCol = db.collection(RESERVE_TRANSACTIONS_COLLECTION);
    const now = new Date();
    await getOrCreateReserveWallet({ fundId: fund, managerId: manager, currency: cur, session });

    const existingTx = await txCol.findOne({ reference }, { session });
    if (existingTx) {
      return { ok: true, already_processed: true, reference };
    }

    await walletsCol.updateOne(
      { fundId: fund, walletType: RESERVE_WALLET_TYPE },
      { $inc: { balance: amt }, $set: { updatedAt: now } },
      { session }
    );

    await txCol.insertOne(
      {
        fundId: fund,
        managerId: manager,
        investorId: investor,
        positionId: position,
        amount: amt,
        transactionType: 'overflow_credit',
        reference,
        createdAt: now,
      },
      { session }
    );

    return { ok: true, already_processed: false, reference, amount: amt };
  });
}

function isBullRunFund(fund) {
  if (!fund) return false;
  const name = String(fund.name || '').toUpperCase();
  const type = String(fund.fundType || '').toLowerCase();
  return name === 'BULL RUN' || type === 'ai';
}

function investorProfitReference(fundId, positionId, investorId) {
  return `pammdist|fund:${String(fundId || '')}|pos:${String(positionId || '')}|inv:${String(investorId || '')}`;
}

function investorLossReference(fundId, positionId, investorId) {
  return `pammdist|fund:${String(fundId || '')}|pos:${String(positionId || '')}|inv:${String(investorId || '')}|type:loss`;
}

async function existsWalletDistributionRef(userId, reference, session = null) {
  const db = await getDb();
  const col = db.collection('wallet_transactions');
  const query = {
    userId: String(userId || ''),
    type: 'pamm_dist',
    reference: String(reference || ''),
  };
  const opts = session ? { session, projection: { _id: 1 } } : { projection: { _id: 1 } };
  const doc = await col.findOne(query, opts);
  return !!doc;
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
      const distRef = investorProfitReference(fundId, positionId, alloc.followerId);
      const allocationShareOfFund = totalCapital > 0 ? (alloc.allocatedBalance || 0) / totalCapital : 0;
      const share = allocationShareOfFund * remainingPnl;
      const shareRounded = Math.round(share * 100) / 100;
      if (Math.abs(shareRounded) <= 0.001) continue;

      ctx.incTotal();
      if (await existsWalletDistributionRef(alloc.followerId, distRef)) {
        ctx.recordSuccess();
        continue;
      }

      try {
        let createdDistTx = false;
        await financialTransactionService.runPairedWithTransaction(async (session) => {
          if (await existsWalletDistributionRef(alloc.followerId, distRef, session)) return;
          const { delta } = await financialTransactionService.syncWalletToLedgerAfterMutation(
            session,
            alloc.followerId,
            'USD',
            async (s) => {
              await ledgerService.postPammDistribution(
                alloc.followerId,
                Math.abs(shareRounded),
                'USD',
                distRef,
                isProfit,
                fundId,
                { session: s }
              );
            }
          );
          if (await existsWalletDistributionRef(alloc.followerId, distRef, session)) {
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
              reference: distRef,
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
  const reserveCurrency = 'USD';

  await tradingAccountRepo.updateBalance(accountId, managerId, remainingPnl);

  for (const alloc of allocations) {
    await ctx.pulse();
    if (alloc.createdAt && new Date(alloc.createdAt).getTime() > tradeTimeMs) continue;
    // Deterministic per-position guard: if this investor already has a distribution
    // transaction for this close event, skip all downstream processing for this investor.
    if (await walletRepo.existsPammDistribution(alloc.followerId, positionId)) {
      continue;
    }
    const balance = Number(alloc.allocatedBalance) || 0;
    const investorSharePercent = totalCapital > 0 ? balance / totalCapital : 0;
    const grossShareProfit = round2(investorSharePercent * remainingPnl);
    const normalizedInvestorId =
      (await ibRepo.resolveUserIdFromFollowerId(alloc.followerId)) || String(alloc.followerId);
    const profitRef = investorProfitReference(fundId, positionId, normalizedInvestorId);
    if (await existsWalletDistributionRef(alloc.followerId, profitRef)) continue;
    const asOfDate = position?.closedAt || new Date();
    const dateKeyUtc = getUtcDateKey(asOfDate);
    const startOfDayActiveCapital = await getStartOfDayActiveCapital({
      fundId,
      investorId: normalizedInvestorId,
      dateKeyUtc,
      currentAllocatedBalance: balance,
    });
    const capState = await getInvestorDailyCapState({
      fundId,
      investorId: normalizedInvestorId,
      asOfDate,
      startOfDayActiveCapital,
    });
    const investorCredit = round2(Math.min(Math.max(0, grossShareProfit), capState.remainingInvestorCap));
    const extraProfit = round2(Math.max(0, grossShareProfit - investorCredit));

    if (extraProfit > 0) {
      try {
        await creditReserveWallet({
          fundId,
          managerId,
          investorId: normalizedInvestorId,
          positionId,
          amount: extraProfit,
          currency: reserveCurrency,
        });
      } catch (e) {
        console.warn('[pamm] Reserve overflow credit failed for', alloc.followerId, 'ref', positionId, e.message);
      }
    }
    if (investorCredit <= 0.001) continue;

    ctx.incTotal();
    if (await existsWalletDistributionRef(alloc.followerId, profitRef)) {
      ctx.recordSuccess();
      continue;
    }

    try {
      let createdDistTx = false;
      await financialTransactionService.runPairedWithTransaction(async (session) => {
        if (await existsWalletDistributionRef(alloc.followerId, profitRef, session)) return;
        const { delta } = await financialTransactionService.syncWalletToLedgerAfterMutation(
          session,
          alloc.followerId,
          'USD',
          async (s) => {
            await ledgerService.postPammDistribution(
              alloc.followerId,
              investorCredit,
              'USD',
              profitRef,
              true,
              fundId,
              { session: s }
            );
          }
        );
        if (await existsWalletDistributionRef(alloc.followerId, profitRef, session)) {
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
            reference: profitRef,
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
        await incrementInvestorDailyCapCreditedToday({
          fundId,
          investorId: normalizedInvestorId,
          asOfDate,
          amount: investorCredit,
        });
        updatedFollowerIds.push(alloc.followerId);
      }
    } catch (e) {
      console.warn('[pamm] Bull Run dist for', alloc.followerId, 'failed:', e.message);
      ctx.recordFail(alloc.followerId);
    }

    try {
      const activeCapital = balance;
      if (activeCapital > 0.001 && investorCredit > 0) {
        const asOfDate = position?.closedAt || new Date();
        const ibChain = await ibRepo.getUplineChainForClient(normalizedInvestorId);
        const settings = await ibRepo.getPammIbCommissionSettings();
        const levels = settings?.levels || {};

        const levelStates = [];
        let cappedTodayProfit = Number.POSITIVE_INFINITY;
        for (let i = 0; i < Math.min(ibChain.length, 3); i++) {
          const level = i + 1;
          const ibUserId = String(ibChain[i]);
          const ref = `ibcap|fund:${String(fundId)}|pos:${String(positionId)}|inv:${String(normalizedInvestorId)}|ib:${ibUserId}|L${level}`;
          const state = await getOrCreateIbDailyCapRow({
            fundId,
            investorId: normalizedInvestorId,
            ibUserId,
            level,
            asOfDate,
            // Temporary proxy until start-of-day snapshot is introduced.
            startOfDayActiveCapital: activeCapital,
          });
          if (state?.payoutStatus === 'completed' && String(state?.lastReference || '') === ref) continue;
          const capState = await getIbDailyCapState({
            fundId,
            investorId: normalizedInvestorId,
            ibUserId,
            level,
            asOfDate,
            startOfDayActiveCapital: activeCapital,
          });
          const configuredPct = Number(levels?.[level]?.daily_payout_percent) || 0;
          if (capState.remainingIbCap <= 0 || configuredPct <= 0) continue;

          // Existing IB engine uses: maxDailyPayout = capital * configuredPct/100 and
          // allowedPayoutSoFar = maxDailyPayout * min(1, currentProfitPercent/0.8).
          // Cap layer enforces hard 0.25% by constraining input todayProfit.
          const maxDailyConfigured = round2(activeCapital * (configuredPct / 100));
          if (maxDailyConfigured > 0 && capState.ibDailyCapAmount < maxDailyConfigured) {
            const ratio = capState.ibDailyCapAmount / maxDailyConfigured;
            const profitPctLimit = 0.8 * Math.max(0, ratio);
            const todayProfitLimit = round2(activeCapital * (profitPctLimit / 100));
            cappedTodayProfit = Math.min(cappedTodayProfit, todayProfitLimit);
          }

          levelStates.push({
            level,
            ibUserId,
            reference: ref,
            capState,
          });
        }

        if (levelStates.length > 0) {
          await ibRepo.incrementPammInvestorDailyCreditedProfit(normalizedInvestorId, investorCredit);
          let todayCreditedProfit = await ibRepo.getPammInvestorDailyCreditedProfit(normalizedInvestorId);
          if (!Number.isFinite(todayCreditedProfit) || todayCreditedProfit < 0) todayCreditedProfit = 0;
          const effectiveTodayProfit = round2(Math.min(todayCreditedProfit, cappedTodayProfit));
          if (effectiveTodayProfit > 0) {
            const beforePaidByLevel = new Map();
            for (const ls of levelStates) {
              await setIbDailyCapStatus({
                fundId,
                investorId: normalizedInvestorId,
                ibUserId: ls.ibUserId,
                level: ls.level,
                asOfDate,
                reference: ls.reference,
                status: 'pending',
              });
              await setIbDailyCapStatus({
                fundId,
                investorId: normalizedInvestorId,
                ibUserId: ls.ibUserId,
                level: ls.level,
                asOfDate,
                reference: ls.reference,
                status: 'in_progress',
              });
              const paidBefore = await ibRepo.getPammIbCommissionPaidToday(normalizedInvestorId, ls.ibUserId);
              beforePaidByLevel.set(`${ls.level}:${ls.ibUserId}`, round2(paidBefore));
            }

            try {
              await processPammIbCommissionOnTradeClose(
                normalizedInvestorId,
                activeCapital,
                fundId,
                positionId,
                effectiveTodayProfit
              );

              for (const ls of levelStates) {
                const key = `${ls.level}:${ls.ibUserId}`;
                const beforePaid = beforePaidByLevel.get(key) || 0;
                const paidAfter = round2(
                  await ibRepo.getPammIbCommissionPaidToday(normalizedInvestorId, ls.ibUserId)
                );
                const configuredTradeIbAmount = round2(Math.max(0, paidAfter - beforePaid));
                const ibCommission = round2(
                  Math.min(configuredTradeIbAmount, ls.capState.remainingIbCap)
                );
                if (ibCommission > 0) {
                  await incrementIbDailyCapCreditedToday({
                    fundId,
                    investorId: normalizedInvestorId,
                    ibUserId: ls.ibUserId,
                    level: ls.level,
                    asOfDate,
                    amount: ibCommission,
                  });
                }
                await setIbDailyCapStatus({
                  fundId,
                  investorId: normalizedInvestorId,
                  ibUserId: ls.ibUserId,
                  level: ls.level,
                  asOfDate,
                  reference: ls.reference,
                  status: 'completed',
                });
              }
            } catch (err) {
              for (const ls of levelStates) {
                await setIbDailyCapStatus({
                  fundId,
                  investorId: normalizedInvestorId,
                  ibUserId: ls.ibUserId,
                  level: ls.level,
                  asOfDate,
                  reference: ls.reference,
                  status: 'failed',
                  error: err?.message || String(err),
                });
              }
              throw err;
            }
          }
        }
      }
    } catch (e) {
      console.warn('[pamm] Bull Run IB commission for follower failed:', e.message);
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
    const lossRef = investorLossReference(fundId, positionId, alloc.followerId);
    const investorSharePercent = totalCapital > 0 ? balance / totalCapital : 0;
    const share = investorSharePercent * remainingPnl;
    const shareRounded = Math.round(share * 100) / 100;
    if (Math.abs(shareRounded) <= 0.001) continue;
    const absLoss = Math.abs(shareRounded);
    if (await ledgerRepo.existsWalletEntryForEvent(alloc.followerId, 'pamm_dist', lossRef, 0, absLoss, { pammFundId: fundId })) {
      ctx.recordSuccess();
      continue;
    }

    ctx.incTotal();
    try {
      await financialTransactionService.runPairedWithTransaction(async (session) => {
        if (await ledgerRepo.existsWalletEntryForEvent(alloc.followerId, 'pamm_dist', lossRef, 0, absLoss, { session, pammFundId: fundId })) {
          return;
        }
        await financialTransactionService.syncWalletToLedgerAfterMutation(
          session,
          alloc.followerId,
          'USD',
          async (s) => {
            await ledgerService.postPammDistribution(
              alloc.followerId,
              absLoss,
              'USD',
              lossRef,
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

async function distributeReserve({ fundId, managerId, amount, clientRequestId }) {
  const fund = String(fundId || '');
  const manager = String(managerId || '');
  const requestedAmount = round2(amount);
  const reqId = String(clientRequestId || '').trim();
  if (!fund) throw new Error('fundId is required');
  if (!manager) throw new Error('managerId is required');
  if (!(requestedAmount > 0)) throw new Error('amount must be greater than 0');
  if (!reqId) throw new Error('clientRequestId is required');

  const db = await getDb();
  const reserveWalletsCol = db.collection(RESERVE_WALLETS_COLLECTION);
  const reserveTxCol = db.collection(RESERVE_TRANSACTIONS_COLLECTION);
  const allocationsCol = db.collection('pamm_allocations');
  const positionsCol = db.collection('positions');
  const walletTxCol = db.collection('wallet_transactions');
  const runsCol = db.collection(RESERVE_DIST_RUNS_COLLECTION);
  const itemsCol = db.collection(RESERVE_DIST_ITEMS_COLLECTION);

  const fundDoc = await pammRepo.getManagerById(fund);
  if (!fundDoc) throw new Error('Fund not found');
  if (String(fundDoc.userId || '') !== manager) throw new Error('Only fund manager can distribute reserve');
  if (!fundDoc.tradingAccountId) throw new Error('Fund trading account not found');

  await itemsCol.createIndex({ reference: 1 }, { unique: true });
  await runsCol.createIndex({ runId: 1 }, { unique: true });
  await runsCol.createIndex({ fundId: 1, clientRequestId: 1 }, { unique: true, name: 'pamm_reserve_dist_fund_req_unique' });
  await runsCol.createIndex({ reference: 1 }, { unique: true, name: 'pamm_reserve_dist_reference_unique' });

  const runReference = `preservedist_run|fund:${fund}|req:${reqId}`;
  const createdAt = new Date();
  let runId = null;

  const existingRun = await runsCol.findOne({
    fundId: fund,
    $or: [{ clientRequestId: reqId }, { reference: runReference }],
  });
  if (existingRun?.status === 'completed') {
    return {
      runId: existingRun.runId,
      totalDistributed: round2(existingRun.totalDistributed),
      investorCount: Number(existingRun.investorCount) || 0,
      alreadyProcessed: true,
    };
  }
  if (existingRun?.status === 'in_progress') {
    return {
      runId: existingRun.runId,
      totalDistributed: round2(existingRun.totalDistributed),
      investorCount: Number(existingRun.investorCount) || 0,
      alreadyProcessed: true,
      status: 'in_progress',
    };
  }
  if (existingRun?.status === 'failed') {
    const resetNow = new Date();
    await runsCol.updateOne(
      {
        _id: existingRun._id,
        fundId: fund,
        status: 'failed',
      },
      {
        $set: {
          status: 'in_progress',
          updatedAt: resetNow,
        },
        $unset: {
          error: '',
          completedAt: '',
        },
      }
    );
    runId = String(existingRun.runId || '');
    if (!runId) runId = new ObjectId().toString();
  }

  if (!runId) {
    runId = new ObjectId().toString();
    try {
      await runsCol.insertOne({
        fundId: fund,
        managerId: manager,
        runId,
        clientRequestId: reqId,
        reference: runReference,
        requestedAmount,
        status: 'in_progress',
        createdAt,
        updatedAt: createdAt,
      });
    } catch (e) {
      if (e?.code === 11000) {
        const dupe = await runsCol.findOne({
          fundId: fund,
          $or: [{ clientRequestId: reqId }, { reference: runReference }],
        });
        if (dupe) {
          return {
            runId: dupe.runId,
            totalDistributed: round2(dupe.totalDistributed),
            investorCount: Number(dupe.investorCount) || 0,
            alreadyProcessed: true,
            status: dupe.status || 'in_progress',
            error: dupe.error || null,
          };
        }
      }
      throw e;
    }
  }

  let result;
  try {
    result = await withTransaction(async (session) => {
    const reserveWallet = await reserveWalletsCol.findOne(
      { fundId: fund, walletType: RESERVE_WALLET_TYPE },
      { session }
    );
    if (!reserveWallet) throw new Error('Reserve wallet not found');
    const reserveBalance = round2(reserveWallet.balance);
    if (reserveBalance < requestedAmount) {
      throw new Error('Insufficient reserve balance');
    }

    const openPositionsCount = await positionsCol.countDocuments(
      {
        closedAt: null,
        $and: [
          {
            $or: [
              { userId: manager },
              ...(ObjectId.isValid(manager) && manager.length === 24 ? [{ userId: new ObjectId(manager) }] : []),
            ],
          },
          {
            $or: [
              { accountId: String(fundDoc.tradingAccountId) },
              ...(ObjectId.isValid(String(fundDoc.tradingAccountId)) && String(fundDoc.tradingAccountId).length === 24
                ? [{ accountId: new ObjectId(String(fundDoc.tradingAccountId)) }]
                : []),
            ],
          },
        ],
      },
      { session }
    );
    if (openPositionsCount > 0) throw new Error('Cannot distribute reserve while fund has open positions');

    const allocations = await allocationsCol
      .find(
        {
          status: 'active',
          $or: [
            { managerId: fund },
            ...(ObjectId.isValid(fund) && fund.length === 24 ? [{ managerId: new ObjectId(fund) }] : []),
          ],
        },
        { session }
      )
      .toArray();

    const eligible = allocations
      .map((a) => ({
        ...a,
        allocatedBalance: Math.max(0, round2(a.allocatedBalance)),
      }))
      .filter((a) => a.allocatedBalance > 0.001);

    const totalActiveCapital = round2(eligible.reduce((s, a) => s + a.allocatedBalance, 0));
    if (totalActiveCapital <= 0) throw new Error('No active capital available for reserve distribution');

    await runsCol.updateOne(
      { runId },
      { $set: { totalActiveCapital, updatedAt: new Date() } },
      { session }
    );

    let totalDistributed = 0;
    let distributedCount = 0;
    const updatedFollowerIds = [];

    for (const alloc of eligible) {
      const investorId = String(alloc.followerId || '');
      if (!investorId) continue;
      const sharePercent = totalActiveCapital > 0 ? alloc.allocatedBalance / totalActiveCapital : 0;
      const distributionAmount = round2(requestedAmount * sharePercent);
      if (distributionAmount <= 0) continue;

      const reference = `preservedist|fund:${fund}|run:${runId}|inv:${investorId}`;
      const existingWalletTx = await walletTxCol.findOne(
        { type: 'pamm_dist', reference, userId: investorId },
        { session }
      );
      const existingItem = await itemsCol.findOne({ reference }, { session });
      if (existingWalletTx || existingItem) continue;

      await financialTransactionService.syncWalletToLedgerAfterMutation(
        session,
        investorId,
        'USD',
        async (s) => {
          await ledgerService.postPammDistribution(
            investorId,
            distributionAmount,
            'USD',
            reference,
            true,
            fund,
            { session: s }
          );
        }
      );

      await walletRepo.createTransaction(
        {
          userId: investorId,
          type: 'pamm_dist',
          amount: distributionAmount,
          currency: 'USD',
          status: 'completed',
          reference,
          completedAt: new Date(),
        },
        { session }
      );

      await allocationsCol.updateOne(
        { _id: alloc._id },
        {
          $inc: {
            allocatedBalance: distributionAmount,
            realizedPnl: distributionAmount,
          },
          $set: { updatedAt: new Date() },
        },
        { session }
      );

      await itemsCol.insertOne(
        {
          fundId: fund,
          managerId: manager,
          runId,
          investorId,
          allocationBasis: alloc.allocatedBalance,
          percentageShare: round2(sharePercent * 100),
          distributedAmount: distributionAmount,
          reference,
          createdAt: new Date(),
        },
        { session }
      );

      await reserveTxCol.insertOne(
        {
          fundId: fund,
          managerId: manager,
          investorId,
          positionId: null,
          amount: distributionAmount,
          transactionType: 'distribution_credit',
          reference: `${reference}|credit`,
          createdAt: new Date(),
        },
        { session }
      );

      totalDistributed = round2(totalDistributed + distributionAmount);
      distributedCount += 1;
      updatedFollowerIds.push(investorId);
    }

    if (totalDistributed > 0) {
      await reserveWalletsCol.updateOne(
        { _id: reserveWallet._id },
        {
          $inc: { balance: -totalDistributed },
          $set: { updatedAt: new Date() },
        },
        { session }
      );
      await reserveTxCol.insertOne(
        {
          fundId: fund,
          managerId: manager,
          investorId: null,
          positionId: null,
          amount: totalDistributed,
          transactionType: 'distribution_debit',
          reference: `preservedist|fund:${fund}|run:${runId}|type:debit`,
          createdAt: new Date(),
        },
        { session }
      );
    }

    return {
      runId,
      totalDistributed,
      investorCount: distributedCount,
      updatedFollowerIds,
    };
  });
  } catch (e) {
    await runsCol.updateOne(
      { runId },
      {
        $set: {
          status: 'failed',
          error: String(e?.message || e || 'unknown').slice(0, 500),
          updatedAt: new Date(),
        },
      }
    );
    throw e;
  }

  await runsCol.updateOne(
    { runId },
    {
      $set: {
        status: 'completed',
        totalDistributed: round2(result.totalDistributed),
        investorCount: Number(result.investorCount) || 0,
        completedAt: new Date(),
        updatedAt: new Date(),
      },
    }
  );

  if (result.updatedFollowerIds?.length > 0) {
    try {
      await emitPammAllocationUpdate(fund, result.updatedFollowerIds, manager);
    } catch (e) {
      console.warn('[pamm] emitPammAllocationUpdate failed:', e.message);
    }
  }

  return {
    runId: result.runId,
    totalDistributed: result.totalDistributed,
    investorCount: result.investorCount,
    alreadyProcessed: false,
  };
}

export default { distributePammPnl, distributeReserve };
