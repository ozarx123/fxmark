/**
 * PAMM profit distribution — distribute P&L among participants and post to ledger
 */
import pammRepo from './pamm.repository.js';
import tradingAccountRepo from '../trading/trading-account.repository.js';
import ledgerService from '../finance/ledger.service.js';
import walletRepo from '../wallet/wallet.repository.js';
import commissionEngine from '../ib/commission.engine.js';
import { emitPammAllocationUpdate } from './pamm.events.js';

/**
 * Distribute PAMM trade P&L to participants (manager + investors) and post to financial modules
 * @param {string} managerId - PAMM manager userId
 * @param {string} positionId - closed position id
 * @param {number} pnl - realized P&L (positive = profit, negative = loss)
 * @param {string} accountId - PAMM trading account id
 * @param {object} position - position doc (symbol, side, volume, openPrice)
 */
async function distributePammPnl(managerId, positionId, pnl, accountId, position = {}) {
  const fund = await pammRepo.getFundByTradingAccountId(accountId) || await pammRepo.getManagerByUserId(managerId);
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

  const performanceFeePercent = Number(manager.performanceFeePercent) || 0;
  const isProfit = pnl > 0;

  if (isProfit && performanceFeePercent > 0) {
    const feeAmount = Math.round((pnl * performanceFeePercent / 100) * 100) / 100;
    if (feeAmount > 0.001) {
      try {
        await ledgerService.postPammFee(managerId, feeAmount, 'USD', positionId, fundId);
        await walletRepo.updateBalance(managerId, 'USD', feeAmount);
        await walletRepo.createTransaction({
          userId: managerId,
          type: 'pamm_fee',
          amount: feeAmount,
          currency: 'USD',
          status: 'completed',
          reference: positionId,
          completedAt: new Date(),
        });
      } catch (e) {
        console.warn('[pamm] Ledger/wallet post fee failed:', e.message);
      }
    }
  }

  const remainingPnl = isProfit ? pnl - (pnl * performanceFeePercent / 100) : pnl;
  // Each participant's share = their % of total fund capital × remaining P&L
  const managerShare = totalCapital > 0 ? (managerCapital / totalCapital) * remainingPnl : 0;
  const managerShareRounded = Math.round(managerShare * 100) / 100;

  if (Math.abs(managerShareRounded) > 0.001) {
    if (isProfit) {
      await tradingAccountRepo.updateBalance(accountId, managerId, managerShareRounded);
    } else {
      await tradingAccountRepo.updateBalance(accountId, managerId, managerShareRounded);
    }
  }

  const updatedFollowerIds = [];
  for (const alloc of allocations) {
    // Investor share = (investor's allocation / total fund capital) × remaining P&L
    const allocationShareOfFund = totalCapital > 0 ? (alloc.allocatedBalance || 0) / totalCapital : 0;
    const share = allocationShareOfFund * remainingPnl;
    const shareRounded = Math.round(share * 100) / 100;
    if (Math.abs(shareRounded) <= 0.001) continue;

    try {
      await ledgerService.postPammDistribution(alloc.followerId, Math.abs(shareRounded), 'USD', positionId, isProfit, fundId);
      await walletRepo.updateBalance(alloc.followerId, 'USD', shareRounded);
      await walletRepo.createTransaction({
        userId: alloc.followerId,
        type: 'pamm_dist',
        amount: shareRounded,
        currency: 'USD',
        status: 'completed',
        reference: positionId,
        completedAt: new Date(),
      });
      await pammRepo.incrementAllocationRealizedPnl(alloc.id, shareRounded);
      updatedFollowerIds.push(alloc.followerId);
    } catch (e) {
      console.warn('[pamm] Ledger/wallet post dist for', alloc.followerId, 'failed:', e.message);
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
}

async function getIbIdsForFollower(followerId) {
  try {
    const ibRepo = (await import('../ib/ib.repository.js')).default;
    return await ibRepo.getUplineChainForClient(followerId);
  } catch {
    return [];
  }
}

export default { distributePammPnl };
