/**
 * READ-ONLY trace: why processPammIbCommissionOnTradeClose did not create a record
 * for the latest Bull Run trade. No code changes to application; only DB reads and report.
 *
 * Run from backend: node scripts/trace-pamm-ib-commission-skip.js
 */
import 'dotenv/config';
import { getDb } from '../config/mongo.js';
import ibRepo from '../modules/ib/ib.repository.js';
import pammRepo from '../modules/pamm/pamm.repository.js';

const TARGET_PROFIT_PERCENT = 0.8;

function getDateUtcStr(d) {
  return new Date(d).toISOString().slice(0, 10);
}

function startOfDayUtc(d) {
  const x = new Date(d);
  return new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate()));
}

function endOfDayUtc(d) {
  const start = startOfDayUtc(d);
  return new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
}

console.log('=== PAMM IB commission skip trace (read-only) ===\n');

const db = await getDb();
const ledgerCol = db.collection('ledger_entries');
const dailyProfitCol = db.collection('pamm_investor_daily_profit');
const logsCol = db.collection('pamm_ib_commission_logs');

// 1. Get latest Bull Run trade from pamm_dist (investor profit credit)
const latestDist = await ledgerCol
  .find({
    referenceType: 'pamm_dist',
    accountCode: 'WALLET',
    credit: { $gt: 0 },
  })
  .sort({ createdAt: -1 })
  .limit(1)
  .toArray();

let positionId, fundId, investorEntityId, tradeCreatedAt, investorCreditForTrade;
if (latestDist.length > 0) {
  const e = latestDist[0];
  positionId = e.referenceId;
  fundId = e.pammFundId ?? null;
  investorEntityId = e.entityId;
  tradeCreatedAt = e.createdAt;
  investorCreditForTrade = e.credit ?? 0;
} else {
  const tradesCol = db.collection('manager_trades');
  const latestTrade = await tradesCol.find({}).sort({ createdAt: -1 }).limit(1).toArray();
  if (latestTrade.length === 0) {
    console.log('1. Trade checked: NONE (no pamm_dist and no manager_trades). Exiting.');
    process.exit(0);
  }
  const t = latestTrade[0];
  positionId = t.positionId;
  fundId = t.managerId;
  tradeCreatedAt = t.createdAt;
  investorCreditForTrade = null;
  const allocs = fundId ? await pammRepo.listAllocationsByManager(fundId, { status: 'active' }) : [];
  investorEntityId = allocs.length > 0 ? String(allocs[0].followerId) : null;
}

const tradeDateStr = getDateUtcStr(tradeCreatedAt);
console.log('1. Trade id checked:', positionId);
console.log('   fundId:', fundId);
console.log('   investor (entityId from ledger):', investorEntityId);
console.log('   trade date (UTC):', tradeDateStr);
console.log('   trade createdAt:', tradeCreatedAt);
if (investorCreditForTrade != null) console.log('   investor credit (this entry):', investorCreditForTrade);

if (!investorEntityId && !positionId) {
  console.log('\n   Cannot trace: no investor from ledger. manager_trades has no per-investor info.');
  process.exit(0);
}

const normalizedInvestorId = investorEntityId
  ? (await ibRepo.resolveUserIdFromFollowerId(investorEntityId)) || String(investorEntityId)
  : null;

if (!normalizedInvestorId) {
  console.log('\n   Cannot trace: could not resolve investor id from', investorEntityId);
  process.exit(0);
}

const allocations = fundId ? await pammRepo.listAllocationsByManager(fundId, { status: 'active' }) : [];
const allocForInvestor = allocations.find(
  (a) => String(a.followerId) === String(investorEntityId) || String(a.followerId) === normalizedInvestorId
);
const activeCapital = allocForInvestor ? Number(allocForInvestor.allocatedBalance) || 0 : 0;

const todayCreditedProfitDoc = await dailyProfitCol.findOne({
  investor_id: String(normalizedInvestorId),
  date_utc: tradeDateStr,
});
const todayCreditedProfit = Number(todayCreditedProfitDoc?.credited_profit) ?? 0;

const ibChain = await ibRepo.getUplineChainForClient(normalizedInvestorId);
const settings = await ibRepo.getPammIbCommissionSettings();
const levels = settings?.levels || {};
const level1 = levels[1];
const levelPercent = level1 ? Number(level1.daily_payout_percent) || 0 : 0;
const levelDisabled = level1?.status === 'disabled';

const capital = activeCapital;
const todayProfit = todayCreditedProfit;
const currentProfitPercent = capital > 0 ? (todayProfit / capital) * 100 : 0;

const startTradeDay = startOfDayUtc(tradeCreatedAt);
const endTradeDay = endOfDayUtc(tradeCreatedAt);

async function getPaidForDay(investorId, ibId, dayStart, dayEnd) {
  const res = await logsCol
    .aggregate([
      {
        $match: {
          $and: [
            { $or: [{ investor_id: String(investorId) }, { investor_id: investorId }] },
            { $or: [{ ib_id: String(ibId) }, { ib_id: ibId }] },
            { created_at: { $gte: dayStart, $lte: dayEnd } },
          ],
        },
      },
      { $group: { _id: null, total: { $sum: '$commission_amount' } } },
    ])
    .next();
  return res ? Math.round((res.total || 0) * 100) / 100 : 0;
}

const firstIbId = ibChain[0] || null;
const alreadyPaidToday =
  firstIbId && normalizedInvestorId ? await getPaidForDay(normalizedInvestorId, firstIbId, startTradeDay, endTradeDay) : 0;

const maxDailyPayout = levelPercent > 0 && capital > 0 ? Math.round((capital * (levelPercent / 100)) * 100) / 100 : 0;
const allowedPayoutSoFar =
  maxDailyPayout * Math.min(1, currentProfitPercent / TARGET_PROFIT_PERCENT);
let payoutNow = Math.round((allowedPayoutSoFar - alreadyPaidToday) * 100) / 100;
const dailyCapRemaining = Math.round((maxDailyPayout - alreadyPaidToday) * 100) / 100;
if (payoutNow > dailyCapRemaining) payoutNow = dailyCapRemaining;

console.log('\n2. Values at calculation step');
console.log('   investorId (normalized):', normalizedInvestorId);
console.log('   fundId:', fundId);
console.log('   positionId:', positionId);
console.log('   activeCapital:', activeCapital);
console.log('   todayCreditedProfit (for trade date', tradeDateStr + '):', todayCreditedProfit);
console.log('   currentProfitPercent:', currentProfitPercent);
console.log('   targetProfitPercent:', TARGET_PROFIT_PERCENT);
console.log('   IB chain length:', ibChain.length);
console.log('   IB chain ids:', ibChain.map((id) => String(id)));
console.log('   Level 1 config: daily_payout_percent=', levelPercent, 'status=', level1?.status);
console.log('   maxDailyPayout (L1):', maxDailyPayout);
console.log('   allowedPayoutSoFar (L1):', allowedPayoutSoFar);
console.log('   alreadyPaidToday (L1, for trade date):', alreadyPaidToday);
console.log('   payoutNow (L1):', payoutNow);
console.log('   dailyCapRemaining (L1):', dailyCapRemaining);

const skipReasons = [];

if (capital <= 0 || !normalizedInvestorId || !fundId || !positionId) {
  skipReasons.push('SKIP: missing args (capital<=0 or missing investorId/fundId/positionId)');
}
if (todayProfit <= 0) {
  skipReasons.push('SKIP: todayCreditedProfit <= 0 (no credited profit for this investor on trade date)');
}
if (!ibChain.length) {
  skipReasons.push('SKIP: no IB chain for investor (referrerId missing or referrer not an IB)');
}
if (currentProfitPercent <= 0 && !skipReasons.some((s) => s.includes('todayCreditedProfit'))) {
  skipReasons.push('SKIP: currentProfitPercent <= 0');
}
if (level1 && levelDisabled) {
  skipReasons.push('SKIP: level 1 disabled');
}
if (levelPercent <= 0) {
  skipReasons.push('SKIP: level 1 daily_payout_percent is 0');
}
if (maxDailyPayout < 0.001) {
  skipReasons.push('SKIP: maxDailyPayout < 0.001');
}
if (payoutNow <= 0 || payoutNow < 0.001) {
  skipReasons.push('SKIP: payoutNow <= 0 or < 0.001 (daily cap or no room)');
}

console.log('\n3. Which condition caused skip');
if (skipReasons.length === 0) {
  console.log('   None of the skip conditions apply; insert would have been attempted.');
} else {
  skipReasons.forEach((r) => console.log('   ', r));
}

const existingLogs = await logsCol.find({ trade_id: positionId }).toArray();
const insertWouldRun =
  !skipReasons.length &&
  capital > 0 &&
  todayProfit > 0 &&
  ibChain.length > 0 &&
  currentProfitPercent > 0 &&
  (payoutNow > 0.001 || (payoutNow <= 0.001 && ibChain[0]));

console.log('\n4. Whether insert was executed');
console.log('   createPammIbCommissionLog would be called:', insertWouldRun ? 'YES (for at least one level or zero-amount log)' : 'NO');
console.log('   Existing logs in pamm_ib_commission_logs for this trade_id:', existingLogs.length);
if (existingLogs.length > 0) {
  existingLogs.forEach((l, i) => {
    console.log('     Log', i + 1, '| ib_id:', l.ib_id, '| amount:', l.commission_amount, '| level:', l.level_number, '| created_at:', l.created_at);
  });
}

console.log('\n5. Exact reason why no record exists');
if (existingLogs.length > 0) {
  console.log('   A record DOES exist for this trade_id. Count:', existingLogs.length);
  console.log('   If not visible on IB page, the cause is likely ib_id / effectiveIbId mismatch or date filter.');
} else if (skipReasons.length > 0) {
  const first = skipReasons[0];
  if (first.includes('todayCreditedProfit')) {
    console.log('   No record because: todayCreditedProfit is 0 for the trade date.', tradeDateStr);
    console.log('   Either (a) pamm_investor_daily_profit was never incremented for this investor on that date,');
    console.log('   or (b) the trace is running on a different day and that day has no credited profit,');
    console.log('   or (c) distribution ran but incrementPammInvestorDailyCreditedProfit failed or ran after the commission step.');
  } else if (first.includes('no IB chain')) {
    console.log('   No record because: investor has no referrerId or referrer is not an IB.');
    console.log('   Check users.referrerId for', normalizedInvestorId, 'and that referrer has an ib_profiles entry.');
  } else if (first.includes('missing args')) {
    console.log('   No record because: one of investorId, fundId, positionId is missing or activeCapital <= 0.');
  } else if (first.includes('payoutNow')) {
    console.log('   No record because: payout for level 1 is 0 or below threshold (daily cap reached or allowedPayoutSoFar <= alreadyPaidToday).');
  } else {
    console.log('   No record because:', first);
  }
} else {
  console.log('   Logic allows insert but no log found: possible timing (distribution not yet run for this trade) or write failure.');
}

console.log('\n=== End trace ===');
