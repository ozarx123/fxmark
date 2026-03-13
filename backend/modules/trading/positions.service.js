/**
 * Positions service — open/closed positions, close (full or partial), post P&L to ledger and wallet
 */
import positionRepo from './position.repository.js';
import tradingAccountRepo from './trading-account.repository.js';
import ledgerService from '../finance/ledger.service.js';
import walletRepo from '../wallet/wallet.repository.js';
import distributionService from '../pamm/distribution.service.js';
import commissionEngine from '../ib/commission.engine.js';
import ibRepo from '../ib/ib.repository.js';
import { checkTradingAllowed } from '../admin/trading-limits.service.js';

/** XAU/USD and GOLD: 100 oz per lot. All other symbols: 100k units (forex). */
function getContractSize(symbol) {
  const s = String(symbol || '').toUpperCase();
  return (s.includes('XAU') || s === 'GOLD') ? 100 : 100000;
}

/**
 * P&L in USD: (closePrice - openPrice) * volume * contractSize for buy;
 * (openPrice - closePrice) * volume * contractSize for sell.
 * Contract size: 100 for XAU/GOLD (oz per lot), 100000 for forex (units per lot).
 */
function computePnL(pos, closePrice) {
  const open = Number(pos.openPrice) || 0;
  const vol = Number(pos.volume ?? pos.lots) || 0;
  if (!open || !vol || !closePrice) return 0;
  const contractSize = getContractSize(pos.symbol);
  const diff = closePrice - open;
  const side = String(pos.side ?? pos.type ?? '').toLowerCase();
  return (side === 'sell' ? -diff : diff) * vol * contractSize;
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
  return list.map((p) => ({
    ...p,
    closePrice: p.closePrice ?? (p.pnl != null ? deriveClosePrice(p) : null),
  }));
}

async function getPosition(userId, positionId, accountId = null) {
  return positionRepo.findById(positionId, userId, accountId);
}

async function closePosition(userId, positionId, options = {}) {
  const { volume, pnl: pnlParam, closePrice, accountId, bypassAdmin } = options || {};
  const pos = await positionRepo.findById(positionId, userId, accountId);
  if (!pos) {
    const err = new Error('Position not found');
    err.statusCode = 404;
    throw err;
  }
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

  let pnl = pnlParam != null ? Number(pnlParam) : (pos.pnl != null ? pos.pnl : 0);
  const resolvedClosePrice = closePrice != null ? Number(closePrice) : null;
  if (resolvedClosePrice != null && isFull) {
    pnl = computePnL(pos, resolvedClosePrice);
  }
  const account = (pos.accountId || accountId)
    ? await tradingAccountRepo.findById(pos.accountId || accountId, userId)
    : null;
  const isLive = account?.type === 'live';
  const willPostPnl = isFull && isLive && Math.abs(pnl) > 0.001;
  if (!bypassAdmin && willPostPnl) {
    await checkTradingAllowed(userId, pnl);
  } else if (!bypassAdmin) {
    await checkTradingAllowed(userId, 0);
  }

  if (isFull) {
    const update = { closedAt: now, closedVolume: pos.volume, pnl };
    if (resolvedClosePrice != null) update.closePrice = resolvedClosePrice;
    await positionRepo.update(positionId, userId, update, accountId);

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

    // Console summary for closed trades (useful for debugging and audit during development)
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
    if (Math.abs(pnl) > 0.001) {
      const targetAccountId = pos.accountId || accountId;

      if (account?.type === 'pamm') {
        try {
          await distributionService.distributePammPnl(userId, positionId, pnl, targetAccountId, pos);
        } catch (e) {
          console.warn('[positions] PAMM distribution failed:', e.message);
          await tradingAccountRepo.updateBalance(targetAccountId, userId, pnl);
        }
      } else if (account?.type === 'demo') {
        // Demo only: update trading account balance; do not touch ledger or real wallet
        if (targetAccountId) {
          await tradingAccountRepo.updateBalance(targetAccountId, userId, pnl);
        }
      } else {
        // Live only: post P&L to ledger and update real wallet (exclude demo from real wallet)
        const isLive = account?.type === 'live';
        if (isLive) {
          await ledgerService.postTradingPnl(userId, Math.abs(pnl), 'USD', positionId, pnl > 0);
          await walletRepo.updateBalance(userId, 'USD', pnl);
          await walletRepo.createTransaction({
            userId,
            type: 'trade',
            amount: pnl,
            currency: 'USD',
            status: 'completed',
            reference: positionId,
            completedAt: now,
          });
        } else if (!targetAccountId) {
          // Legacy: no account id — do not post to ledger or wallet (avoid demo leaking into real)
        }
        // IB commission only for live trades (not demo)
        if (isLive) {
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
            console.warn('[positions] IB commission failed:', e.message);
          }
        }
      }
    }
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

/**
 * Emergency equity check: if account equity (approx) reaches or drops below zero,
 * close all open positions on that account to prevent negative equity.
 * Equity approximation: balance + sum(PnL for positions in the current symbol).
 */
async function enforceEquityFloorForAccounts(symbol, price, positions) {
  if (!positions?.length) return;
  const pNum = Number(price);
  if (!Number.isFinite(pNum)) return;

  // Group by userId + accountId
  const byAccount = new Map();
  for (const pos of positions) {
    if (!pos.accountId) continue;
    const key = `${pos.userId}:${pos.accountId}`;
    if (!byAccount.has(key)) byAccount.set(key, []);
    byAccount.get(key).push(pos);
  }
  if (!byAccount.size) return;

  for (const [key, accPositions] of byAccount.entries()) {
    const [userId, accountId] = key.split(':');
    if (!userId || !accountId) continue;
    const account = await tradingAccountRepo.findById(accountId, userId);
    if (!account) continue;

    // Only enforce equity floor on live accounts. Demo/PAMM should not be auto-closed here.
    if (account.type !== 'live') continue;

    const balance = Number(account.balance) || 0;

    // Approximate equity using current symbol positions only, with live price
    let equity = balance;
    for (const pos of accPositions) {
      equity += computePnL(pos, pNum);
    }

    // If equity is below zero *and* we actually have unrealized loss (equity < balance),
    // close all open positions to prevent going further negative.
    // This avoids closing immediately when balance is 0 and there is no loss yet.
    const hasUnrealizedLoss = equity < balance;
    if (equity < 0 && hasUnrealizedLoss) {
      // Close all open positions on this account (all symbols) at best available info
      const openPositions = await positionRepo.listOpen(userId, { accountId });
      for (const pos of openPositions) {
        try {
          const isSameSymbol = String(pos.symbol || '').replace(/\//g, '').toUpperCase()
            === String(symbol || '').replace(/\//g, '').toUpperCase();
          const closePrice = isSameSymbol ? pNum : (Number(pos.currentPrice) || Number(pos.openPrice) || null);
          await closePosition(userId, pos.id, {
            closePrice,
            accountId,
            bypassAdmin: true,
          });
          // eslint-disable-next-line no-console
          console.log('[margin] Closed position due to zero equity', { userId, accountId, positionId: pos.id, equity, closePrice });
        } catch (e) {
          // eslint-disable-next-line no-console
          console.warn('[margin] Failed to close position on zero equity', pos.id, e.message);
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

  // After TP/SL processing, we *would* enforce equity floor (no negative equity).
  // This is temporarily disabled until margin/equity integration is finalized,
  // to avoid unexpected instant auto-closure of positions when account balances
  // are out of sync with wallet/equity.
  // await enforceEquityFloorForAccounts(symbol, p, positions);
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
