/**
 * Migrate WALLET account code from 1100 (asset) to 2110 (liability).
 * Fixes reconciliation: user wallet is a liability (we owe the user), so credit-normal.
 *
 * Run from backend: node scripts/migrate-wallet-account-code.js
 */
import 'dotenv/config';
import { getDb } from '../config/mongo.js';

const LEDGER_COLLECTION = 'ledger_entries';

async function run() {
  const db = await getDb();
  const col = db.collection(LEDGER_COLLECTION);

  const result = await col.updateMany(
    { accountCode: '1100' },
    { $set: { accountCode: '2110' } }
  );

  console.log(`Migrated ${result.modifiedCount} ledger entries from 1100 to 2110`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
