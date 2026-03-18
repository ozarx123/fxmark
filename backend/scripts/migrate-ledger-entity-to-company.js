/**
 * One-off: set ledger_entries entityId from 'SYSTEM_ACCOUNT' to 'company'.
 * The company super wallet uses entityId 'company'; this aligns existing rows.
 * Run: node scripts/migrate-ledger-entity-to-company.js
 */
import 'dotenv/config';
import { getDb } from '../config/mongo.js';
import { ENTITY_COMPANY } from '../modules/finance/chart-of-accounts.js';

const COLLECTION = 'ledger_entries';

async function main() {
  const db = await getDb();
  const col = db.collection(COLLECTION);
  const result = await col.updateMany(
    { entityId: 'SYSTEM_ACCOUNT' },
    { $set: { entityId: ENTITY_COMPANY } }
  );
  console.log(`Updated ${result.modifiedCount} ledger entry(ies) from entityId SYSTEM_ACCOUNT to ${ENTITY_COMPANY}.`);
  if (result.matchedCount === 0) {
    console.log('No ledger entries with entityId SYSTEM_ACCOUNT found.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
