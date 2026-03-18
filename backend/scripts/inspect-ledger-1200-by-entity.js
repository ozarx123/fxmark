/**
 * Diagnostic: list account 1200 (Cash/Bank) balance per entityId.
 * Use when "Company cash / bank" (company entity only) differs from platform total 1200.
 * Run: node scripts/inspect-ledger-1200-by-entity.js
 */
import 'dotenv/config';
import { getDb } from '../config/mongo.js';
import { ENTITY_COMPANY } from '../modules/finance/chart-of-accounts.js';

const COLLECTION = 'ledger_entries';
const CASH_BANK = '1200';

async function main() {
  const db = await getDb();
  const col = db.collection(COLLECTION);
  const rows = await col
    .aggregate([
      { $match: { accountCode: CASH_BANK } },
      {
        $group: {
          _id: { $toString: '$entityId' },
          debit: { $sum: '$debit' },
          credit: { $sum: '$credit' },
          count: { $sum: 1 },
        },
      },
      { $addFields: { balance: { $subtract: ['$debit', '$credit'] } } },
      { $sort: { balance: -1 } },
    ])
    .toArray();

  let total = 0;
  console.log('Account 1200 (Cash/Bank) by entityId:\n');
  for (const r of rows) {
    const bal = Math.round(r.balance * 100) / 100;
    total += bal;
    const isCompany = r._id === ENTITY_COMPANY || r._id === 'SYSTEM_ACCOUNT';
    console.log(`  entityId: ${r._id}${isCompany ? ' (company)' : ''}  balance: ${bal}  entries: ${r.count}`);
  }
  console.log('\n  Total (all entities):', Math.round(total * 100) / 100);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
