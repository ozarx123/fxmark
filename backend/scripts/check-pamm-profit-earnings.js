/**
 * Check whether any PAMM allocations have profit/earnings (realizedPnl) data.
 * Run from backend: node scripts/check-pamm-profit-earnings.js
 */
import 'dotenv/config';
import { getDb } from '../config/mongo.js';

const ALLOCATIONS_COLLECTION = 'pamm_allocations';

async function run() {
  const db = await getDb();
  const col = db.collection(ALLOCATIONS_COLLECTION);

  const all = await col.find({}).toArray();
  const total = all.length;

  const withField = all.filter((a) => a.realizedPnl != null);
  const withNonZero = all.filter((a) => a.realizedPnl != null && Number(a.realizedPnl) !== 0);

  console.log('=== PAMM profit/earnings (realizedPnl) check ===\n');
  console.log('Total allocations:', total);
  console.log('Allocations with realizedPnl field:', withField.length);
  console.log('Allocations with realizedPnl !== 0:', withNonZero.length);

  if (withNonZero.length > 0) {
    console.log('\n--- Allocations with non-zero profit/earnings ---');
    withNonZero.forEach((a) => {
      console.log(
        `  id: ${a._id}, followerId: ${a.followerId}, managerId: ${a.managerId}, allocatedBalance: ${a.allocatedBalance}, realizedPnl: ${a.realizedPnl}, status: ${a.status}`
      );
    });
  } else {
    console.log('\nNo allocations currently have non-zero profit/earnings.');
    console.log('Profit/earnings are updated when a PAMM trade is closed and P&L is distributed.');
  }

  if (total > 0 && withField.length < total) {
    console.log(`\nNote: ${total - withField.length} allocation(s) have no realizedPnl field (will show as 0 in API).`);
  }
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
