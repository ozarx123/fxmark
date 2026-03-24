/**
 * Superadmin: manual PAMM realized P&L, wallet profit credit, IB pending commission — single transaction.
 */
import { randomBytes } from 'crypto';
import userRepo from '../users/user.repository.js';
import pammRepo from '../pamm/pamm.repository.js';
import ibRepo from '../ib/ib.repository.js';
import walletRepo from '../wallet/wallet.repository.js';
import ledgerService from '../finance/ledger.service.js';
import financialTransactionService from '../finance/financial-transaction.service.js';
import { queueWalletBalanceNotifyById } from '../email/wallet-balance-notify.js';
import audit from './audit.logs.js';

const MAX_WALLET = 500_000;
const MAX_COMMISSION = 500_000;
const MAX_PNL_DELTA_ABS = 1_000_000;

function refBase() {
  return `pcadj_${Date.now()}_${randomBytes(6).toString('hex')}`;
}

/**
 * @param {string} targetUserId
 */
export async function getAdjustmentContext(targetUserId) {
  if (!targetUserId) {
    const err = new Error('userId required');
    err.statusCode = 400;
    throw err;
  }
  const user = await userRepo.findById(targetUserId);
  if (!user) {
    const err = new Error('User not found');
    err.statusCode = 404;
    throw err;
  }
  const wallet = await walletRepo.getOrCreateWallet(targetUserId, 'USD');
  const ibProfile = await ibRepo.getProfileByUserId(targetUserId);
  const allocs = await pammRepo.listAllocationsByFollowerFlexible(targetUserId, { status: 'active', limit: 30 });
  const funds = await Promise.all(
    allocs.map(async (a) => {
      const fund = await pammRepo.getManagerById(a.managerId);
      return {
        allocationId: a.id,
        fundId: a.managerId,
        fundName: fund?.name || a.managerId,
        allocatedBalance: Number(a.allocatedBalance) || 0,
        realizedPnl: Number(a.realizedPnl) || 0,
        status: a.status,
      };
    })
  );
  return {
    user: { id: user.id, email: user.email, name: user.name },
    walletUsd: Number(wallet.balance) || 0,
    hasIbProfile: !!ibProfile,
    ibUserId: ibProfile?.userId || null,
    pammAllocations: funds,
  };
}

/**
 * @param {object} params
 * @param {string} params.targetUserId
 * @param {string} params.adminUserId
 * @param {string} params.reason
 * @param {string} [params.pammAllocationId]
 * @param {number} [params.pammRealizedPnlDelta]
 * @param {number} [params.walletProfitCreditUsd]
 * @param {number} [params.ibCommissionPendingUsd]
 */
export async function applyAdjustment(params) {
  const {
    targetUserId,
    adminUserId,
    reason,
    pammAllocationId,
    pammRealizedPnlDelta,
    walletProfitCreditUsd,
    ibCommissionPendingUsd,
  } = params;

  const r = String(reason || '').trim();
  if (r.length < 10) {
    const err = new Error('Reason is required (min 10 characters) for audit trail');
    err.statusCode = 400;
    throw err;
  }

  const dPnl = pammRealizedPnlDelta != null && pammRealizedPnlDelta !== '' ? Number(pammRealizedPnlDelta) : 0;
  const wCredit = walletProfitCreditUsd != null && walletProfitCreditUsd !== '' ? Number(walletProfitCreditUsd) : 0;
  const ibAmt = ibCommissionPendingUsd != null && ibCommissionPendingUsd !== '' ? Number(ibCommissionPendingUsd) : 0;

  const hasPnl = pammAllocationId && Number.isFinite(dPnl) && dPnl !== 0;
  const hasWallet = Number.isFinite(wCredit) && wCredit !== 0;
  const hasIb = Number.isFinite(ibAmt) && ibAmt !== 0;

  if (!hasPnl && !hasWallet && !hasIb) {
    const err = new Error('Provide at least one: PAMM P&L delta, wallet credit, or IB commission amount');
    err.statusCode = 400;
    throw err;
  }

  if (hasPnl && !pammAllocationId) {
    const err = new Error('pammAllocationId required when adjusting P&L');
    err.statusCode = 400;
    throw err;
  }
  if (hasPnl && (Math.abs(dPnl) > MAX_PNL_DELTA_ABS || !Number.isFinite(dPnl))) {
    const err = new Error(`P&L delta out of range (max abs ${MAX_PNL_DELTA_ABS})`);
    err.statusCode = 400;
    throw err;
  }
  if (hasWallet && (wCredit <= 0 || wCredit > MAX_WALLET || !Number.isFinite(wCredit))) {
    const err = new Error(`Wallet credit must be between 0.01 and ${MAX_WALLET} USD`);
    err.statusCode = 400;
    throw err;
  }
  if (hasIb && (ibAmt <= 0 || ibAmt > MAX_COMMISSION || !Number.isFinite(ibAmt))) {
    const err = new Error(`IB commission must be between 0.01 and ${MAX_COMMISSION} USD`);
    err.statusCode = 400;
    throw err;
  }

  const user = await userRepo.findById(targetUserId);
  if (!user) {
    const err = new Error('User not found');
    err.statusCode = 404;
    throw err;
  }

  const base = refBase();
  const result = {
    pamm: null,
    wallet: null,
    ibCommissionId: null,
  };

  await withTransaction(async (session) => {
    if (hasPnl) {
      const alloc = await pammRepo.getAllocationByIdOnly(pammAllocationId, { session });
      if (!alloc || !pammRepo.followerIdMatches(alloc.followerId, targetUserId)) {
        const err = new Error('Allocation not found or does not belong to this user');
        err.statusCode = 400;
        throw err;
      }
      const updated = await pammRepo.incrementAllocationRealizedPnl(pammAllocationId, dPnl, { session });
      result.pamm = {
        allocationId: pammAllocationId,
        delta: dPnl,
        newRealizedPnl: updated?.realizedPnl != null ? Number(updated.realizedPnl) : null,
      };
    }

    if (hasWallet) {
      const txRef = `${base}_w`;
      const txId = await walletRepo.createTransaction(
        {
          userId: targetUserId,
          type: 'admin_profit_adjustment',
          amount: wCredit,
          currency: 'USD',
          status: 'completed',
          reference: txRef,
          description: r.slice(0, 500),
          completedAt: new Date(),
        },
        { session }
      );
      await walletRepo.updateTransaction(txId, { reference: txId }, { session });
      await ledgerService.postAdminCredit(targetUserId, wCredit, 'USD', txId, { session });
      const w = await walletRepo.updateBalance(targetUserId, 'USD', wCredit, { session });
      result.wallet = { transactionId: txId, credited: wCredit, balanceUsd: w?.balance };
    }

    if (hasIb) {
      const profile = await ibRepo.getProfileByUserId(targetUserId);
      if (!profile) {
        const err = new Error('User has no IB profile; cannot add IB commission');
        err.statusCode = 400;
        throw err;
      }
      const ibUserId = String(profile.userId);
      const commRef = `${base}_ib`;
      const commissionId = await ibRepo.createCommission(
        {
          ibId: ibUserId,
          tradeId: null,
          clientUserId: null,
          volume: 0,
          symbol: 'ADMIN_ADJUST',
          ratePerLot: 0,
          amount: Math.round(ibAmt * 100) / 100,
          currency: 'USD',
          adminAdjustment: true,
          adminReason: r.slice(0, 500),
          adminUserId: String(adminUserId || ''),
        },
        { session }
      );
      await ledgerService.postCommissionEarned(ibUserId, ibAmt, 'USD', commissionId, null, { session });
      result.ibCommissionId = commissionId;
    }
  }, { label: 'profit_commission_adjustment' });

  audit.log(String(adminUserId), 'profit_commission_adjustment', `user:${targetUserId}`, {
    reason: r,
    ...result,
  });

  if (hasWallet) {
    await financialTransactionService.verifyWalletLedgerAfterMutation(targetUserId, 'USD', {
      flow: 'profit_commission_adjustment',
    });
    if (result.wallet?.transactionId) {
      queueWalletBalanceNotifyById(result.wallet.transactionId);
    }
  }

  return { success: true, message: 'Adjustment applied', details: result };
}
