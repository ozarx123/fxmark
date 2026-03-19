/**
 * Report duplicate WALLET ledger entries and optionally create the unique index.
 * Run from backend: node scripts/ensure-wallet-ledger-unique-index.js [--create]
 *
 * Without --create: only reports duplicate groups (no index creation).
 * With --create: creates partial unique index wallet_event_unique on WALLET (2110) rows only
 * if no duplicate WALLET business keys exist; otherwise exits with report.
 * Does NOT delete any ledger rows.
 */
import 'dotenv/config';
import { getDb } from '../config/mongo.js';
import { ObjectId } from 'mongodb';
import { ACCOUNTS } from '../modules/finance/chart-of-accounts.js';
import { LEDGER_COLLECTION, WALLET_LEDGER_UNIQUE_INDEX } from '../modules/finance/ledger.model.js';

const WALLET_ACCOUNT = ACCOUNTS.WALLET;

/** Same key as WALLET_LEDGER_UNIQUE_INDEX: accountCode, entityId, referenceType, referenceId */
function businessKey(entry) {
  const entityId = entry.entityId != null ? String(entry.entityId) : '';
  return `${entry.accountCode}:${entityId}:${entry.referenceType || ''}:${entry.referenceId || ''}`;
}

async function findDuplicateWalletGroups() {
  const db = await getDb();
  const col = db.collection(LEDGER_COLLECTION);
  const cursor = col.find({ accountCode: WALLET_ACCOUNT });
  const byKey = {};
  let count = 0;
  while (await cursor.hasNext()) {
    const doc = await cursor.next();
    count++;
    const key = businessKey(doc);
    if (!byKey[key]) byKey[key] = [];
    byKey[key].push({
      id: doc._id.toString(),
      entityId: doc.entityId,
      referenceType: doc.referenceType,
      referenceId: doc.referenceId,
      credit: doc.credit,
      debit: doc.debit,
      pammFundId: doc.pammFundId,
      createdAt: doc.createdAt,
    });
  }
  const duplicateGroups = Object.entries(byKey)
    .filter(([, arr]) => arr.length > 1)
    .map(([key, entries]) => ({ key, count: entries.length, entries }));
  return { totalWalletEntries: count, duplicateGroups };
}

async function run() {
  const shouldCreate = process.argv.includes('--create');
  console.log('=== WALLET ledger unique index (duplicate report / conditional create) ===\n');

  const { totalWalletEntries, duplicateGroups } = await findDuplicateWalletGroups();
  console.log('Total WALLET (accountCode=', WALLET_ACCOUNT, ') ledger entries:', totalWalletEntries);
  console.log('Duplicate business-key groups:', duplicateGroups.length);

  if (duplicateGroups.length > 0) {
    console.log('\n--- Conflicting rows (duplicate groups) ---');
    for (const g of duplicateGroups) {
      console.log('  Key:', g.key, '| Count:', g.count, '| Entry ids:', g.entries.map((e) => e.id).join(', '));
    }
    console.log('\nIndex creation is BLOCKED while duplicates exist.');
    console.log('Do NOT delete ledger rows without a formal process.');
    console.log('Option 1: Run repair script (--dry-run then --apply) to correct wallet balances; duplicate ledger rows remain; then resolve duplicates manually (e.g. mark or remove extras) before re-running with --create.');
    console.log('Option 2: Leave index uncreated and rely on application-level idempotency.');
    process.exit(1);
  }

  if (!shouldCreate) {
    console.log('\nNo duplicates found. To create the unique index, run with --create');
    process.exit(0);
  }

  const db = await getDb();
  const col = db.collection(LEDGER_COLLECTION);
  try {
    await col.createIndex(WALLET_LEDGER_UNIQUE_INDEX.keys, WALLET_LEDGER_UNIQUE_INDEX.options);
    console.log('\nIndex created:', WALLET_LEDGER_UNIQUE_INDEX.options.name);
  } catch (e) {
    console.error('Index creation failed:', e.message);
    process.exit(1);
  }
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
