/**
 * Safe repair for wallet vs ledger mismatches (duplicate ledger entries).
 * Run from backend: node scripts/repair-wallet-ledger-mismatch.js [options]
 *
 * Default: --dry-run (report only, no writes).
 * --apply: update wallets.balance and updatedAt to corrected balance (no ledger/tx deletes).
 * --user=<userId>: restrict to one user (e.g. focus case 69b7fb805ad28a8befc6c061).
 * --export=<path>: write report JSON to file.
 *
 * Does NOT delete any ledger or transaction rows.
 */
import 'dotenv/config';
import { getDb } from '../config/mongo.js';
import { ObjectId } from 'mongodb';
import ledgerRepo from '../modules/finance/ledger.repository.js';
import { ACCOUNTS } from '../modules/finance/chart-of-accounts.js';
import fs from 'fs';

const WALLET_ACCOUNT = ACCOUNTS.WALLET;
const TOLERANCE = 0.005;

function round2(x) {
  return Math.round((Number(x) || 0) * 100) / 100;
}

function isMismatch(walletBal, ledgerBal) {
  return Math.abs(round2(walletBal) - round2(ledgerBal)) > TOLERANCE;
}

/** Same business key as unique index: accountCode, entityId, referenceType, referenceId */
function businessKey(entry) {
  const entityId = entry.entityId != null ? String(entry.entityId) : '';
  return `${entry.accountCode}:${entityId}:${entry.referenceType || ''}:${entry.referenceId || ''}`;
}

function netEntry(entry) {
  return (entry.credit || 0) - (entry.debit || 0);
}

async function findMismatchUsers(userFilter = null) {
  const db = await getDb();
  const walletsCol = db.collection('wallets');
  let cursor = walletsCol.find({}, { projection: { userId: 1, currency: 1, balance: 1 } });
  if (userFilter) {
    const uid = String(userFilter);
    cursor = walletsCol.find({ userId: uid }, { projection: { userId: 1, currency: 1, balance: 1 } });
  }
  const wallets = await cursor.toArray();
  const mismatches = [];
  for (const w of wallets) {
    const userId = w.userId != null ? String(w.userId) : '';
    const walletBalance = round2(w.balance ?? 0);
    const ledgerBalance = round2(await ledgerRepo.getBalance(userId, WALLET_ACCOUNT));
    if (isMismatch(walletBalance, ledgerBalance)) {
      mismatches.push({
        userId,
        walletBalance,
        ledgerBalance,
        currency: w.currency || 'USD',
      });
    }
  }
  return mismatches;
}

async function getWalletEntriesForUser(userId) {
  const db = await getDb();
  const col = db.collection('ledger_entries');
  const idStr = String(userId);
  const conditions = [{ entityId: idStr }];
  if (idStr.length === 24 && ObjectId.isValid(idStr)) conditions.push({ entityId: new ObjectId(idStr) });
  const list = await col.find({ $or: conditions, accountCode: WALLET_ACCOUNT }).sort({ createdAt: 1 }).toArray();
  return list.map((e) => ({
    id: e._id.toString(),
    entityId: e.entityId,
    accountCode: e.accountCode,
    referenceType: e.referenceType,
    referenceId: e.referenceId,
    credit: e.credit || 0,
    debit: e.debit || 0,
    pammFundId: e.pammFundId,
  }));
}

function computeCorrectedBalanceAndDuplicates(entries) {
  const byKey = {};
  for (const e of entries) {
    const key = businessKey(e);
    if (!byKey[key]) byKey[key] = [];
    byKey[key].push(e);
  }
  let correctedBalance = 0;
  const duplicateGroups = [];
  for (const arr of Object.values(byKey)) {
    const net = netEntry(arr[0]);
    correctedBalance += net;
    if (arr.length > 1) {
      const excess = (arr.length - 1) * net;
      duplicateGroups.push({
        key: businessKey(arr[0]),
        referenceType: arr[0].referenceType,
        referenceId: arr[0].referenceId,
        count: arr.length,
        netPerEntry: net,
        excessAmount: round2(excess),
        entryIds: arr.map((x) => x.id),
      });
    }
  }
  const rawBalance = entries.reduce((s, e) => s + netEntry(e), 0);
  const totalExcess = duplicateGroups.reduce((s, g) => s + g.excessAmount, 0);
  return {
    rawBalance: round2(rawBalance),
    correctedBalance: round2(correctedBalance),
    totalExcess: round2(totalExcess),
    duplicateGroups,
  };
}

function parseArgs() {
  const args = process.argv.slice(2);
  let dryRun = true;
  let userFilter = null;
  let exportPath = null;
  for (const a of args) {
    if (a === '--apply') dryRun = false;
    if (a.startsWith('--user=')) userFilter = a.slice(7).trim() || null;
    if (a.startsWith('--export=')) exportPath = a.slice(9).trim() || null;
  }
  return { dryRun, userFilter, exportPath };
}

async function run() {
  const { dryRun, userFilter, exportPath } = parseArgs();
  console.log('=== WALLET-LEDGER REPAIR (', dryRun ? 'DRY-RUN' : 'APPLY', ') ===\n');
  if (userFilter) console.log('User filter:', userFilter, '\n');

  const mismatches = await findMismatchUsers(userFilter);
  if (mismatches.length === 0) {
    console.log('No mismatched users found.');
    if (exportPath) fs.writeFileSync(exportPath, JSON.stringify({ mismatches: [], applied: false }, null, 2));
    process.exit(0);
  }

  const report = { dryRun, mismatches: [], applied: false };

  for (const m of mismatches) {
    const entries = await getWalletEntriesForUser(m.userId);
    const { rawBalance, correctedBalance, totalExcess, duplicateGroups } = computeCorrectedBalanceAndDuplicates(entries);
    const row = {
      userId: m.userId,
      currency: m.currency,
      walletBalance: m.walletBalance,
      rawLedgerBalance: rawBalance,
      correctedLedgerBalance: correctedBalance,
      duplicateAdjustmentAmount: totalExcess,
      duplicateGroups: duplicateGroups.map((g) => ({
        referenceType: g.referenceType,
        referenceId: g.referenceId,
        count: g.count,
        excessAmount: g.excessAmount,
        entryIds: g.entryIds,
      })),
      suggestedNewWalletBalance: correctedBalance,
    };
    report.mismatches.push(row);

    console.log('--- User:', m.userId, '---');
    console.log('  Wallet balance:          ', m.walletBalance);
    console.log('  Raw ledger balance:      ', rawBalance);
    console.log('  Corrected ledger balance:', correctedBalance);
    console.log('  Duplicate adjustment:    ', totalExcess);
    console.log('  Suggested wallet balance:', correctedBalance);
    if (duplicateGroups.length > 0) {
      console.log('  Duplicate groups:');
      for (const g of duplicateGroups) {
        console.log('    ', g.referenceType, g.referenceId, 'count=', g.count, 'excess=', g.excessAmount, 'ids=', g.entryIds.join(', '));
      }
    }
    console.log('');
  }

  if (exportPath) {
    fs.writeFileSync(exportPath, JSON.stringify(report, null, 2));
    console.log('Report written to', exportPath);
  }

  if (!dryRun) {
    const db = await getDb();
    const walletsCol = db.collection('wallets');
    for (const row of report.mismatches) {
      await walletsCol.updateOne(
        { userId: row.userId, currency: row.currency },
        { $set: { balance: row.suggestedNewWalletBalance, updatedAt: new Date() } }
      );
      console.log('Updated wallet', row.userId, row.currency, 'balance ->', row.suggestedNewWalletBalance);
    }
    report.applied = true;
    if (exportPath) fs.writeFileSync(exportPath, JSON.stringify(report, null, 2));
    console.log('\nDone. Wallet balances updated. No ledger or transaction rows were deleted.');
  } else {
    console.log('No changes made (dry-run). Use --apply to update wallet balances.');
  }
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
