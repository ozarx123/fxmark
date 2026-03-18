/**
 * DEEP RECONCILIATION AUDIT — Wallet vs Ledger (READ-ONLY, NO FIXES)
 *
 * Compares wallet.balance to ledger-derived balance per user; classifies mismatches;
 * traces history, import, PAMM/IB commission, and suggests root cause. No data modified.
 *
 * Run from backend: node scripts/reconcile-wallet-ledger-audit.js
 * Optional: node scripts/reconcile-wallet-ledger-audit.js --json  (machine-readable)
 */
import 'dotenv/config';
import { getDb } from '../config/mongo.js';
import { ObjectId } from 'mongodb';
import ledgerRepo from '../modules/finance/ledger.repository.js';
import walletRepo from '../modules/wallet/wallet.repository.js';
import ibRepo from '../modules/ib/ib.repository.js';
import { ACCOUNTS } from '../modules/finance/chart-of-accounts.js';

const TOLERANCE = 0.005;
const WALLET_ACCOUNT = ACCOUNTS.WALLET; // '2110'

function round2(x) {
  return Math.round((Number(x) || 0) * 100) / 100;
}

function isMismatch(walletBal, ledgerBal) {
  return Math.abs(round2(walletBal) - round2(ledgerBal)) > TOLERANCE;
}

// ---------- TASK 1: Find all mismatch users ----------
async function findMismatchUsers() {
  const db = await getDb();
  const walletsCol = db.collection('wallets');
  const wallets = await walletsCol.find({}, { projection: { userId: 1, currency: 1, balance: 1 } }).toArray();

  const mismatches = [];
  const checked = [];

  for (const w of wallets) {
    const userId = w.userId != null ? String(w.userId) : '';
    const walletBalance = round2(w.balance ?? 0);
    const ledgerBalance = round2(await ledgerRepo.getBalance(userId, WALLET_ACCOUNT));
    const diff = round2(walletBalance - ledgerBalance);
    checked.push({ userId, walletBalance, ledgerBalance, currency: w.currency || 'USD' });
    if (isMismatch(walletBalance, ledgerBalance)) {
      mismatches.push({
        userId,
        walletBalance,
        ledgerBalance,
        difference: diff,
        currency: w.currency || 'USD',
      });
    }
  }

  return { checked, mismatches };
}

// ---------- TASK 2: Classify mismatch type ----------
function classifyMismatch(m) {
  if (m.ledgerBalance > m.walletBalance) return 'wallet update missing';
  if (m.walletBalance > m.ledgerBalance) return 'ledger entry missing';
  return 'unknown';
}

// ---------- TASK 3: Trace transaction history ----------
async function traceHistory(userId) {
  const ledgerEntries = await ledgerRepo.listByEntity(userId, { accountCode: WALLET_ACCOUNT, limit: 50 });
  const transactions = await walletRepo.getTransactions(userId, { limit: 50 });

  const byRef = {};
  ledgerEntries.forEach((e) => {
    const key = `${e.referenceType || ''}:${e.referenceId || ''}:${e.credit}:${e.debit}`;
    if (!byRef[key]) byRef[key] = [];
    byRef[key].push(e);
  });
  const duplicateLedger = Object.entries(byRef).filter(([, arr]) => arr.length > 1).map(([k, arr]) => ({ key: k, count: arr.length, entries: arr }));

  const txByRef = {};
  transactions.forEach((t) => {
    const key = `${t.type || ''}:${t.reference || ''}:${t.amount}`;
    if (!txByRef[key]) txByRef[key] = [];
    txByRef[key].push(t);
  });
  const duplicateTx = Object.entries(txByRef).filter(([, arr]) => arr.length > 1).map(([k, arr]) => ({ key: k, count: arr.length }));

  const ledgerRefs = new Set(ledgerEntries.map((e) => `${e.referenceType}:${e.referenceId}`));
  const txRefs = new Set(transactions.map((t) => `${t.type}:${t.reference}`));
  const ledgerWithoutTx = ledgerEntries.filter((e) => {
    const r = `${e.referenceType}:${e.referenceId}`;
    return r && !txRefs.has(r) && e.referenceType !== 'trade' && e.referenceType !== 'pamm_dist' && e.referenceType !== 'pamm_alloc';
  });
  const txWithoutLedger = transactions.filter((t) => {
    const r = `${t.type}:${t.reference}`;
    return r && !ledgerRefs.has(r);
  });

  return {
    last50Ledger: ledgerEntries.length,
    last50Tx: transactions.length,
    duplicateLedgerEntries: duplicateLedger,
    duplicateTransactions: duplicateTx,
    ledgerEntriesWithoutMatchingTx: ledgerWithoutTx.slice(0, 20),
    transactionsWithoutMatchingLedger: txWithoutLedger.slice(0, 20),
  };
}

// ---------- TASK 4: Bulk import impact ----------
async function checkBulkImportImpact(userId) {
  const db = await getDb();
  const ledgerCol = db.collection('ledger_entries');
  const idStr = String(userId);
  const orCond = [{ entityId: idStr }];
  if (ObjectId.isValid(idStr) && idStr.length === 24) orCond.push({ entityId: new ObjectId(idStr) });
  const importEntries = await ledgerCol
    .find({
      $or: orCond,
      accountCode: WALLET_ACCOUNT,
      referenceType: 'import_opening_balance',
    })
    .sort({ createdAt: 1 })
    .toArray();

  const totalImported = importEntries.reduce((s, e) => s + (e.credit || 0) - (e.debit || 0), 0);
  const duplicateImports = importEntries.length > 1;
  return {
    importEntryCount: importEntries.length,
    totalImportedFromLedger: round2(totalImported),
    duplicateImportEntries: duplicateImports,
    referenceIds: importEntries.map((e) => e.referenceId).filter(Boolean),
  };
}

// ---------- TASK 5: PAMM / IB commission impact ----------
async function checkPammCommissionImpact(userId) {
  const logsAsIb = await ibRepo.listPammIbCommissionLogsForIb(userId, { from: new Date(0), to: new Date(), limit: 500 });
  const totalCommissionFromLogs = logsAsIb.reduce((s, l) => s + (l.commission_amount || 0), 0);

  const ledgerEntries = await ledgerRepo.listByEntity(userId, { accountCode: WALLET_ACCOUNT, referenceType: 'pamm_ib_commission', limit: 500 });
  const totalFromLedger = ledgerEntries.reduce((s, e) => s + (e.credit || 0) - (e.debit || 0), 0);

  const commissionMismatch = Math.abs(round2(totalCommissionFromLogs) - round2(totalFromLedger)) > TOLERANCE;
  return {
    pammLogEntriesAsIb: logsAsIb.length,
    totalCommissionFromLogs: round2(totalCommissionFromLogs),
    ledgerCreditsForPammCommission: round2(totalFromLedger),
    commissionLedgerMismatch: commissionMismatch,
  };
}

// ---------- TASK 6 & 7: Atomicity / time-based — infer from gaps (read-only; no error log access) ----------
function inferRootCause(m, trace, importCheck, pammCheck) {
  const causes = [];
  if (trace.duplicateLedgerEntries.length > 0) causes.push('ledger duplication');
  if (trace.duplicateTransactions.length > 0) causes.push('transaction duplication');
  if (importCheck.duplicateImportEntries) causes.push('import error (duplicate import entries)');
  if (importCheck.importEntryCount === 0 && m.ledgerBalance > m.walletBalance) causes.push('wallet update missing');
  if (trace.ledgerEntriesWithoutMatchingTx.length > 0 && trace.transactionsWithoutMatchingLedger.length > 0) causes.push('orphan entries');
  if (pammCheck.commissionLedgerMismatch) causes.push('commission mismatch');
  if (m.ledgerBalance > m.walletBalance) causes.push('wallet update missing');
  if (m.walletBalance > m.ledgerBalance) causes.push('ledger entry missing');
  if (causes.length === 0) causes.push('manual DB change or rollback failure');
  return [...new Set(causes)];
}

// ---------- MAIN ----------
async function run() {
  const jsonOut = process.argv.includes('--json');
  const report = {
    task1_mismatchUsers: [],
    task2_classification: [],
    task3_trace: {},
    task4_importImpact: {},
    task5_pammImpact: {},
    task8_rootCause: [],
    task9_summary: {},
  };

  console.log('=== WALLET vs LEDGER RECONCILIATION AUDIT (READ-ONLY) ===\n');

  const { checked, mismatches } = await findMismatchUsers();
  report.task1_mismatchUsers = mismatches.map((m) => ({
    userId: m.userId,
    walletBalance: m.walletBalance,
    ledgerBalance: m.ledgerBalance,
    difference: m.difference,
  }));

  if (jsonOut) {
    report.task2_classification = mismatches.map((m) => ({ userId: m.userId, type: classifyMismatch(m) }));
    for (const m of mismatches) {
      report.task3_trace[m.userId] = await traceHistory(m.userId);
      report.task4_importImpact[m.userId] = await checkBulkImportImpact(m.userId);
      report.task5_pammImpact[m.userId] = await checkPammCommissionImpact(m.userId);
      const trace = report.task3_trace[m.userId];
      const importCheck = report.task4_importImpact[m.userId];
      const pammCheck = report.task5_pammImpact[m.userId];
      report.task8_rootCause.push({
        userId: m.userId,
        mismatchAmount: m.difference,
        mismatchType: classifyMismatch(m),
        rootCauseCategory: inferRootCause(m, trace, importCheck, pammCheck),
      });
    }
    const byCause = {};
    report.task8_rootCause.forEach((r) => {
      r.rootCauseCategory.forEach((c) => {
        byCause[c] = (byCause[c] || 0) + 1;
      });
    });
    report.task9_summary = {
      totalUsersChecked: checked.length,
      totalMismatchedUsers: mismatches.length,
      breakdownByCause: byCause,
    };
    console.log(JSON.stringify(report, null, 2));
    process.exit(0);
  }

  // Human-readable report
  console.log('--- TASK 1: MISMATCH USERS ---');
  if (mismatches.length === 0) {
    console.log('No mismatches found. All', checked.length, 'wallets reconcile with ledger.\n');
    process.exit(0);
  }
  console.log('UserId                          | Wallet Balance | Ledger Balance | Difference');
  console.log('-'.repeat(85));
  for (const m of mismatches) {
    console.log(`${m.userId.padEnd(32)} | ${String(m.walletBalance).padStart(14)} | ${String(m.ledgerBalance).padStart(14)} | ${m.difference}`);
  }
  console.log('');

  console.log('--- TASK 2: CLASSIFICATION ---');
  for (const m of mismatches) {
    const type = classifyMismatch(m);
    console.log(`${m.userId}: ${type}`);
  }
  console.log('');

  console.log('--- TASK 3: TRACE (sample: first 3 mismatched users) ---');
  for (let i = 0; i < Math.min(3, mismatches.length); i++) {
    const m = mismatches[i];
    const trace = await traceHistory(m.userId);
    console.log(`\nUser: ${m.userId}`);
    console.log('  Last 50 ledger entries:', trace.last50Ledger, '| Last 50 tx:', trace.last50Tx);
    if (trace.duplicateLedgerEntries.length) console.log('  Duplicate ledger keys:', trace.duplicateLedgerEntries.length);
    if (trace.duplicateTransactions.length) console.log('  Duplicate tx keys:', trace.duplicateTransactions.length);
    if (trace.ledgerEntriesWithoutMatchingTx.length) console.log('  Ledger without tx (sample):', trace.ledgerEntriesWithoutMatchingTx.length);
    if (trace.transactionsWithoutMatchingLedger.length) console.log('  Tx without ledger (sample):', trace.transactionsWithoutMatchingLedger.length);
  }
  console.log('');

  console.log('--- TASK 4: BULK IMPORT IMPACT ---');
  for (let i = 0; i < Math.min(5, mismatches.length); i++) {
    const m = mismatches[i];
    const imp = await checkBulkImportImpact(m.userId);
    console.log(`${m.userId}: import_entries=${imp.importEntryCount} totalImported=${imp.totalImportedFromLedger} duplicateImports=${imp.duplicateImportEntries}`);
  }
  console.log('');

  console.log('--- TASK 5: PAMM/IB COMMISSION IMPACT ---');
  for (let i = 0; i < Math.min(5, mismatches.length); i++) {
    const m = mismatches[i];
    const pamm = await checkPammCommissionImpact(m.userId);
    console.log(`${m.userId}: logsAsIb=${pamm.pammLogEntriesAsIb} fromLogs=${pamm.totalCommissionFromLogs} fromLedger=${pamm.ledgerCreditsForPammCommission} mismatch=${pamm.commissionLedgerMismatch}`);
  }
  console.log('');

  console.log('--- TASK 8: ROOT CAUSE (per mismatched user) ---');
  const causeCounts = {};
  for (const m of mismatches) {
    const trace = await traceHistory(m.userId);
    const importCheck = await checkBulkImportImpact(m.userId);
    const pammCheck = await checkPammCommissionImpact(m.userId);
    const causes = inferRootCause(m, trace, importCheck, pammCheck);
    causes.forEach((c) => { causeCounts[c] = (causeCounts[c] || 0) + 1; });
    const firstBroken = trace.duplicateLedgerEntries[0]?.entries?.[0] || trace.ledgerEntriesWithoutMatchingTx[0];
    console.log(`${m.userId}: diff=${m.difference} type=${classifyMismatch(m)} causes=[${causes.join(', ')}] firstId=${firstBroken?.id || '—'}`);
  }
  console.log('');

  console.log('--- TASK 9: SUMMARY ---');
  console.log('Total users checked:', checked.length);
  console.log('Total mismatched users:', mismatches.length);
  console.log('Breakdown by cause:');
  Object.entries(causeCounts).forEach(([cause, count]) => {
    const pct = checked.length ? ((count / mismatches.length) * 100).toFixed(1) : 0;
    console.log(`  ${cause}: ${count} (${pct}% of mismatched)`);
  });
  console.log('\n(NO DATA WAS MODIFIED — analysis only)');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
