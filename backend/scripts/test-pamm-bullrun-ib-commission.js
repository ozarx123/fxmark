/**
 * Test script for PAMM Bull Run IB commission workflow.
 * 1. Formula unit tests (no DB) — progressive payout math.
 * 2. DB integration tests — daily profit tracking, paid-today, chain resolution.
 * 3. Optional full-flow run — processPammIbCommissionOnTradeClose (uses real wallet/ledger if run).
 *
 * Run from backend:
 *   node scripts/test-pamm-bullrun-ib-commission.js
 *   node scripts/test-pamm-bullrun-ib-commission.js --live   # run full flow (set env below)
 *
 * Env for --live (optional):
 *   TEST_INVESTOR_ID=userId   (normalized user _id of an investor with referrerId → IB)
 *   TEST_FUND_ID=fundId
 *   TEST_POSITION_ID=positionId
 *   TEST_ACTIVE_CAPITAL=1000
 *   TEST_TODAY_CREDITED_PROFIT=2
 */
import 'dotenv/config';

const TARGET_PROFIT_PERCENT = 0.8;
const LEVEL_PERCENTS = { 1: 0.25, 2: 0.15, 3: 0.10 };

// ---------- 1. Formula (no DB) ----------
function computePayoutNow(activeCapital, todayCreditedProfit, levelPercent, alreadyPaidToday) {
  const capital = Number(activeCapital) || 0;
  const todayProfit = Number(todayCreditedProfit) || 0;
  if (capital <= 0 || levelPercent <= 0) return { payoutNow: 0, maxDailyPayout: 0, allowedPayoutSoFar: 0 };
  const maxDailyPayout = Math.round((capital * (levelPercent / 100)) * 100) / 100;
  const currentProfitPercent = (todayProfit / capital) * 100;
  const allowedPayoutSoFar = maxDailyPayout * Math.min(1, currentProfitPercent / TARGET_PROFIT_PERCENT);
  let payoutNow = Math.round((allowedPayoutSoFar - alreadyPaidToday) * 100) / 100;
  const dailyCapRemaining = Math.round((maxDailyPayout - alreadyPaidToday) * 100) / 100;
  if (payoutNow > dailyCapRemaining) payoutNow = dailyCapRemaining;
  if (payoutNow < 0.001) payoutNow = 0;
  return { payoutNow, maxDailyPayout, allowedPayoutSoFar, currentProfitPercent };
}

function runFormulaTests() {
  console.log('--- 1. Formula unit tests (no DB) ---\n');

  let passed = 0;
  let failed = 0;

  // Example from spec: capital 1000, target 0.8%, L1 0.25%, current profit 0.2%
  const r1 = computePayoutNow(1000, 2, 0.25, 0);
  const expect1 = 0.625; // 2.50 * (0.2/0.8)
  if (Math.abs(r1.payoutNow - expect1) < 0.01 && Math.abs(r1.maxDailyPayout - 2.5) < 0.01) {
    console.log('  OK: capital=1000, todayProfit=2 (0.2%), L1, alreadyPaid=0 → payoutNow=0.625, maxDaily=2.50');
    passed++;
  } else {
    console.log('  FAIL: expected payoutNow≈0.625, maxDaily=2.50; got', r1);
    failed++;
  }

  // Same, current profit 0.5%
  const r2 = computePayoutNow(1000, 5, 0.25, 0);
  const expect2 = 1.5625; // 2.50 * (0.5/0.8)
  if (Math.abs(r2.payoutNow - expect2) < 0.01) {
    console.log('  OK: capital=1000, todayProfit=5 (0.5%), L1 → payoutNow≈1.56');
    passed++;
  } else {
    console.log('  FAIL: expected payoutNow≈1.56; got', r2.payoutNow);
    failed++;
  }

  // Withdrawal: capital 600, L1 daily cap = 1.50
  const r3 = computePayoutNow(600, 1.2, 0.25, 0); // 0.2% of 600
  if (Math.abs(r3.maxDailyPayout - 1.5) < 0.01) {
    console.log('  OK: capital=600 → maxDailyPayout=1.50');
    passed++;
  } else {
    console.log('  FAIL: expected maxDailyPayout=1.50; got', r3.maxDailyPayout);
    failed++;
  }

  // alreadyPaidToday reduces payout
  const r4 = computePayoutNow(1000, 5, 0.25, 1);
  if (r4.payoutNow <= 0.57 && r4.payoutNow >= 0.5) {
    console.log('  OK: alreadyPaidToday=1 → payoutNow reduced');
    passed++;
  } else {
    console.log('  FAIL: expected reduced payout; got', r4.payoutNow);
    failed++;
  }

  // No profit → no payout
  const r5 = computePayoutNow(1000, 0, 0.25, 0);
  if (r5.payoutNow === 0) {
    console.log('  OK: todayCreditedProfit=0 → payoutNow=0');
    passed++;
  } else {
    console.log('  FAIL: expected 0; got', r5.payoutNow);
    failed++;
  }

  console.log(`\n  Formula: ${passed} passed, ${failed} failed.\n`);
  return { passed, failed };
}

// ---------- 2. DB integration tests ----------
async function runDbTests() {
  console.log('--- 2. DB integration tests ---\n');

  let passed = 0;
  let failed = 0;

  try {
    const ibRepo = (await import('../modules/ib/ib.repository.js')).default;

    // 2a. Daily credited profit: increment and get (use a test key to avoid polluting real data)
    const testInvestorId = 'test-pamm-investor-' + Date.now();
    const added = 10.5;
    const totalAfter = await ibRepo.incrementPammInvestorDailyCreditedProfit(testInvestorId, added);
    if (totalAfter >= added) {
      console.log('  OK: incrementPammInvestorDailyCreditedProfit + get (total after:', totalAfter, ')');
      passed++;
    } else {
      console.log('  FAIL: increment returned', totalAfter);
      failed++;
    }
    const readBack = await ibRepo.getPammInvestorDailyCreditedProfit(testInvestorId);
    if (readBack >= added) {
      console.log('  OK: getPammInvestorDailyCreditedProfit returns', readBack);
      passed++;
    } else {
      console.log('  FAIL: get returned', readBack);
      failed++;
    }

    // 2b. getPammIbCommissionPaidToday (no logs for test investor/ib → 0)
    const paid = await ibRepo.getPammIbCommissionPaidToday(testInvestorId, 'test-ib-id');
    if (paid === 0) {
      console.log('  OK: getPammIbCommissionPaidToday (no logs) = 0');
      passed++;
    } else {
      console.log('  FAIL: expected 0, got', paid);
      failed++;
    }

    // 2c. PAMM IB settings
    const settings = await ibRepo.getPammIbCommissionSettings();
    const levels = settings?.levels || {};
    if (levels[1] && levels[2] && levels[3]) {
      console.log('  OK: getPammIbCommissionSettings has levels 1–3');
      passed++;
    } else {
      console.log('  FAIL: missing levels', levels);
      failed++;
    }
  } catch (e) {
    console.log('  FAIL: DB tests error', e.message);
    failed += 3;
  }

  console.log(`\n  DB: ${passed} passed, ${failed} failed.\n`);
  return { passed, failed };
}

// ---------- 3. Optional full-flow (--live) ----------
async function runLiveFlow() {
  const investorId = process.env.TEST_INVESTOR_ID;
  const fundId = process.env.TEST_FUND_ID || 'test-fund-id';
  const positionId = process.env.TEST_POSITION_ID || 'test-position-' + Date.now();
  const activeCapital = Number(process.env.TEST_ACTIVE_CAPITAL) || 1000;
  const todayCreditedProfit = Number(process.env.TEST_TODAY_CREDITED_PROFIT) || 2;

  if (!investorId) {
    console.log('--- 3. Full-flow (skipped) ---');
    console.log('  TEST_INVESTOR_ID not set in process.env.');
    console.log('  In PowerShell use: $env:TEST_INVESTOR_ID="69a02aa64655692fb6ae960f"; $env:TEST_ACTIVE_CAPITAL="1000"; $env:TEST_TODAY_CREDITED_PROFIT="2"; node scripts/test-pamm-bullrun-ib-commission.js --live');
    console.log('  In CMD use: set TEST_INVESTOR_ID=69a02aa64655692fb6ae960f && set TEST_ACTIVE_CAPITAL=1000 && node scripts/test-pamm-bullrun-ib-commission.js --live\n');
    return;
  }

  console.log('--- 3. Full-flow (live) ---\n');
  console.log('  investorId:', investorId);
  console.log('  activeCapital:', activeCapital);
  console.log('  todayCreditedProfit:', todayCreditedProfit);
  console.log('  fundId:', fundId);
  console.log('  positionId:', positionId);

  try {
    const ibRepo = (await import('../modules/ib/ib.repository.js')).default;
    const chain = await ibRepo.getUplineChainForClient(investorId);
    if (!chain.length) {
      console.log('  SKIP: No IB chain for this investor (referrerId + IB profile required).');
      return;
    }
    console.log('  IB chain length:', chain.length);

    const { processPammIbCommissionOnTradeClose } = await import('../modules/ib/pamm-ib-commission.service.js');
    await processPammIbCommissionOnTradeClose(investorId, activeCapital, fundId, positionId, todayCreditedProfit);
    console.log('  OK: processPammIbCommissionOnTradeClose completed.');

    const { getDb } = await import('../config/mongo.js');
    const col = (await getDb()).collection('pamm_ib_commission_logs');
    const logs = await col.find({ trade_id: positionId }).sort({ created_at: -1 }).toArray();
    console.log('  --- Verify in DB ---');
    if (logs.length === 0) {
      console.log('  WARN: No pamm_ib_commission_logs entry for trade_id', positionId);
    } else {
      console.log('  Found', logs.length, 'log(s) for this trade:');
      logs.forEach((l, i) => {
        console.log('    ', i + 1, '| ib_id:', l.ib_id, '| amount:', l.commission_amount, '| level:', l.level_number, '| created_at:', l.created_at);
      });
    }
  } catch (e) {
    console.log('  FAIL:', e.message);
  }
  console.log('');
}

// ---------- Main ----------
async function main() {
  console.log('PAMM Bull Run IB Commission — test script\n');

  const formula = runFormulaTests();
  const db = await runDbTests();
  const live = process.argv.includes('--live');
  if (live) await runLiveFlow();
  else console.log('--- 3. Full-flow ---\n  Run with --live to execute processPammIbCommissionOnTradeClose (set TEST_* env).\n');

  const totalPassed = formula.passed + db.passed;
  const totalFailed = formula.failed + db.failed;
  console.log('--- Summary ---');
  console.log('  Total passed:', totalPassed);
  console.log('  Total failed:', totalFailed);
  process.exit(totalFailed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
