/**
 * ARCHIVED — one-off. Run from backend cwd:
 *   node scripts/archive/cleanup-import-opening-balance-1200-duplicates.js
 *
 * For same referenceId but different amounts (bulk import collision), use:
 *   node scripts/migrate-bulk-import-ledger-reference-ids.js --apply
 */
import 'dotenv/config';
import { getDb, withTransaction, closeMongo } from '../../config/mongo.js';
import { ACCOUNTS } from '../../modules/finance/chart-of-accounts.js';
import { LEDGER_COLLECTION } from '../../modules/finance/ledger.model.js';

const WALLET_ACCOUNT = ACCOUNTS.WALLET;
const CASH_BANK = ACCOUNTS.CASH_BANK;
const TARGET = {
  accountCode: CASH_BANK,
  entityId: 'system',
  referenceType: 'import_opening_balance',
  referenceId: 'bulk_import',
};

const EPS = 1e-6;

function numEq(a, b) {
  return Math.abs(Number(a) - Number(b)) < EPS;
}

function normStr(v) {
  if (v == null || v === '') return '';
  return String(v);
}

function cloneFingerprint(doc) {
  return JSON.stringify({
    accountCode: normStr(doc.accountCode),
    entityId: normStr(doc.entityId),
    referenceType: normStr(doc.referenceType),
    referenceId: normStr(doc.referenceId),
    debit: Number(doc.debit) || 0,
    credit: Number(doc.credit) || 0,
    currency: normStr(doc.currency || 'USD'),
    reference: normStr(doc.reference),
    description: normStr(doc.description),
    pammFundId: normStr(doc.pammFundId),
  });
}

function amountsMatchFingerprint(a, b) {
  return (
    normStr(a.accountCode) === normStr(b.accountCode) &&
    normStr(a.entityId) === normStr(b.entityId) &&
    normStr(a.referenceType) === normStr(b.referenceType) &&
    normStr(a.referenceId) === normStr(b.referenceId) &&
    numEq(a.debit, b.debit) &&
    numEq(a.credit, b.credit) &&
    normStr(a.currency || 'USD') === normStr(b.currency || 'USD') &&
    normStr(a.reference) === normStr(b.reference) &&
    normStr(a.description) === normStr(b.description) &&
    normStr(a.pammFundId) === normStr(b.pammFundId)
  );
}

async function main() {
  const apply = process.argv.includes('--apply');
  const db = await getDb();
  const col = db.collection(LEDGER_COLLECTION);

  const filter = {
    accountCode: TARGET.accountCode,
    entityId: TARGET.entityId,
    referenceType: TARGET.referenceType,
    referenceId: TARGET.referenceId,
  };

  const docs = await col
    .find(filter)
    .sort({ createdAt: 1, _id: 1 })
    .toArray();

  for (const doc of docs) {
    if (normStr(doc.accountCode) !== CASH_BANK) {
      console.error('Unexpected accountCode on matched doc:', doc._id);
      process.exitCode = 1;
      return;
    }
    if (normStr(doc.entityId) !== TARGET.entityId) {
      console.error('Unexpected entityId on matched doc:', doc._id);
      process.exitCode = 1;
      return;
    }
    if (normStr(doc.accountCode) === WALLET_ACCOUNT) {
      console.error('Refusing: WALLET row in result set');
      process.exitCode = 1;
      return;
    }
  }

  if (docs.length <= 1) {
    console.log(
      docs.length === 0
        ? 'No rows match target filter; nothing to do.'
        : `Single row only (${docs[0]._id}); no duplicates.`
    );
    await closeMongo();
    return;
  }

  const first = docs[0];
  const fp0 = cloneFingerprint(first);
  for (let i = 1; i < docs.length; i++) {
    if (cloneFingerprint(docs[i]) !== fp0) {
      console.error('ABORT: rows are not exact clones (fingerprint mismatch).');
      console.error('First _id:', first._id.toString());
      console.error('Mismatch _id:', docs[i]._id.toString());
      console.error('First fingerprint JSON:', fp0);
      console.error('Other fingerprint JSON:', cloneFingerprint(docs[i]));
      process.exitCode = 1;
      await closeMongo();
      return;
    }
    if (!amountsMatchFingerprint(first, docs[i])) {
      console.error('ABORT: amount/field mismatch.');
      process.exitCode = 1;
      await closeMongo();
      return;
    }
  }

  const keptId = first._id;
  const toDelete = docs.slice(1).map((d) => d._id);

  console.log('Target filter:', JSON.stringify(filter));
  console.log('Total matching rows:', docs.length);
  console.log('KEPT _id (oldest):', keptId.toString());
  console.log('DELETE _ids:', toDelete.map((id) => id.toString()).join(', '));
  console.log('Count to remove:', toDelete.length);

  if (!apply) {
    console.log('\nDry-run only. Re-run with --apply to delete duplicates in a transaction.');
    await closeMongo();
    return;
  }

  await withTransaction(async (session) => {
    const verify = await col
      .find(filter, { session })
      .sort({ createdAt: 1, _id: 1 })
      .toArray();

    if (verify.length !== docs.length) {
      throw new Error(`Concurrent change: expected ${docs.length} docs, found ${verify.length}`);
    }
    for (let i = 0; i < verify.length; i++) {
      if (verify[i]._id.toString() !== docs[i]._id.toString()) {
        throw new Error('Order or identity changed during transaction; abort.');
      }
    }
    const v0 = verify[0];
    const vfp = cloneFingerprint(v0);
    for (let i = 1; i < verify.length; i++) {
      if (cloneFingerprint(verify[i]) !== vfp) {
        throw new Error('Clone validation failed inside transaction; abort.');
      }
    }

    const delRes = await col.deleteMany(
      { _id: { $in: toDelete }, accountCode: CASH_BANK, entityId: TARGET.entityId },
      { session }
    );
    if (delRes.deletedCount !== toDelete.length) {
      throw new Error(`Expected to delete ${toDelete.length}, deleted ${delRes.deletedCount}`);
    }
  });

  console.log('\nDone. Deleted', toDelete.length, 'duplicate row(s). Kept:', keptId.toString());
  await closeMongo();
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
  return closeMongo();
});
