/**
 * Backfill PAMM allocation realizedPnl from historic ledger entries (referenceType 'pamm_dist').
 * Sets each allocation's realizedPnl to the sum of that investor's distributions for that fund.
 * Optionally backfills pammFundId on ledger entries that are missing it.
 *
 * Run from backend: node scripts/backfill-pamm-allocation-realized-pnl.js
 * Dry run (no writes): DRY_RUN=1 node scripts/backfill-pamm-allocation-realized-pnl.js
 */
import 'dotenv/config';
import { getDb } from '../config/mongo.js';
import pammRepo from '../modules/pamm/pamm.repository.js';

const LEDGER_COLLECTION = 'ledger_entries';
const WALLET_ACCOUNT = '2110';

async function run() {
  const dryRun = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';
  if (dryRun) console.log('--- DRY RUN (no updates will be written) ---\n');

  const db = await getDb();
  const ledgerCol = db.collection(LEDGER_COLLECTION);

  // Investor-side distribution entries only (WALLET account, one per distribution)
  const entries = await ledgerCol
    .find({ referenceType: 'pamm_dist', accountCode: WALLET_ACCOUNT, entityId: { $ne: 'system' } })
    .toArray();

  if (entries.length === 0) {
    console.log('No PAMM distribution (investor) entries found. Nothing to backfill.');
    return;
  }

  // Resolve fundId for entries missing pammFundId (positionId -> fundId from manager_trades)
  const positionToFund = {};
  for (const e of entries) {
    const refId = e.referenceId;
    if (refId && !positionToFund[refId]) {
      positionToFund[refId] = await pammRepo.getFundIdByPositionId(refId);
    }
  }

  // Aggregate (followerId, fundId) -> total net amount (credit - debit)
  const byFollowerAndFund = {};
  for (const e of entries) {
    const followerId = e.entityId;
    const fundId = e.pammFundId || positionToFund[e.referenceId] || null;
    if (!followerId) continue;
    const key = fundId ? `${followerId}:${fundId}` : `unknown:${followerId}`;
    const amt = (e.credit || 0) - (e.debit || 0);
    if (!byFollowerAndFund[key]) byFollowerAndFund[key] = { followerId, fundId, total: 0 };
    byFollowerAndFund[key].total += amt;
  }

  const toUpdate = Object.values(byFollowerAndFund).filter((x) => x.fundId && x.total !== 0);
  console.log('Historic PAMM profit allocations backfill\n');
  console.log('Ledger pamm_dist (investor) entries:', entries.length);
  console.log('Unique (followerId, fundId) with non-zero total:', toUpdate.length);

  let updated = 0;
  let skipped = 0;
  for (const { followerId, fundId, total } of toUpdate) {
    const allocations = await pammRepo.listAllocationsByFollower(followerId, { limit: 100 });
    const alloc = allocations.find((a) => a.managerId === fundId);
    if (!alloc) {
      console.log(`  Skip: no allocation for follower ${followerId} in fund ${fundId} (total ${total.toFixed(2)} USD)`);
      skipped++;
      continue;
    }
    const prev = alloc.realizedPnl != null ? Number(alloc.realizedPnl) : 0;
    if (!dryRun) {
      await pammRepo.updateAllocation(alloc.id, { realizedPnl: Math.round(total * 100) / 100 });
    }
    console.log(`  ${alloc.id} | follower ${followerId} | fund ${fundId} | realizedPnl ${prev.toFixed(2)} -> ${total.toFixed(2)} USD`);
    updated++;
  }

  console.log('\nAllocations updated:', updated);
  if (skipped) console.log('Skipped (no matching allocation):', skipped);

  // Optionally backfill pammFundId on ledger entries that are missing it
  const missingFund = entries.filter((e) => !e.pammFundId && e.referenceId && positionToFund[e.referenceId]);
  if (missingFund.length > 0 && !dryRun) {
    let backfilled = 0;
    for (const e of missingFund) {
      const fundId = positionToFund[e.referenceId];
      if (!fundId) continue;
      await ledgerCol.updateOne({ _id: e._id }, { $set: { pammFundId: fundId } });
      backfilled++;
    }
    console.log('Ledger entries backfilled with pammFundId:', backfilled);
  } else if (missingFund.length > 0 && dryRun) {
    console.log('Ledger entries that would get pammFundId backfilled:', missingFund.length);
  }
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
