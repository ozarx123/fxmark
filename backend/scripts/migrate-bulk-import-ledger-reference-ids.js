/**
 * Fix ledger unique-key collision for bulk import opening balance.
 *
 * Historical bug: every imported user used referenceId "bulk_import" on BOTH legs, so
 * (1200, system, import_opening_balance, bulk_import) repeated — not true duplicates,
 * different amounts. Deleting extras would break double-entry.
 *
 * This script pairs each Cash/Bank (1200) line with its WALLET credit (same amount),
 * then sets referenceId to bulk_import:<userId> on BOTH rows in one transaction.
 * Amounts and balances are unchanged (only referenceId updates).
 *
 * Run from backend:
 *   node scripts/migrate-bulk-import-ledger-reference-ids.js
 *   node scripts/migrate-bulk-import-ledger-reference-ids.js --apply
 */
import 'dotenv/config';
import { getDb, withTransaction, closeMongo } from '../config/mongo.js';
import { ACCOUNTS } from '../modules/finance/chart-of-accounts.js';
import { LEDGER_COLLECTION } from '../modules/finance/ledger.model.js';

const OLD_REF = 'bulk_import';
const EPS = 1e-6;

function numEq(a, b) {
  return Math.abs(Number(a) - Number(b)) < EPS;
}

function ms(d) {
  return d instanceof Date ? d.getTime() : new Date(d).getTime();
}

async function main() {
  const apply = process.argv.includes('--apply');
  const db = await getDb();
  const col = db.collection(LEDGER_COLLECTION);

  const base1200 = {
    accountCode: ACCOUNTS.CASH_BANK,
    entityId: 'system',
    referenceType: 'import_opening_balance',
    referenceId: OLD_REF,
  };
  const baseWallet = {
    accountCode: ACCOUNTS.WALLET,
    referenceType: 'import_opening_balance',
    referenceId: OLD_REF,
  };

  const rows1200 = await col.find(base1200).sort({ createdAt: 1, _id: 1 }).toArray();
  const rowsWallet = await col.find(baseWallet).sort({ createdAt: 1, _id: 1 }).toArray();

  if (rows1200.length === 0) {
    console.log('No legacy bulk_import ledger rows found; nothing to migrate.');
    await closeMongo();
    return;
  }

  if (rows1200.length !== rowsWallet.length) {
    console.error(
      `ABORT: count mismatch — 1200 rows ${rows1200.length}, WALLET rows ${rowsWallet.length}. Manual review required.`
    );
    process.exitCode = 1;
    await closeMongo();
    return;
  }

  const used = new Set();
  const pairs = [];

  for (const r of rows1200) {
    const candidates = rowsWallet.filter((w) => !used.has(w._id.toString()) && numEq(w.credit, r.debit));
    if (candidates.length === 0) {
      console.error('ABORT: no WALLET match for 1200 row', r._id.toString(), 'debit', r.debit);
      process.exitCode = 1;
      await closeMongo();
      return;
    }
    let pick;
    if (candidates.length === 1) {
      pick = candidates[0];
    } else {
      const rt = ms(r.createdAt);
      candidates.sort((a, b) => {
        const da = Math.abs(ms(a.createdAt) - rt);
        const db_ = Math.abs(ms(b.createdAt) - rt);
        if (da !== db_) return da - db_;
        return String(a._id).localeCompare(String(b._id));
      });
      pick = candidates[0];
      const d0 = Math.abs(ms(pick.createdAt) - rt);
      if (candidates.length > 1 && Math.abs(ms(candidates[1].createdAt) - rt) === d0) {
        console.error(
          'ABORT: ambiguous WALLET pairing for 1200',
          r._id.toString(),
          '(tie on createdAt proximity)'
        );
        process.exitCode = 1;
        await closeMongo();
        return;
      }
    }
    used.add(pick._id.toString());
    const uid = String(pick.entityId);
    const newRef = `${OLD_REF}:${uid}`;
    pairs.push({ r, w: pick, newRef, uid });
  }

  if (used.size !== rowsWallet.length) {
    console.error('ABORT: not all WALLET rows paired.');
    process.exitCode = 1;
    await closeMongo();
    return;
  }

  for (const { r, w, newRef } of pairs) {
    const clash = await col.findOne({
      $or: [
        {
          accountCode: ACCOUNTS.CASH_BANK,
          entityId: 'system',
          referenceType: 'import_opening_balance',
          referenceId: newRef,
          _id: { $ne: r._id },
        },
        {
          accountCode: ACCOUNTS.WALLET,
          entityId: w.entityId,
          referenceType: 'import_opening_balance',
          referenceId: newRef,
          _id: { $ne: w._id },
        },
      ],
    });
    if (clash) {
      console.error('ABORT: target referenceId already exists:', newRef, 'clash _id', clash._id.toString());
      process.exitCode = 1;
      await closeMongo();
      return;
    }
  }

  console.log('Pairs to migrate:', pairs.length);
  for (const { r, w, newRef, uid } of pairs) {
    console.log(
      `  user ${uid}: 1200 ${r._id} debit=${r.debit}  <->  WALLET ${w._id} credit=${w.credit}  => ref "${newRef}"`
    );
  }

  if (!apply) {
    console.log('\nDry-run. Re-run with --apply to update referenceId on both legs in a transaction.');
    await closeMongo();
    return;
  }

  await withTransaction(async (session) => {
    for (const { r, w, newRef } of pairs) {
      const rNow = await col.findOne({ _id: r._id }, { session });
      const wNow = await col.findOne({ _id: w._id }, { session });
      if (!rNow || rNow.referenceId !== OLD_REF || !wNow || wNow.referenceId !== OLD_REF) {
        throw new Error('Row changed or already migrated; abort.');
      }
      if (!numEq(rNow.debit, wNow.credit)) {
        throw new Error(`Amount mismatch ${r._id} / ${w._id}; abort.`);
      }
      const ur = await col.updateOne(
        { _id: r._id, referenceId: OLD_REF, accountCode: ACCOUNTS.CASH_BANK, entityId: 'system' },
        { $set: { referenceId: newRef } },
        { session }
      );
      const uw = await col.updateOne(
        {
          _id: w._id,
          referenceId: OLD_REF,
          accountCode: ACCOUNTS.WALLET,
          entityId: w.entityId,
        },
        { $set: { referenceId: newRef } },
        { session }
      );
      if (ur.modifiedCount !== 1 || uw.modifiedCount !== 1) {
        throw new Error(`Update failed for pair ${r._id} / ${w._id}`);
      }
    }
  });

  console.log('\nMigration complete. Updated', pairs.length, 'pairs (', pairs.length * 2, 'ledger rows).');
  await closeMongo();
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
  return closeMongo();
});
