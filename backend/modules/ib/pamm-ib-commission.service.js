/**
 * PAMM Bull Run investor IB commission — progressive capital-based payout.
 * Runs when a Bull Run trade closes in profit and the investor receives profit.
 * Investor profit is never touched; IB commission comes from manager/system side only.
 * Idempotent per (trade_id, investor_id, ib_id, level); stable ledger reference keys.
 * All wallet credits go through financialTransactionService.atomicPammIbCommissionCredit.
 */
import { MongoServerError } from 'mongodb';
import ibRepo from './ib.repository.js';
import walletRepo from '../wallet/wallet.repository.js';
import financialTransactionService from '../finance/financial-transaction.service.js';

const MAX_LEVELS = 3;
const TARGET_PROFIT_PERCENT = 0.8;

async function applyIbPammCredit(
  ibId,
  paidToIb,
  stableRef,
  desc,
  investorId,
  fundId,
  positionId,
  levelNumber,
  activeCapitalBase,
  commissionPercent
) {
  if (paidToIb < 0.001) return;
  const ibStr = String(ibId);
  if (await walletRepo.existsIbPammCommissionWallet(ibStr, stableRef)) return;

  const existingLog = await ibRepo.findPammIbPayoutLog(positionId, investorId, ibStr, levelNumber);
  if (existingLog && Number(existingLog.commission_amount) >= 0.001) {
    const amt = Number(existingLog.commission_amount);
    await financialTransactionService.atomicPammIbCommissionCredit(ibStr, amt, stableRef, desc);
    return;
  }

  try {
    await ibRepo.createPammIbCommissionLog({
      ib_id: ibStr,
      investor_id: String(investorId),
      pool_id: fundId,
      trade_id: positionId,
      active_capital_base: activeCapitalBase,
      commission_percent: commissionPercent,
      commission_amount: paidToIb,
      level_number: levelNumber,
    });
  } catch (e) {
    if (e instanceof MongoServerError && e.code === 11000) {
      const ex = await ibRepo.findPammIbPayoutLog(positionId, investorId, ibStr, levelNumber);
      if (ex && !(await walletRepo.existsIbPammCommissionWallet(ibStr, stableRef))) {
        const amt = Number(ex.commission_amount);
        await financialTransactionService.atomicPammIbCommissionCredit(ibStr, amt, stableRef, desc);
      }
      return;
    }
    throw e;
  }

  await financialTransactionService.atomicPammIbCommissionCredit(ibStr, paidToIb, stableRef, desc);
}

/**
 * Process PAMM Bull Run IB commission for one investor when a profitable trade closes.
 */
export async function processPammIbCommissionOnTradeClose(investorId, activeCapital, fundId, positionId, todayCreditedProfit) {
  const capital = Number(activeCapital) || 0;
  if (capital <= 0 || !investorId || !fundId || !positionId) {
    console.warn('[pamm-ib] skip: missing args', { investorId: !!investorId, capital, fundId: !!fundId, positionId: !!positionId });
    return;
  }

  const todayProfit = Number(todayCreditedProfit) || 0;
  if (todayProfit <= 0) {
    console.warn('[pamm-ib] skip: todayCreditedProfit <= 0', { investorId, todayCreditedProfit });
    return;
  }

  const ibIds = await ibRepo.getUplineChainForClient(investorId);
  if (!ibIds.length) {
    console.warn('[pamm-ib] skip: no IB chain for investor', investorId);
    return;
  }

  const settings = await ibRepo.getPammIbCommissionSettings();
  const levels = settings?.levels || {};
  const chain = ibIds.slice(0, MAX_LEVELS);

  const currentProfitPercent = capital > 0 ? (todayProfit / capital) * 100 : 0;
  if (currentProfitPercent <= 0) {
    console.warn('[pamm-ib] skip: currentProfitPercent <= 0', { investorId, todayProfit, capital });
    return;
  }

  let creditedAny = false;
  const levelDiagnostics = [];
  for (let i = 0; i < chain.length; i++) {
    const levelNumber = i + 1;
    const levelConfig = levels[levelNumber];
    if (!levelConfig || levelConfig.status === 'disabled') {
      levelDiagnostics.push({ level: levelNumber, reason: !levelConfig ? 'noConfig' : 'disabled' });
      continue;
    }

    const levelPercent = Number(levelConfig.daily_payout_percent) || 0;
    if (levelPercent <= 0) {
      levelDiagnostics.push({ level: levelNumber, reason: 'zeroPercent' });
      continue;
    }

    const maxDailyPayout = Math.round((capital * (levelPercent / 100)) * 100) / 100;
    if (maxDailyPayout < 0.001) {
      levelDiagnostics.push({ level: levelNumber, reason: 'maxDailyTooSmall', maxDailyPayout });
      continue;
    }

    const allowedPayoutSoFar = maxDailyPayout * Math.min(1, currentProfitPercent / TARGET_PROFIT_PERCENT);
    const ibId = chain[i];
    const alreadyPaidToday = await ibRepo.getPammIbCommissionPaidToday(investorId, ibId);
    const dailyCapRemaining = Math.round((maxDailyPayout - alreadyPaidToday) * 100) / 100;
    const remainingCap = Math.max(0, dailyCapRemaining);
    const payoutBeforeCap = Math.round((allowedPayoutSoFar - alreadyPaidToday) * 100) / 100;
    const paidToIb = Math.round(Math.min(payoutBeforeCap, remainingCap) * 100) / 100;
    const overflow = Math.round((payoutBeforeCap - paidToIb) * 100) / 100;

    levelDiagnostics.push({
      level: levelNumber,
      ibId: String(ibId),
      maxDailyPayout,
      allowedPayoutSoFar,
      alreadyPaidToday,
      payoutNow: paidToIb,
      dailyCapRemaining,
    });

    if (overflow > 0.001) {
      try {
        await ibRepo.createCompanyCommissionPoolEntry({
          source: 'pamm_ib_overflow',
          ib_id: String(ibId),
          investor_id: String(investorId),
          trade_id: positionId,
          amount: overflow,
          level_number: levelNumber,
        });
        console.log('[pamm-ib] cap hit:', {
          ibId: String(ibId),
          level: levelNumber,
          payoutNow: payoutBeforeCap,
          paidToIb,
          overflowToPool: overflow,
        });
      } catch (e) {
        console.warn('[pamm-ib] Company pool insert failed:', e.message);
      }
    }

    if (paidToIb <= 0 || paidToIb < 0.001) continue;

    const stableRef = walletRepo.ibPammCommissionReferenceKey(positionId, investorId, ibId, levelNumber);
    const desc = `PAMM Bull Run L${levelNumber} from investor ${investorId}`;
    await applyIbPammCredit(
      ibId,
      paidToIb,
      stableRef,
      desc,
      investorId,
      fundId,
      positionId,
      levelNumber,
      capital,
      levelPercent
    );
    creditedAny = true;
  }

  if (!creditedAny) {
    console.warn('[pamm-ib] no payout for any level', {
      investorId,
      positionId,
      todayProfit,
      capital,
      currentProfitPercent,
      levelDiagnostics,
    });
    const firstIbId = chain[0];
    if (firstIbId) {
      try {
        await ibRepo.createPammIbCommissionLog({
          ib_id: String(firstIbId),
          investor_id: String(investorId),
          pool_id: fundId,
          trade_id: positionId,
          active_capital_base: capital,
          commission_percent: 0,
          commission_amount: 0,
          level_number: 1,
        });
      } catch (e) {
        if (!(e instanceof MongoServerError && e.code === 11000)) console.warn('[pamm-ib] zero-log insert', e.message);
      }
    }
  }
}
