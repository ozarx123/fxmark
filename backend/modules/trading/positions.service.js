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

function computePnL(pos, closePrice) {
  const open = Number(pos.openPrice) || 0;
  const vol = Number(pos.volume) || 0;
  if (!open || !vol || !closePrice) return 0;
  const sym = String(pos.symbol || '').toUpperCase();
  const isGold = sym.includes('XAU');
  const contractSize = isGold ? 100 : 100000;
  const diff = closePrice - open;
  return (pos.side === 'sell' ? -diff : diff) * vol * contractSize;
}

async function getOpenPositions(userId, options = {}) {
  return positionRepo.listOpen(userId, options);
}

async function getClosedPositions(userId, options = {}) {
  const { from, to, limit, symbol } = options;
  return positionRepo.listClosed(userId, { from, to, limit, symbol });
}

async function getPosition(userId, positionId, accountId = null) {
  return positionRepo.findById(positionId, userId, accountId);
}

async function closePosition(userId, positionId, options = {}) {
  const { volume, pnl: pnlParam, closePrice, accountId } = options || {};
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
  if (closePrice != null && isFull) {
    pnl = computePnL(pos, Number(closePrice));
  }

  if (isFull) {
    await positionRepo.update(positionId, userId, {
      closedAt: now,
      closedVolume: pos.volume,
      pnl,
    }, accountId);
    if (Math.abs(pnl) > 0.001) {
      const targetAccountId = pos.accountId || accountId;
      const account = targetAccountId ? await tradingAccountRepo.findById(targetAccountId, userId) : null;

      if (account?.type === 'pamm') {
        try {
          await distributionService.distributePammPnl(userId, positionId, pnl, targetAccountId, pos);
        } catch (e) {
          console.warn('[positions] PAMM distribution failed:', e.message);
          await tradingAccountRepo.updateBalance(targetAccountId, userId, pnl);
        }
      } else {
        await ledgerService.postTradingPnl(userId, Math.abs(pnl), 'USD', positionId, pnl > 0);
        if (targetAccountId && account) {
          if (account.type === 'demo') {
            await tradingAccountRepo.updateBalance(targetAccountId, userId, pnl);
          } else {
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
          }
        } else if (!targetAccountId) {
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
          console.warn('[positions] IB commission failed:', e.message);
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
  getClosedPositions,
  getPosition,
  closePosition,
  openPosition,
};
