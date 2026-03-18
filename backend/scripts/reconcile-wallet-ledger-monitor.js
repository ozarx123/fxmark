/**
 * Wallet vs Ledger reconciliation monitoring (report only, no fixes).
 * Compares wallet to raw ledger and to corrected (deduplicated) ledger.
 * Run from backend: node scripts/reconcile-wallet-ledger-monitor.js [--json]
 */
import 'dotenv/config';
import { getDb } from '../config/mongo.js';
import { ObjectId } from 'mongodb';
import ledgerRepo from '../modules/finance/ledger.repository.js';
import walletRepo from '../modules/wallet/wallet.repository.js';
import { ACCOUNTS } from '../modules/finance/chart-of-accounts.js';

const WALLET_ACCOUNT = ACCOUNTS.WALLET;
const TOLERANCE = 0.005;

function round2(x) {
  return Math.round((Number(x) || 0) * 100) / 100;
}

function isMismatch(walletBal, ledgerBal) {
  return Math.abs(round2(walletBal) - round2(ledgerBal)) > TOLERANCE;
}

function isWithinTolerance(a, b) {
  return Math.abs(round2(a) - round2(b)) <= TOLERANCE;
}

/** Same business key as repair script: accountCode, entityId, referenceType, referenceId */
function businessKey(entry) {
  const entityId = entry.entityId != null ? String(entry.entityId) : '';
  return `${entry.accountCode}:${entityId}:${entry.referenceType || ''}:${entry.referenceId || ''}`;
}

function netEntry(entry) {
  return (entry.credit || 0) - (entry.debit || 0);
}

/** Single scan: all WALLET ledger entries grouped by entityId (string). */
async function getAllWalletEntriesByUserId() {
  const db = await getDb();
  const list = await db.collection('ledger_entries').find({ accountCode: WALLET_ACCOUNT }).toArray();
  const byUser = new Map();
  for (const e of list) {
    const uid = e.entityId != null ? String(e.entityId) : '';
    if (!byUser.has(uid)) byUser.set(uid, []);
    byUser.get(uid).push({
      id: e._id.toString(),
      entityId: e.entityId,
      accountCode: e.accountCode,
      referenceType: e.referenceType,
      referenceId: e.referenceId,
      credit: e.credit || 0,
      debit: e.debit || 0,
    });
  }
  return byUser;
}

/** Per-user: raw balance, duplicate excess, corrected balance (same logic as repair script). */
function computeRawCorrectedExcess(entries) {
  const byKey = {};
  for (const e of entries) {
    const key = businessKey(e);
    if (!byKey[key]) byKey[key] = [];
    byKey[key].push(e);
  }
  let correctedBalance = 0;
  let totalExcess = 0;
  for (const arr of Object.values(byKey)) {
    const net = netEntry(arr[0]);
    correctedBalance += net;
    if (arr.length > 1) totalExcess += (arr.length - 1) * net;
  }
  const rawBalance = entries.reduce((s, e) => s + netEntry(e), 0);
  return {
    rawBalance: round2(rawBalance),
    correctedBalance: round2(correctedBalance),
    duplicateAdjustment: round2(totalExcess),
  };
}

function classifyStatus(rawDifference, correctedDifference) {
  const rawNonZero = !isWithinTolerance(rawDifference, 0);
  const correctedZero = isWithinTolerance(correctedDifference, 0);
  if (rawNonZero && correctedZero) return 'historical duplicates only (already repaired)';
  if (!isWithinTolerance(correctedDifference, 0)) return 'active mismatch (needs investigation)';
  return 'fully consistent';
}

/** All users with wallets; each has raw + corrected comparison and status. */
async function getReconciliationRows(entriesByUser) {
  const db = await getDb();
  const wallets = await db.collection('wallets').find({}, { projection: { userId: 1, currency: 1, balance: 1 } }).toArray();
  const rows = [];
  for (const w of wallets) {
    const userId = w.userId != null ? String(w.userId) : '';
    const walletBalance = round2(w.balance ?? 0);
    const entries = entriesByUser.get(userId) || [];
    const { rawBalance, correctedBalance, duplicateAdjustment } = computeRawCorrectedExcess(entries);
    const rawDifference = round2(walletBalance - rawBalance);
    const correctedDifference = round2(walletBalance - correctedBalance);
    const status = classifyStatus(rawDifference, correctedDifference);
    rows.push({
      userId,
      currency: w.currency || 'USD',
      walletBalance,
      rawLedgerBalance: rawBalance,
      rawDifference,
      correctedLedgerBalance: correctedBalance,
      correctedDifference,
      duplicateAdjustment,
      status,
    });
  }
  return rows;
}

async function getDuplicateWalletLedgerKeys() {
  const db = await getDb();
  const cursor = db.collection('ledger_entries').find({ accountCode: WALLET_ACCOUNT });
  const byKey = {};
  while (await cursor.hasNext()) {
    const doc = await cursor.next();
    const key = businessKey(doc);
    if (!byKey[key]) byKey[key] = [];
    byKey[key].push({ id: doc._id.toString(), entityId: doc.entityId, referenceType: doc.referenceType, referenceId: doc.referenceId });
  }
  return Object.entries(byKey)
    .filter(([, arr]) => arr.length > 1)
    .map(([key, entries]) => ({ key, count: entries.length, entryIds: entries.map((e) => e.id) }));
}

async function getOrphanRefs(sampleLimit = 100) {
  const db = await getDb();
  const ledgerCol = db.collection('ledger_entries');
  const txCol = db.collection('wallet_transactions');
  const walletEntries = await ledgerCol.find({ accountCode: WALLET_ACCOUNT }).sort({ createdAt: -1 }).limit(sampleLimit * 3).toArray();
  const refTypes = new Set(['admin_credit', 'deposit', 'withdrawal', 'pamm_dist', 'transfer']);
  const ledgerRefs = new Set();
  const byUser = {};
  for (const e of walletEntries) {
    const uid = String(e.entityId);
    if (!byUser[uid]) byUser[uid] = [];
    byUser[uid].push(e);
    if (refTypes.has(e.referenceType)) {
      ledgerRefs.add(`${e.referenceType}:${e.referenceId}`);
    }
  }
  let ledgerWithoutTx = 0;
  let txWithoutLedger = 0;
  for (const userId of Object.keys(byUser)) {
    const entries = byUser[userId];
    const txList = await walletRepo.getTransactions(userId, { limit: 100 });
    const txRefs = new Set(txList.map((t) => `${t.type}:${t.reference}`));
    const entryRefs = new Set(entries.filter((e) => refTypes.has(e.referenceType)).map((e) => `${e.referenceType}:${e.referenceId}`));
    for (const e of entries) {
      const r = `${e.referenceType}:${e.referenceId}`;
      if (r && !txRefs.has(r) && refTypes.has(e.referenceType)) ledgerWithoutTx++;
    }
    for (const t of txList) {
      const r = `${t.type}:${t.reference}`;
      if (r && !entryRefs.has(r)) txWithoutLedger++;
    }
  }
  return { ledgerWithoutTx, txWithoutLedger };
}

async function run() {
  const jsonOut = process.argv.includes('--json');
  const entriesByUser = await getAllWalletEntriesByUserId();
  const rows = await getReconciliationRows(entriesByUser);
  const rawMismatches = rows.filter((r) => isMismatch(r.walletBalance, r.rawLedgerBalance));
  const correctedMismatches = rows.filter((r) => isMismatch(r.walletBalance, r.correctedLedgerBalance));
  const repairedOnly = rows.filter((r) => r.status === 'historical duplicates only (already repaired)');

  const report = {
    timestamp: new Date().toISOString(),
    totalUsers: rows.length,
    rawMismatchesCount: rawMismatches.length,
    correctedMismatchesCount: correctedMismatches.length,
    usersAlreadyRepairedCount: repairedOnly.length,
    rows,
    duplicateLedgerKeys: await getDuplicateWalletLedgerKeys(),
    orphans: await getOrphanRefs(),
  };

  if (jsonOut) {
    console.log(JSON.stringify(report, null, 2));
    process.exit(0);
  }

  console.log('=== WALLET-LEDGER RECONCILIATION MONITOR (READ-ONLY) ===\n');

  for (const r of rows) {
    console.log('User ID:', r.userId);
    console.log('  Wallet Balance:          ', r.walletBalance);
    console.log('  Raw Ledger Balance:     ', r.rawLedgerBalance);
    console.log('  Raw Difference:         ', r.rawDifference);
    console.log('  Corrected Ledger Balance:', r.correctedLedgerBalance);
    console.log('  Corrected Difference:   ', r.correctedDifference);
    console.log('  Duplicate Adjustment:   ', r.duplicateAdjustment);
    console.log('  Status:                 ', r.status);
    console.log('');
  }

  console.log('--- SUMMARY ---');
  console.log('Total users:              ', report.totalUsers);
  console.log('Raw mismatches count:    ', report.rawMismatchesCount);
  console.log('Corrected mismatches count:', report.correctedMismatchesCount);
  console.log('Users already repaired (only duplicates remaining):', report.usersAlreadyRepairedCount);
  console.log('');

  console.log('Duplicate WALLET ledger business keys:', report.duplicateLedgerKeys.length);
  if (report.duplicateLedgerKeys.length > 0) {
    for (const d of report.duplicateLedgerKeys.slice(0, 20)) {
      console.log('  ', d.key, '| count:', d.count, '| ids:', d.entryIds.slice(0, 5).join(', '));
    }
    if (report.duplicateLedgerKeys.length > 20) console.log('  ... and', report.duplicateLedgerKeys.length - 20, 'more');
  }
  console.log('\nOrphan refs (sample): ledger entries without matching tx:', report.orphans.ledgerWithoutTx, '| tx without matching ledger:', report.orphans.txWithoutLedger);
  console.log('\n(NO DATA MODIFIED — monitoring only)');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
