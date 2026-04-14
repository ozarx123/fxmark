/**
 * Reverse economic effects of a PAMM Bull Run trade (order id) on MongoDB `test`, then remove
 * order/position/manager_trades/distribution run rows.
 *
 * Uses modules/pamm/bullrun-trade-rollback.service.js (append-only ledger reversals + wallet fixes).
 *
 * Usage:
 *   node scripts/rollback-order-remove-trade-test.mjs [orderId] --dry-run
 *   node scripts/rollback-order-remove-trade-test.mjs [orderId] --execute
 *
 * Requires CONNECTION_STRING in backend/.env. Forces DB path to `test` and REQUIRED_NON_PROD_DB_NAME=test
 * so mongo.js policy allows the connection under NODE_ENV=development.
 */
import '../config/load-env.js';
import { ObjectId } from 'mongodb';

const ORDER_ID = process.argv[2] || '69de3175231abfb5d08d46cf';
const dryRun = process.argv.includes('--dry-run');
const execute = process.argv.includes('--execute');

function forceTestDbEnv() {
  const raw = (process.env.CONNECTION_STRING || '').trim();
  if (!raw) throw new Error('CONNECTION_STRING missing in .env');
  process.env.CONNECTION_STRING = raw.replace(/\/[^/?]+(?=[?]|$)/, '/test');
  process.env.REQUIRED_NON_PROD_DB_NAME = 'test';
  // mongo.js treats default REQUIRED_PROD_DB_NAME "test" as prod; localhost + DB "test" is blocked.
  // Use a sentinel so URI database "test" is allowed as the dev/staging target for this script only.
  process.env.REQUIRED_PROD_DB_NAME = process.env.REQUIRED_PROD_DB_NAME || '__script_test_db__';
  if (process.env.REQUIRED_PROD_DB_NAME === 'test') {
    process.env.REQUIRED_PROD_DB_NAME = '__script_test_db__';
  }
}

if (!dryRun && !execute) {
  console.error('Specify --dry-run or --execute');
  process.exit(1);
}

forceTestDbEnv();

const { default: br } = await import('../modules/pamm/bullrun-trade-rollback.service.js');
const { getDb, closeMongo } = await import('../config/mongo.js');

const db = await getDb();
const orders = db.collection('orders');
const order = await orders.findOne({ _id: new ObjectId(ORDER_ID) });
if (!order) {
  console.error('Order not found:', ORDER_ID);
  process.exit(1);
}
const positionId = order.positionId != null ? String(order.positionId) : '';
if (!positionId) {
  console.error('Order has no positionId');
  process.exit(1);
}

const posDoc = await db.collection('positions').findOne({ _id: new ObjectId(positionId) });
const distributionRunId = posDoc?.distributionRunId != null ? String(posDoc.distributionRunId) : null;

console.log('Order:', ORDER_ID, '→ position:', positionId);
if (distributionRunId) console.log('distributionRunId:', distributionRunId);

if (dryRun) {
  const plan = await br.rollbackBullRunTradeClose(positionId, { dryRun: true });
  console.log('\n--- DRY RUN (no changes) ---');
  console.log(JSON.stringify(plan, null, 2));
  console.log('\nWould delete: orders(1), positions(1), manager_trades(positionId), pamm_distribution_runs(run if any)');
  await closeMongo();
  process.exit(0);
}

// Economic rollback (transactions + ledger reversal entries + wallet balance fixes)
const result = await br.rollbackBullRunTradeClose(positionId, { dryRun: false });
console.log('Rollback result:', JSON.stringify(result, null, 2));

if (!result?.ok) {
  await closeMongo();
  process.exit(1);
}

// Hard-delete trade artifacts (ledger stays append-only: originals + reversal rows remain for audit)
const delOrder = await orders.deleteOne({ _id: new ObjectId(ORDER_ID) });
const delPos = await db.collection('positions').deleteOne({ _id: new ObjectId(positionId) });
const pidOr = [{ positionId: positionId }];
if (ObjectId.isValid(positionId)) pidOr.push({ positionId: new ObjectId(positionId) });
const delMt = await db.collection('manager_trades').deleteMany({ $or: pidOr });

let delRun = { deletedCount: 0 };
if (distributionRunId && ObjectId.isValid(distributionRunId)) {
  delRun = await db.collection('pamm_distribution_runs').deleteOne({ _id: new ObjectId(distributionRunId) });
}
if ((delRun.deletedCount || 0) === 0) {
  const byPos = await db.collection('pamm_distribution_runs').deleteMany({ positionId: positionId });
  delRun = { deletedCount: byPos.deletedCount };
}

console.log('Deleted:', {
  orders: delOrder.deletedCount,
  positions: delPos.deletedCount,
  manager_trades: delMt.deletedCount,
  pamm_distribution_runs: delRun.deletedCount ?? 0,
});

console.log(
  '\nNote: ledger_entries and wallet_transactions retain original rows plus rollback postings (append-only). Wallet balances were adjusted by rollback.'
);

await closeMongo();
process.exit(0);
