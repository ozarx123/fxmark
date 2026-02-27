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

function getContractSize(symbol) {
  return String(symbol || '').toUpperCase().includes('XAU') ? 100 : 100000;
}

function computePnL(pos, closePrice) {
  const open = Number(pos.openPrice) || 0;
  const vol = Number(pos.volume) || 0;
  if (!open || !vol || !closePrice) return 0;
  const contractSize = getContractSize(pos.symbol);
  const diff = closePrice - open;
  return (pos.side === 'sell' ? -diff : diff) * vol * contractSize;
}

function deriveClosePrice(pos) {
  const open = Number(pos.openPrice) || 0;
  const vol = Number(pos.closedVolume ?? pos.volume) || 0;
  const pnl = Number(pos.pnl) || 0;
  if (!open || !vol) return null;
  const contractSize = getContractSize(pos.symbol);
  const factor = pos.side === 'sell' ? -1 : 1;
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
    side: doc.side,
    volume: doc.volume,
    openPrice: doc.openPrice,
    currentPrice: doc.currentPrice ?? doc.openPrice,
    pnl: doc.pnl ?? 0,
  };
  if (doc.accountId) positionDoc.accountId = doc.accountId;
  const id = await positionRepo.create(positionDoc);
  return positionRepo.findById(id, userId, doc.accountId);
}

export default {
  getOpenPositions,
  getTopTradersWithPositions,
  getClosedPositions,
  getPosition,
  closePosition,
  openPosition,
};
