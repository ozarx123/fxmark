/**
 * Check PAMM distribution vs IB commission: find recent pamm_dist (investor profit)
 * and verify whether matching IB commission exists in pamm_ib_commission_logs.
 *
 * Run from backend directory:
 *   node scripts/check-pamm-dist-vs-ib-commission.js
 * From repo root:  cd backend  then run the above (do not cd backend again if already in backend).
 */
import 'dotenv/config';
import { getDb } from '../config/mongo.js';
import ibRepo from '../modules/ib/ib.repository.js';

const LIMIT = 10;

console.log('=== PAMM dist vs IB commission check ===\n');

const db = await getDb();
const ledgerCol = db.collection('ledger_entries');
const logsCol = db.collection('pamm_ib_commission_logs');

const todayStart = new Date();
todayStart.setUTCHours(0, 0, 0, 0);
const sevenDaysAgo = new Date(todayStart.getTime() - 7 * 24 * 60 * 60 * 1000);
const thirtyDaysAgo = new Date(todayStart.getTime() - 30 * 24 * 60 * 60 * 1000);

let pammDistEntries = await ledgerCol
  .find({
    referenceType: 'pamm_dist',
    accountCode: 'WALLET',
    credit: { $gt: 0 },
    createdAt: { $gte: sevenDaysAgo },
  })
  .sort({ createdAt: -1 })
  .limit(LIMIT)
  .toArray();

if (pammDistEntries.length === 0) {
  pammDistEntries = await ledgerCol
    .find({
      referenceType: 'pamm_dist',
      accountCode: 'WALLET',
      credit: { $gt: 0 },
      createdAt: { $gte: thirtyDaysAgo },
    })
    .sort({ createdAt: -1 })
    .limit(LIMIT)
    .toArray();
}

console.log('1. Recent pamm_dist (investor wallet credit) entries:', pammDistEntries.length, pammDistEntries.length ? '(last 7d, else last 30d)' : '(last 30d)');
if (pammDistEntries.length === 0) {
  console.log('   No pamm_dist in last 30 days. Showing latest logs and settings only.\n');
}

if (pammDistEntries.length > 0) {
  for (let i = 0; i < pammDistEntries.length; i++) {
    const e = pammDistEntries[i];
    const refId = e.referenceId;
    const entityId = e.entityId;
    const amount = e.credit || 0;
    const createdAt = e.createdAt;
    console.log('\n  Entry', i + 1, '| entityId (investor):', entityId, '| amount:', amount, '| referenceId:', refId, '| at:', createdAt);
  }

  console.log('\n2. For each pamm_dist referenceId, check pamm_ib_commission_logs (same trade_id):');
  const refIds = [...new Set(pammDistEntries.map((e) => e.referenceId).filter(Boolean))];
  for (const refId of refIds) {
    const logs = await logsCol.find({ trade_id: refId }).sort({ created_at: -1 }).toArray();
    const entries = pammDistEntries.filter((e) => e.referenceId === refId);
    const investorId = entries[0]?.entityId;
    const totalDist = entries.reduce((s, e) => s + (e.credit || 0), 0);
    console.log('\n   referenceId/trade_id:', refId);
    console.log('   investor (entityId):', investorId);
    console.log('   pamm_dist total (this trade):', totalDist);
    console.log('   IB commission logs for this trade:', logs.length);
    if (logs.length === 0) {
      const chain = investorId ? await ibRepo.getUplineChainForClient(String(investorId)) : [];
      const todayProfit = investorId ? await ibRepo.getPammInvestorDailyCreditedProfit(String(investorId)) : null;
      console.log('   >>> NO IB COMMISSION LOG for this trade.');
      console.log('   IB chain length for investor:', chain.length);
      console.log('   Today credited profit (investor):', todayProfit);
      if (!chain.length) console.log('   Possible cause: investor has no referrerId or referrer is not an IB.');
    } else {
      const allZero = logs.every((l) => (l.commission_amount ?? 0) === 0);
      if (allZero) console.log('   >>> All logs for this trade have amount 0 → likely daily cap reached. Check server [pamm-ib] logs for levelDiagnostics.');
      logs.forEach((l, j) => console.log('     ', j + 1, '| ib_id:', l.ib_id, '| amount:', l.commission_amount, '| level:', l.level_number));
    }
  }
}

console.log('\n3. Latest 5 pamm_ib_commission_logs (any trade):');
const latestLogs = await logsCol.find({}).sort({ created_at: -1 }).limit(5).toArray();
latestLogs.forEach((l, i) => {
  console.log('   ', i + 1, '| trade_id:', l.trade_id, '| investor_id:', l.investor_id, '| ib_id:', l.ib_id, '| amount:', l.commission_amount, '| at:', l.created_at);
});

console.log('\n4. PAMM IB commission settings (day caps):');
const settings = await ibRepo.getPammIbCommissionSettings();
Object.entries(settings?.levels || {}).forEach(([k, v]) => {
  console.log('   Level', k, '| daily_payout_percent:', v?.daily_payout_percent, '| status:', v?.status);
});

console.log('\n=== End check ===');
