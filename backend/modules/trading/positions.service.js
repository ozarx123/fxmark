/**
 * Positions service — open/closed positions, close (full or partial), post P&L to ledger and wallet
 * PAMM accounts: on full close, distribute P&L via PAMM distribution service (Bull Run 1% cap, reserve, etc.)
 * Live closes with P&L: ledger + wallet + position state in one Mongo transaction.
 */
import positionRepo from './position.repository.js';
import tradingAccountRepo from './trading-account.repository.js';
import ledgerService from '../finance/ledger.service.js';
import ledgerRepo from '../finance/ledger.repository.js';
import { ACCOUNTS } from '../finance/chart-of-accounts.js';
import financialTransactionService from '../finance/financial-transaction.service.js';
import walletRepo from '../wallet/wallet.repository.js';
import commissionEngine from '../ib/commission.engine.js';
import ibRepo from '../ib/ib.repository.js';
import { checkTradingAllowed } from '../admin/trading-limits.service.js';
import distributionService from '../pamm/distribution.service.js';
import { getLastPrice } from '../../src/services/lastQuotePrices.js';
import { getContractSize, normalizeSymbolKey, computeUnrealizedPnl } from './unrealized-pnl.js';
import { getMarginRiskRuntime } from './margin-risk.runtime.js';
import { getDb } from '../../config/mongo.js';
import { ObjectId } from 'mongodb';

/** Throttle margin_call warnings per account (userId:accountId). */
const lastMarginWarningAt = new Map();
const POSITIONS_COLLECTION = 'positions';
const DISTRIBUTION_HEARTBEAT_STALE_MS = Math.max(
  60_000,
  Number.parseInt(process.env.PAMM_DISTRIBUTION_STALE_MS || '600000', 10) || 600000
);

function distributionWorkerId() {
  return `${process.pid}-${Date.now()}`;
}

function userIdFilter(userId) {
  const uid = String(userId || '');
  if (ObjectId.isValid(uid) && uid.length === 24) {
    return { $or: [{ userId: uid }, { userId: new ObjectId(uid) }] };
  }
  return { userId: uid };
}

async function tryAcquireDistributionRunLock(positionId, userId) {
  if (!ObjectId.isValid(positionId)) return { acquired: false, reason: 'invalid_position_id' };
  const db = await getDb();
  const positions = db.collection(POSITIONS_COLLECTION);
  const now = new Date();
  const staleBefore = new Date(now.getTime() - DISTRIBUTION_HEARTBEAT_STALE_MS);
  const runId = new ObjectId().toString();
  const owner = distributionWorkerId();

  const result = await positions.updateOne(
    {
      _id: new ObjectId(positionId),
      ...userIdFilter(userId),
      $and: [
        {
          $or: [
            { distributionCompletedAt: { $exists: false } },
            { distributionCompletedAt: null },
          ],
        },
        {
          $or: [
            { distributionStatus: { $exists: false } },
            { distributionStatus: null },
            { distributionStatus: 'failed' },
            {
              $and: [
                { distributionStatus: 'in_progress' },
                {
                  $or: [
                    { distributionHeartbeatAt: { $exists: false } },
                    { distributionHeartbeatAt: null },
                    { distributionHeartbeatAt: { $lt: staleBefore } },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
    {
      $set: {
        distributionStatus: 'in_progress',
        distributionLockOwner: owner,
        distributionLockAt: now,
        distributionRunId: runId,
        distributionHeartbeatAt: now,
        distributionError: null,
        updatedAt: now,
      },
    }
  );

  if (result.modifiedCount === 1) return { acquired: true, owner, runId };

  const existing = await positions.findOne(
    { _id: new ObjectId(positionId), ...userIdFilter(userId) },
    { projection: { distributionStatus: 1, distributionCompletedAt: 1 } }
  );
  if (existing?.distributionStatus === 'completed' || existing?.distributionCompletedAt) {
    return { acquired: false, reason: 'completed' };
  }
  if (existing?.distributionStatus === 'in_progress') {
    return { acquired: false, reason: 'in_progress' };
  }
  return { acquired: false, reason: 'not_eligible' };
}

async function markDistributionRunCompleted(positionId, userId, owner) {
  if (!ObjectId.isValid(positionId)) return;
  const db = await getDb();
  const positions = db.collection(POSITIONS_COLLECTION);
  const now = new Date();
  await positions.updateOne(
    {
      _id: new ObjectId(positionId),
      ...userIdFilter(userId),
      distributionLockOwner: owner,
      distributionStatus: 'in_progress',
    },
    {
      $set: {
        distributionStatus: 'completed',
        distributionCompletedAt: now,
        distributionHeartbeatAt: now,
        updatedAt: now,
      },
    }
  );
}

async function markDistributionRunFailed(positionId, userId, owner, errorMessage) {
  if (!ObjectId.isValid(positionId)) return;
  const db = await getDb();
  const positions = db.collection(POSITIONS_COLLECTION);
  const now = new Date();
  await positions.updateOne(
    {
      _id: new ObjectId(positionId),
      ...userIdFilter(userId),
      distributionLockOwner: owner,
      distributionStatus: 'in_progress',
    },
    {
      $set: {
        distributionStatus: 'failed',
        distributionError: String(errorMessage || 'unknown').slice(0, 500),
        distributionHeartbeatAt: now,
        updatedAt: now,
      },
    }
  );
}

async function pulseDistributionHeartbeat(positionId, userId, owner) {
  if (!ObjectId.isValid(positionId)) return;
  const db = await getDb();
  const positions = db.collection(POSITIONS_COLLECTION);
  await positions.updateOne(
    {
      _id: new ObjectId(positionId),
      ...userIdFilter(userId),
      distributionLockOwner: owner,
      distributionStatus: 'in_progress',
    },
    { $set: { distributionHeartbeatAt: new Date(), updatedAt: new Date() } }
  );
}

function marginUsedForPositions(openPositions, leverage) {
  const lev = Math.max(1, Number(leverage) || 100);
  let used = 0;
  for (const pos of openPositions) {
    const openPrice = Number(pos.openPrice ?? pos.open_price) || 0;
    const volume = Number(pos.volume ?? pos.lots) || 0;
    if (openPrice && volume) {
      const contractSize = getContractSize(pos.symbol);
      used += (volume * contractSize * openPrice) / lev;
    }
  }
  return used;
}

/** Reject cross-account access when position is bound to a specific trading account. */
function assertPositionAccountScope(pos, requestAccountId) {
  if (!requestAccountId) return;
  if (pos.accountId != null && pos.accountId !== '' && String(pos.accountId) !== String(requestAccountId)) {
    const err = new Error('Position belongs to a different account');
    err.statusCode = 403;
    throw err;
  }
}

function deriveClosePrice(pos) {
  const open = Number(pos.openPrice) || 0;
  const vol = Number(pos.closedVolume ?? pos.volume ?? pos.lots) || 0;
  const pnl = Number(pos.pnl) || 0;
  if (!open || !vol) return null;
  const contractSize = getContractSize(pos.symbol);
  const side = String(pos.side ?? pos.type ?? '').toLowerCase();
  const factor = side === 'sell' ? -1 : 1;
  const price = open + (factor * pnl) / (vol * contractSize);
  return Number.isFinite(price) ? Math.round(price * 1e5) / 1e5 : null;
}

async function getOpenPositions(userId, options = {}) {
  return positionRepo.listOpen(userId, options);
}

/** Top N users with open positions (for admin dashboard) */
async function getTopTradersWithPositions(limit = 10) {
  const top = await positionRepo.listTopUsersByOpenPositions(limit);
  const result = [];
  for (const { userId, count, totalVolume } of top) {
    const positions = await positionRepo.listOpen(userId, { limit: 50 });
    result.push({ userId, count, totalVolume, positions });
  }
  return result;
}

async function getClosedPositions(userId, options = {}) {
  const { from, to, limit, symbol, accountId } = options;
  const list = await positionRepo.listClosed(userId, { from, to, limit, symbol, accountId });
  return list.map((p) => {
    const realizedPnl = p.realizedPnl != null ? Number(p.realizedPnl) : (p.pnl != null ? Number(p.pnl) : null);
    return {
      ...p,
      closePrice: p.closePrice ?? (p.pnl != null ? deriveClosePrice(p) : null),
      pnl: realizedPnl ?? p.pnl,
      realizedPnl,
    };
  });
}

async function getPosition(userId, positionId, accountId = null) {
  const p = await positionRepo.findById(positionId, userId, accountId);
  if (!p) return null;
  assertPositionAccountScope(p, accountId);
  return p;
}

async function closePosition(userId, positionId, options = {}) {
  const { volume, pnl: pnlParam, closePrice, accountId, bypassAdmin } = options || {};
  const pos = await positionRepo.findById(positionId, userId, accountId);
  if (!pos) {
    const err = new Error('Position not found');
    err.statusCode = 404;
    throw err;
  }
  assertPositionAccountScope(pos, accountId);
  if (pos.closedAt) {
    const err = new Error('Position already closed');
    err.statusCode = 400;
    throw err;
  }
  const closeVol = volume != null ? Number(volume) : pos.volume;
  if (Number.isNaN(closeVol) || closeVol <= 0 || closeVol > pos.volume) {
    const err = new Error('Invalid close volume');
    err.statusCode = 400;
    throw err;
  }
  const now = new Date();
  const isFull = closeVol >= pos.volume;

  let resolvedClosePrice = closePrice != null ? Number(closePrice) : null;
  let pnl = pnlParam != null ? Number(pnlParam) : (pos.pnl != null ? pos.pnl : 0);
  if (isFull) {
    if (resolvedClosePrice != null) {
      pnl = computeUnrealizedPnl(pos, resolvedClosePrice);
    } else if (Number(pos.currentPrice) || Number(pos.openPrice)) {
      // Fallback: use position's currentPrice (or openPrice) so PnL is persisted even when client omits closePrice
      const fallbackPrice = Number(pos.currentPrice) || Number(pos.openPrice);
      resolvedClosePrice = fallbackPrice;
      pnl = computeUnrealizedPnl(pos, resolvedClosePrice);
    }
  }
  let account = (pos.accountId || accountId)
    ? await tradingAccountRepo.findById(pos.accountId || accountId, userId)
    : null;
  if (!account && Math.abs(Number(pnlParam ?? pos.pnl ?? 0)) > 0.001) {
    const userAccounts = await tradingAccountRepo.listByUser(userId);
    const liveAcc = userAccounts.find((a) => a.type === 'live');
    if (liveAcc) account = liveAcc;
  }
  const isLive = account?.type === 'live';
  const willPostPnl = isFull && isLive && Math.abs(pnl) > 0.001;
  // Diagnostic: log why ledger/wallet may be skipped (so "no data to db" can be traced)
  // eslint-disable-next-line no-console
  console.log('[position] close resolution', {
    positionId,
    posAccountId: pos.accountId ?? null,
    requestAccountId: accountId ?? null,
    accountType: account?.type ?? 'none',
    isFull,
    isLive,
    willPostPnl,
    pnl: Math.abs(pnl) > 0.001 ? pnl : 0,
  });
  if (!bypassAdmin && willPostPnl) {
    await checkTradingAllowed(userId, pnl);
  } else if (!bypassAdmin) {
    await checkTradingAllowed(userId, 0);
  }

  if (isFull) {
    const realizedPnl = Number(pnl);
    const update = {
      closedAt: now,
      closedVolume: pos.volume,
      pnl: realizedPnl,
      realizedPnl,
      status: 'closed',
    };
    if (resolvedClosePrice != null) update.closePrice = resolvedClosePrice;

    const targetAccountId = pos.accountId || accountId;
    const hasMaterialPnl = Math.abs(pnl) > 0.001;

    if (account?.type === 'live' && hasMaterialPnl) {
      const uid = String(userId);
      const pid = String(positionId);
      let tradeWalletTxId;
      await financialTransactionService.runPairedWithTransaction(async (session) => {
        const before = await ledgerRepo.getBalance(uid, ACCOUNTS.WALLET, null, { session });
        const postRes = await ledgerService.postTradingPnl(uid, Math.abs(pnl), 'USD', pid, pnl > 0, { session });
        if (postRes.ids?.length > 0) {
          await walletRepo.updateBalance(uid, 'USD', pnl, { session });
          tradeWalletTxId = await walletRepo.createTransaction(
            {
              userId: uid,
              type: 'trade',
              amount: pnl,
              currency: 'USD',
              status: 'completed',
              reference: pid,
              completedAt: now,
            },
            { session }
          );
        } else {
          const after = await ledgerRepo.getBalance(uid, ACCOUNTS.WALLET, null, { session });
          const d = after - before;
          if (Math.abs(d) > 0.001) {
            await walletRepo.updateBalance(uid, 'USD', d, { session });
          }
        }
        await positionRepo.update(positionId, userId, update, accountId, { session });
      }, { label: 'live_trade_close' });
      await financialTransactionService.verifyWalletLedgerAfterMutation(userId, 'USD', {
        flow: 'live_trade_close',
        positionId: pid,
      });
      if (tradeWalletTxId) {
        const { queueWalletBalanceNotifyById } = await import('../email/wallet-balance-notify.js');
        queueWalletBalanceNotifyById(tradeWalletTxId);
      }
      try {
        const ibIds = await ibRepo.getUplineChainForClient(userId);
        if (ibIds.length && (Number(pos.volume) || 0) > 0) {
          await commissionEngine.calculateForHierarchy(
            { id: positionId, volume: pos.volume, symbol: pos.symbol || null, currency: 'USD' },
            ibIds,
            userId
          );
        }
      } catch (e) {
        console.error('[positions] IB commission failed:', e?.message || e);
      }
    } else {
      await positionRepo.update(positionId, userId, update, accountId);
      if (hasMaterialPnl) {
        if (account?.type === 'demo') {
          if (targetAccountId) {
            await tradingAccountRepo.updateBalance(targetAccountId, userId, pnl);
          }
        } else if (account?.type === 'pamm') {
          let distLockOwner = null;
          try {
            const distLock = await tryAcquireDistributionRunLock(positionId, userId);
            if (!distLock.acquired) {
              console.log('[positions] PAMM distribution skipped:', distLock.reason, positionId);
            } else {
              distLockOwner = distLock.owner;
              await pulseDistributionHeartbeat(positionId, userId, distLock.owner);
              await distributionService.distributePammPnl(
                userId,
                positionId,
                pnl,
                targetAccountId,
                {
                  symbol: pos.symbol,
                  side: pos.side,
                  volume: pos.volume,
                  openPrice: pos.openPrice,
                  closedAt: now,
                  pnl,
                  closePrice: resolvedClosePrice ?? pos.closePrice,
                }
              );
              await markDistributionRunCompleted(positionId, userId, distLock.owner);
            }
          } catch (e) {
            console.error('[positions] PAMM distribution failed:', e?.message || e);
            try {
              await markDistributionRunFailed(positionId, userId, distLockOwner, e?.message || String(e));
            } catch (markErr) {
              console.warn('[positions] PAMM distribution fail mark error:', markErr?.message || markErr);
            }
          }
        }
      }
    }

    // Emit risk_event for UI (TP/SL or forced close) and log summary.
    try {
      const { emitRiskEvent } = await import('../../src/services/tradeEvents.js');
      const payload = {
        type: 'position_closed',
        reason: options?.reason || 'manual',
        positionId,
        accountId: pos.accountId || accountId || null,
        symbol: pos.symbol,
        side: pos.side,
        volume: pos.volume,
        openPrice: pos.openPrice,
        closePrice: resolvedClosePrice != null ? resolvedClosePrice : pos.closePrice ?? null,
        pnl,
      };
      emitRiskEvent(userId, payload);
    } catch {
      // ignore emit errors
    }

    // eslint-disable-next-line no-console
    console.log('[position] closed', {
      userId,
      accountId: pos.accountId || accountId || null,
      positionId,
      symbol: pos.symbol,
      side: pos.side,
      volume: pos.volume,
      openPrice: pos.openPrice,
      closePrice: resolvedClosePrice != null ? resolvedClosePrice : pos.closePrice ?? null,
      pnl,
    });
    return { status: 'closed', closedVolume: pos.volume, pnl };
  }
  await positionRepo.update(positionId, userId, {
    volume: pos.volume - closeVol,
    closedVolume: (pos.closedVolume || 0) + closeVol,
  }, accountId);
  return { status: 'partial', closedVolume: closeVol, remainingVolume: pos.volume - closeVol };
}

/** Open a position (e.g. when order is filled); used by execution or for manual/testing */
async function openPosition(userId, doc) {
  const positionDoc = {
    userId,
    symbol: doc.symbol,
    side: doc.side ?? 'buy',
    volume: doc.volume,
    openPrice: doc.openPrice,
    currentPrice: doc.currentPrice ?? doc.openPrice,
    pnl: doc.pnl ?? 0,
  };
  if (doc.accountId) positionDoc.accountId = doc.accountId;
  if (doc.takeProfit != null) positionDoc.takeProfit = doc.takeProfit;
  if (doc.stopLoss != null) positionDoc.stopLoss = doc.stopLoss;
  const id = await positionRepo.create(positionDoc);
  return positionRepo.findById(id, userId, doc.accountId);
}

/** Update take profit and/or stop loss for an open position. Pass null to clear. */
async function updatePositionTPLS(userId, positionId, { takeProfit, stopLoss }, accountId = null) {
  const pos = await positionRepo.findById(positionId, userId, accountId);
  if (!pos) {
    const err = new Error('Position not found');
    err.statusCode = 404;
    throw err;
  }
  assertPositionAccountScope(pos, accountId);
  if (pos.closedAt) {
    const err = new Error('Position already closed');
    err.statusCode = 400;
    throw err;
  }
  const update = { updatedAt: new Date() };
  if (takeProfit !== undefined) update.takeProfit = takeProfit == null || takeProfit === '' ? null : Number(takeProfit);
  if (stopLoss !== undefined) update.stopLoss = stopLoss == null || stopLoss === '' ? null : Number(stopLoss);
  await positionRepo.update(positionId, userId, update, accountId);
  return positionRepo.findById(positionId, userId, accountId);
}

/** Pure TP/SL evaluation for a single position (exported for tests). */
export function evaluateTPLS(pos, price) {
  const p = Number(price);
  if (!Number.isFinite(p)) return { shouldClose: false, closePrice: null, reason: '' };
  const tp = pos.takeProfit != null ? Number(pos.takeProfit) : null;
  const sl = pos.stopLoss != null ? Number(pos.stopLoss) : null;
  // Infer side if missing: if TP is above open -> buy, if below -> sell; fall back to SL.
  let side = String(pos.side || '').toLowerCase();
  const open = Number(pos.openPrice) || 0;
  if (!side && open && (tp != null || sl != null)) {
    if (tp != null && tp > open) side = 'buy';
    else if (tp != null && tp < open) side = 'sell';
    else if (sl != null && sl < open) side = 'buy';
    else if (sl != null && sl > open) side = 'sell';
  }
  let shouldClose = false;
  let closePrice = p;
  let reason = '';
  if (tp != null && side === 'buy' && p >= tp) {
    shouldClose = true; closePrice = tp; reason = `TP hit (buy >= ${tp})`;
  } else if (tp != null && side === 'sell' && p <= tp) {
    shouldClose = true; closePrice = tp; reason = `TP hit (sell <= ${tp})`;
  } else if (sl != null && side === 'buy' && p <= sl) {
    shouldClose = true; closePrice = sl; reason = `SL hit (buy <= ${sl})`;
  } else if (sl != null && side === 'sell' && p >= sl) {
    shouldClose = true; closePrice = sl; reason = `SL hit (sell >= ${sl})`;
  }
  return { shouldClose, closePrice: shouldClose ? closePrice : null, reason };
}

async function resolveBalanceForEquityFloor(account, userId) {
  let balance = Number(account.balance) || 0;
  if (account.type === 'live') {
    try {
      const wallet = await walletRepo.getOrCreateWallet(userId, account.currency || 'USD');
      balance = Number(wallet.balance) ?? 0;
    } catch {
      /* keep trading_accounts.balance */
    }
  }
  return balance;
}

async function closeAllOpenPositionsForTickRisk(
  userId,
  accountId,
  account,
  openPositions,
  tickSym,
  pNum,
  reason,
  logTag
) {
  for (const pos of openPositions) {
    try {
      const posSym = normalizeSymbolKey(pos.symbol);
      const closePrice =
        posSym === tickSym
          ? pNum
          : (getLastPrice(pos.symbol) ?? (Number(pos.currentPrice) || Number(pos.openPrice) || null));
      await closePosition(userId, pos.id, {
        closePrice,
        accountId,
        bypassAdmin: true,
        reason: reason || 'risk',
      });
      // eslint-disable-next-line no-console
      console.log(`[margin] Closed position (${logTag})`, {
        userId,
        accountId,
        accountType: account.type,
        positionId: pos.id,
        closePrice,
        reason: logTag,
      });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn(`[margin] Failed to close position (${logTag})`, pos.id, e.message);
    }
  }
}

/**
 * Post-tick risk (same marks as account summary / equity floor):
 * 1) Zero-equity floor — close all when equity &lt; 0 with unrealized loss.
 * 2) Optional margin stop-out — MARGIN_LEVEL_STOP_OUT_BELOW_PCT (e.g. 50 = close if margin level &lt; 50%).
 * 3) Optional margin warning — MARGIN_LEVEL_WARN_BELOW_PCT + throttled risk_event (Socket.IO).
 */
async function enforceEquityFloorForAccounts(symbol, price, positions) {
  if (!positions?.length) return;
  const pNum = Number(price);
  if (!Number.isFinite(pNum)) return;

  const tickSym = normalizeSymbolKey(symbol);
  const { stopOutBelowPct: stopOutPct, warnBelowPct, warnIntervalMs } = getMarginRiskRuntime();

  const accountKeys = new Set();
  for (const pos of positions) {
    if (!pos.accountId) continue;
    accountKeys.add(`${pos.userId}:${pos.accountId}`);
  }
  if (!accountKeys.size) return;

  for (const key of accountKeys) {
    const [userId, accountId] = key.split(':');
    if (!userId || !accountId) continue;
    const account = await tradingAccountRepo.findById(accountId, userId);
    if (!account) continue;

    const balance = await resolveBalanceForEquityFloor(account, userId);
    const openPositions = await positionRepo.listOpen(userId, { accountId, limit: 500 });
    if (!openPositions.length) continue;

    let equity = balance;
    for (const pos of openPositions) {
      const posSym = normalizeSymbolKey(pos.symbol);
      const mark =
        posSym === tickSym
          ? pNum
          : (getLastPrice(pos.symbol) ?? (Number(pos.currentPrice) || Number(pos.openPrice) || null));
      equity += computeUnrealizedPnl(pos, mark);
    }

    const leverage = Math.max(1, Number(account.leverage) || 100);
    const marginUsed = marginUsedForPositions(openPositions, leverage);
    const marginLevel = marginUsed > 0 ? (equity / marginUsed) * 100 : null;

    const hasUnrealizedLoss = equity < balance;
    let closedAccount = false;

    if (equity < 0 && hasUnrealizedLoss) {
      await closeAllOpenPositionsForTickRisk(
        userId,
        accountId,
        account,
        openPositions,
        tickSym,
        pNum,
        'equity_floor',
        'zero_equity'
      );
      closedAccount = true;
    }

    if (
      !closedAccount
      && stopOutPct > 0
      && marginUsed > 0
      && marginLevel != null
      && Number.isFinite(marginLevel)
      && marginLevel < stopOutPct
    ) {
      await closeAllOpenPositionsForTickRisk(
        userId,
        accountId,
        account,
        openPositions,
        tickSym,
        pNum,
        'margin_stop_out',
        'margin_stop_out'
      );
      closedAccount = true;
      try {
        const { emitRiskEvent } = await import('../../src/services/tradeEvents.js');
        emitRiskEvent(userId, {
          type: 'margin_stop_out',
          accountId,
          marginLevel: Math.round(marginLevel * 100) / 100,
          stopOutBelowPct: stopOutPct,
          equity: Math.round(equity * 100) / 100,
          marginUsed: Math.round(marginUsed * 100) / 100,
          accountType: account.type,
        });
      } catch {
        /* ignore */
      }
    }

    if (
      !closedAccount
      && warnBelowPct > 0
      && marginUsed > 0
      && marginLevel != null
      && Number.isFinite(marginLevel)
      && marginLevel < warnBelowPct
    ) {
      const wk = `${userId}:${accountId}`;
      const now = Date.now();
      if (!lastMarginWarningAt.has(wk) || now - lastMarginWarningAt.get(wk) >= warnIntervalMs) {
        lastMarginWarningAt.set(wk, now);
        try {
          const { emitRiskEvent } = await import('../../src/services/tradeEvents.js');
          emitRiskEvent(userId, {
            type: 'margin_warning',
            accountId,
            marginLevel: Math.round(marginLevel * 100) / 100,
            warnBelowPct,
            equity: Math.round(equity * 100) / 100,
            marginUsed: Math.round(marginUsed * 100) / 100,
            accountType: account.type,
          });
        } catch {
          /* ignore */
        }
      }
    }
  }
}

/** Check open positions with TP/SL for this symbol and close any that hit. Called on each tick. */
async function checkAndExecuteTPLS(symbol, price) {
  if (!symbol || !Number.isFinite(Number(price))) return;
  const positions = await positionRepo.listOpenBySymbolWithTPLS(symbol);
  if (!positions.length) return;
  const p = Number(price);
  for (const pos of positions) {
    const { shouldClose, closePrice, reason } = evaluateTPLS(pos, p);
    if (shouldClose && closePrice != null) {
      console.log(`[TP/SL] ${reason} for position ${pos.id} (${pos.symbol} ${String(pos.side || '').toLowerCase()}) at price ${p} → closing at ${closePrice}`);
      try {
        await closePosition(pos.userId, pos.id, {
          closePrice,
          accountId: pos.accountId,
          bypassAdmin: true,
          reason: reason || 'tp_sl',
        });
        console.log(`[TP/SL] Position ${pos.id} closed successfully`);
      } catch (e) {
        console.warn('[TP/SL] Close failed:', pos.id, e.message);
      }
    }
  }

  await enforceEquityFloorForAccounts(symbol, p, positions);
}

export default {
  getOpenPositions,
  getTopTradersWithPositions,
  getClosedPositions,
  getPosition,
  closePosition,
  openPosition,
  updatePositionTPLS,
  checkAndExecuteTPLS,
};
