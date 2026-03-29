/**
 * Operational rollback: reverse Bull Run effects of one closed trade (distributions, IB commission,
 * fund reserve slice, manager PAMM trading account P&L bump). Append-only ledger via reversal entries.
 *
 * Run via: node scripts/rollback-bullrun-trade.js
 */
import { getDb } from '../../config/mongo.js';
import { ObjectId } from 'mongodb';
import pammRepo from './pamm.repository.js';
import walletRepo from '../wallet/wallet.repository.js';
import ledgerService from '../finance/ledger.service.js';
import ledgerRepo from '../finance/ledger.repository.js';
import financialTransactionService from '../finance/financial-transaction.service.js';
import tradingAccountRepo from '../trading/trading-account.repository.js';
import ibRepo from '../ib/ib.repository.js';
import { ACCOUNTS, SYSTEM_ACCOUNT_ID } from '../finance/chart-of-accounts.js';
import { emitPammAllocationUpdate } from './pamm.events.js';

const TRADES_COLLECTION = 'manager_trades';

function isBullRunFundDoc(m) {
  if (!m) return false;
  const name = String(m.name || '').toUpperCase();
  const type = String(m.fundType || '').toLowerCase();
  return name === 'BULL RUN' || type === 'ai';
}

async function findBullRunFundObjectIds() {
  const db = await getDb();
  const col = db.collection('pamm_managers');
  const list = await col
    .find({
      $or: [{ fundType: 'ai' }, { name: /^bull\s*run$/i }],
    })
    .project({ _id: 1 })
    .toArray();
  return list.map((d) => d._id.toString());
}

/** Latest manager_trades row for any Bull Run fund, by createdAt. */
export async function findLatestBullRunTrade() {
  const fundIds = await findBullRunFundObjectIds();
  if (fundIds.length === 0) return null;
  const db = await getDb();
  const col = db.collection(TRADES_COLLECTION);
  const or = fundIds.map((id) => ({ managerId: id }));
  const t = await col.find({ $or: or }).sort({ createdAt: -1 }).limit(1).next();
  if (!t) return null;
  return {
    id: t._id.toString(),
    managerId: t.managerId != null ? String(t.managerId) : null,
    positionId: t.positionId != null ? String(t.positionId) : null,
    pnl: Number(t.pnl) || 0,
    createdAt: t.createdAt,
  };
}

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Recent Bull Run `manager_trades` rows (newest first). Use to resolve `positionId` when
 * `--latest-bull-run` is not the trade you mean (e.g. UI shows XAUUSD −39k but latest row is another close).
 * @param {{ limit?: number, symbol?: string | null, pnlApprox?: number | null, pnlTolerance?: number }} options
 */
export async function listRecentBullRunTrades(options = {}) {
  const limit = Math.min(200, Math.max(1, Number(options.limit) || 30));
  const pnlTol =
    Number.isFinite(Number(options.pnlTolerance)) && Number(options.pnlTolerance) >= 0
      ? Number(options.pnlTolerance)
      : 1;
  const symbolRaw = options.symbol != null && String(options.symbol).trim() !== '' ? String(options.symbol).trim() : null;
  const pnlApprox =
    options.pnlApprox != null && options.pnlApprox !== '' && Number.isFinite(Number(options.pnlApprox))
      ? Number(options.pnlApprox)
      : null;

  const fundIds = await findBullRunFundObjectIds();
  if (fundIds.length === 0) return [];

  const db = await getDb();
  const col = db.collection(TRADES_COLLECTION);
  const managerOr = fundIds.map((id) => ({ managerId: id }));
  const filter = { $or: managerOr };
  if (symbolRaw) {
    const sym = symbolRaw.toUpperCase().replace(/\s+/g, '');
    filter.symbol = new RegExp(`^${escapeRegex(sym)}$`, 'i');
  }
  if (pnlApprox != null) {
    filter.pnl = { $gte: pnlApprox - pnlTol, $lte: pnlApprox + pnlTol };
  }

  const list = await col.find(filter).sort({ createdAt: -1 }).limit(limit).toArray();
  return list.map((t) => ({
    id: t._id.toString(),
    managerId: t.managerId != null ? String(t.managerId) : null,
    positionId: t.positionId != null ? String(t.positionId) : null,
    pnl: Number(t.pnl) || 0,
    symbol: t.symbol != null ? String(t.symbol) : null,
    side: t.side != null ? String(t.side) : null,
    volume: t.volume != null ? Number(t.volume) : null,
    price: t.price != null ? Number(t.price) : null,
    createdAt: t.createdAt,
  }));
}

/** Investors who took a wallet debit on loss distribution for this position (from ledger `pamm_dist` WALLET legs). */
async function buildLossDistributionByUserFromLedger(positionId) {
  const pid = String(positionId);
  const entries = await ledgerRepo.listByReference('pamm_dist', pid);
  const walletLegs = entries.filter(
    (e) =>
      e.accountCode === ACCOUNTS.WALLET &&
      String(e.entityId) !== String(SYSTEM_ACCOUNT_ID) &&
      String(e.entityId) !== 'system'
  );
  const byUser = new Map();
  for (const e of walletLegs) {
    const uid = String(e.entityId);
    const net = (Number(e.credit) || 0) - (Number(e.debit) || 0);
    if (net >= -0.001) continue;
    const amt = Math.abs(net);
    byUser.set(uid, (byUser.get(uid) || 0) + amt);
  }
  const rows = [];
  for (const [uid, amtRaw] of byUser) {
    const amt = Math.round(amtRaw * 100) / 100;
    if (amt < 0.001) continue;
    rows.push({ userId: uid, lossShareUsd: amt });
  }
  return rows;
}

async function loadTradeByPositionId(positionId) {
  if (!positionId) return null;
  const db = await getDb();
  const col = db.collection(TRADES_COLLECTION);
  const pid = String(positionId);
  const or = [{ positionId: pid }];
  if (ObjectId.isValid(pid) && pid.length === 24) or.push({ positionId: new ObjectId(pid) });
  const t = await col.findOne({ $or: or });
  if (!t) return null;
  return {
    id: t._id.toString(),
    managerId: t.managerId != null ? String(t.managerId) : null,
    positionId: t.positionId != null ? String(t.positionId) : null,
    pnl: Number(t.pnl) || 0,
    createdAt: t.createdAt,
  };
}

/**
 * @param {string} positionId - closed position id
 * @param {{ dryRun?: boolean }} options
 */
export async function rollbackBullRunTradeClose(positionId, options = {}) {
  const dryRun = !!options.dryRun;
  const pid = String(positionId).trim();
  if (!pid) {
    const err = new Error('positionId required');
    err.statusCode = 400;
    throw err;
  }

  const trade = await loadTradeByPositionId(pid);
  if (!trade) {
    const err = new Error(`No manager_trades row for positionId=${pid}`);
    err.statusCode = 404;
    throw err;
  }

  const fund = await pammRepo.getManagerById(trade.managerId);
  if (!fund || !isBullRunFundDoc(fund)) {
    const err = new Error('Trade is not for a Bull Run (ai / BULL RUN) fund');
    err.statusCode = 400;
    throw err;
  }

  const fundId = fund.id;
  const managerUserId = String(fund.userId || '');
  const tradingAccountId = fund.tradingAccountId ? String(fund.tradingAccountId) : '';
  if (!managerUserId || !tradingAccountId) {
    const err = new Error('Fund missing userId or tradingAccountId');
    err.statusCode = 400;
    throw err;
  }

  const pnl = Number(trade.pnl) || 0;
  const distTxs = await walletRepo.listPammDistTransactionsByPosition(pid);

  const sumCredits = distTxs.reduce((s, x) => s + (Math.abs(Number(x.amount)) || 0), 0);
  const plan = {
    positionId: pid,
    fundId,
    managerUserId,
    tradingAccountId,
    pnl,
    mode: pnl >= 0 ? 'profit' : 'loss',
    investorWalletTxCount: distTxs.length,
    investorCredits: distTxs.map((t) => ({ userId: t.userId, amount: t.amount })),
    reserveDeltaApprox: pnl > 0 ? Math.round((pnl - sumCredits) * 100) / 100 : 0,
  };

  if (dryRun) {
    const ibLogs = await ibRepo.listPammIbCommissionLogsByTradeId(pid);
    plan.ibCommissionLogs = ibLogs.length;
    plan.companyPoolDeletes = 'trade-scoped rows';
    if (pnl < 0) {
      const lossRows = await buildLossDistributionByUserFromLedger(pid);
      plan.lossLedgerInvestorCount = lossRows.length;
      plan.lossLedgerInvestors = lossRows;
      plan.note =
        'Loss rollback uses ledger (pamm_dist), not wallet tx type pamm_dist; investorWalletTxCount can be 0 here.';
    }
    return { dryRun: true, plan };
  }

  const updatedFollowerIds = [];

  await financialTransactionService.runPairedWithTransaction(async (session) => {
    await ibRepo.deleteCompanyCommissionPoolByTradeId(pid, { session });

    const ibLogs = await ibRepo.listPammIbCommissionLogsByTradeId(pid);
    for (const log of ibLogs) {
      const paid = Number(log.commission_amount) || 0;
      if (paid < 0.001) continue;
      const ibId = log.ib_id != null ? String(log.ib_id) : '';
      const investorId = log.investor_id != null ? String(log.investor_id) : '';
      const level = Number(log.level_number) || 1;
      if (!ibId) continue;
      const stableRef = walletRepo.ibPammCommissionReferenceKey(pid, investorId, ibId, level);
      const rbLedgerRef = `rb|${stableRef}`;
      const existsIbRb = await ledgerRepo.existsWalletEntryForEvent(ibId, 'pamm_ib_commission_rb', rbLedgerRef, 0, paid, {
        session,
      });
      if (existsIbRb) continue;

      const { delta } = await financialTransactionService.syncWalletToLedgerAfterMutation(
        session,
        ibId,
        'USD',
        async (s) => {
          await ledgerService.postPammIbCommissionRollback(ibId, paid, 'USD', stableRef, { session: s });
        }
      );
      if (Math.abs(delta) < 0.001 && paid >= 0.001) {
        await walletRepo.updateBalance(ibId, 'USD', -paid, { session });
      }
      try {
        await walletRepo.createTransaction(
          {
            userId: ibId,
            type: 'ib_pamm_commission_rollback',
            amount: -paid,
            currency: 'USD',
            status: 'completed',
            reference: rbLedgerRef,
            completedAt: new Date(),
          },
          { session }
        );
      } catch (e) {
        if (!(e?.code === 11000)) throw e;
      }
    }
    await ibRepo.deletePammIbCommissionLogsByTradeId(pid, { session });

    if (pnl > 0) {
      let sum = 0;
      for (const tx of distTxs) {
        const uid = String(tx.userId);
        const amt = Math.abs(Number(tx.amount)) || 0;
        if (amt < 0.001) continue;
        sum += amt;
        const rbRef = `rbprof:${pid}:${uid}`;
        const existsRb = await ledgerRepo.existsWalletEntryForEvent(uid, 'pamm_dist_rb', rbRef, 0, amt, {
          session,
          pammFundId: fundId,
        });
        if (existsRb) continue;

        const { delta } = await financialTransactionService.syncWalletToLedgerAfterMutation(
          session,
          uid,
          'USD',
          async (s) => {
            await ledgerService.postPammDistributionProfitRollback(uid, amt, 'USD', pid, fundId, { session: s });
          }
        );
        if (Math.abs(delta) < 0.001 && amt >= 0.001) {
          await walletRepo.updateBalance(uid, 'USD', -amt, { session });
        }
        try {
          await walletRepo.createTransaction(
            {
              userId: uid,
              type: 'pamm_dist_rollback',
              amount: -amt,
              currency: 'USD',
              status: 'completed',
              reference: rbRef,
              completedAt: new Date(),
            },
            { session }
          );
        } catch (e) {
          if (!(e?.code === 11000)) throw e;
        }

        const alloc = await pammRepo.getActiveAllocation(uid, fundId);
        if (alloc?.id) {
          await pammRepo.incrementAllocationRealizedPnl(alloc.id, -amt, { session });
          const newBal = Math.max(0, (Number(alloc.allocatedBalance) || 0) - amt);
          await pammRepo.updateAllocation(alloc.id, { allocatedBalance: newBal }, { session });
        }
        const normalizedInvestor = (await ibRepo.resolveUserIdFromFollowerId(uid)) || uid;
        await ibRepo.incrementPammInvestorDailyCreditedProfit(normalizedInvestor, -amt, { session });
        updatedFollowerIds.push(uid);
      }

      const reserveDelta = Math.round((pnl - sum) * 100) / 100;
      if (reserveDelta > 0.001) {
        await pammRepo.incrementFundReserve(fundId, -reserveDelta, { session });
      }
    } else {
      const lossRows = await buildLossDistributionByUserFromLedger(pid);
      const byUser = new Map(lossRows.map((r) => [r.userId, r.lossShareUsd]));
      for (const [uid, amtRaw] of byUser) {
        const amt = Math.round(amtRaw * 100) / 100;
        if (amt < 0.001) continue;
        const rbRef = `rbloss:${pid}:${uid}`;
        const existsRb = await ledgerRepo.existsWalletEntryForEvent(uid, 'pamm_dist_rb', rbRef, amt, 0, {
          session,
          pammFundId: fundId,
        });
        if (existsRb) continue;

        const { delta } = await financialTransactionService.syncWalletToLedgerAfterMutation(
          session,
          uid,
          'USD',
          async (s) => {
            await ledgerService.postPammDistributionLossRollback(uid, amt, 'USD', pid, fundId, { session: s });
          }
        );
        if (Math.abs(delta) < 0.001 && amt >= 0.001) {
          await walletRepo.updateBalance(uid, 'USD', amt, { session });
        }

        const alloc = await pammRepo.getActiveAllocation(uid, fundId);
        if (alloc?.id) {
          const shareRounded = -amt;
          await pammRepo.incrementAllocationRealizedPnl(alloc.id, -shareRounded, { session });
          const newBal = Math.max(0, (Number(alloc.allocatedBalance) || 0) + amt);
          await pammRepo.updateAllocation(alloc.id, { allocatedBalance: newBal }, { session });
        }
        updatedFollowerIds.push(uid);
      }
    }

    await tradingAccountRepo.updateBalance(tradingAccountId, managerUserId, -pnl, { session });
  }, { label: 'bullrun_trade_rollback' });

  if (updatedFollowerIds.length > 0) {
    try {
      await emitPammAllocationUpdate(fundId, [...new Set(updatedFollowerIds)], managerUserId);
    } catch (e) {
      console.warn('[bullrun-rollback] emitPammAllocationUpdate:', e?.message || e);
    }
  }

  // Keep manager_trades row for history but stop it from driving today/month % after economic rollback
  try {
    const ex = await pammRepo.excludeTradeFromFundMetrics(pid);
    if (ex.modifiedCount > 0) {
      console.info('[bullrun-rollback] excluded trade from fund metrics:', pid, ex);
    }
  } catch (e) {
    console.warn('[bullrun-rollback] excludeTradeFromFundMetrics:', e?.message || e);
  }

  return {
    ok: true,
    positionId: pid,
    fundId,
    pnl,
    mode: pnl >= 0 ? 'profit' : 'loss',
    investorsTouched: updatedFollowerIds.length,
  };
}

export default {
  findLatestBullRunTrade,
  listRecentBullRunTrades,
  rollbackBullRunTradeClose,
};
