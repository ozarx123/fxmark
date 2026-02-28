/**
 * Check historic PAMM profit allocations (ledger entries with referenceType 'pamm_dist').
 * Run from backend: node scripts/check-historic-pamm-profit-allocations.js
 */
import 'dotenv/config';
import { getDb } from '../config/mongo.js';

const LEDGER_COLLECTION = 'ledger_entries';

async function run() {
  const db = await getDb();
  const col = db.collection(LEDGER_COLLECTION);

  const dist = await col.find({ referenceType: 'pamm_dist' }).sort({ createdAt: -1 }).toArray();
  const total = dist.length;

  console.log('=== Historic PAMM profit allocations (pamm_dist) ===\n');
  console.log('Total ledger entries with referenceType pamm_dist:', total);

  if (total === 0) {
    console.log('\nNo PAMM distribution entries yet. They are created when a PAMM position is closed and P&L is distributed.');
    return;
  }

  // Group by pammFundId
  const byFund = {};
  const byEntity = {};
  for (const e of dist) {
    const fundId = e.pammFundId || '(no fund)';
    byFund[fundId] = (byFund[fundId] || 0) + 1;
    const amt = (e.credit || 0) - (e.debit || 0);
    if (e.entityId && e.entityId !== 'system') {
      byEntity[e.entityId] = (byEntity[e.entityId] || 0) + amt;
    }
  }

  console.log('\n--- By PAMM fund (entry count) ---');
  Object.entries(byFund)
    .sort((a, b) => b[1] - a[1])
    .forEach(([fundId, count]) => console.log(`  ${fundId}: ${count} entries`));

  console.log('\n--- By investor (entityId) net amount (credit - debit) ---');
  Object.entries(byEntity)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .forEach(([entityId, net]) => console.log(`  ${entityId}: ${net.toFixed(2)} USD`));

  const totalCredits = dist.reduce((s, e) => s + (e.credit || 0), 0);
  const totalDebits = dist.reduce((s, e) => s + (e.debit || 0), 0);
  console.log('\n--- Totals ---');
  console.log(`  Sum of credits: ${totalCredits.toFixed(2)} USD`);
  console.log(`  Sum of debits:  ${totalDebits.toFixed(2)} USD`);

  console.log('\n--- Latest 10 entries (sample) ---');
  dist.slice(0, 10).forEach((e) => {
    const amt = (e.credit || 0) - (e.debit || 0);
    console.log(
      `  ${e.createdAt?.toISOString?.() || e.createdAt} | ${e.accountCode} | entityId: ${e.entityId} | pammFundId: ${e.pammFundId || '-'} | refId: ${e.referenceId || '-'} | ${amt >= 0 ? '+' : ''}${amt.toFixed(2)} USD`
    );
  });
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
