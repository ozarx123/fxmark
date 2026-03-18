/**
 * Daily wallet vs ledger (WALLET account 2110) reconciliation — read-only detection.
 * Persists run summary + mismatches; never mutates wallets or ledger.
 */
import { getDb } from '../../config/mongo.js';
import walletRepo from '../wallet/wallet.repository.js';
import ledgerRepo from './ledger.repository.js';
import alertService from '../admin/alert.service.js';

const COLLECTION = 'reconciliation_daily_runs';

function walletKey(userId, currency) {
  return `${String(userId)}|${String(currency || 'USD')}`;
}

const DEFAULT_TOLERANCE = 0.01;
const TOP_MISMATCHES_LOG = Math.min(100, Math.max(10, parseInt(process.env.RECONCILIATION_TOP_MISMATCHES_LOG || '20', 10)));

/**
 * Compare each wallets row to sum(credits)−sum(debits) on ledger WALLET for same user+currency.
 * Read-only; tolerance configurable via RECONCILIATION_TOLERANCE (default 0.01).
 */
async function runDailyWalletVsLedger() {
  const tolerance = Math.abs(parseFloat(process.env.RECONCILIATION_TOLERANCE) || DEFAULT_TOLERANCE);
  let wallets;
  let ledgerRows;
  try {
    wallets = await walletRepo.listAllWallets();
    ledgerRows = await ledgerRepo.aggregateWalletExpectedBalancesByUserCurrency();
  } catch (e) {
    console.error('[reconciliation-daily] read failed', e?.message || e);
    throw e;
  }
  const expectedMap = new Map();
  for (const row of ledgerRows) {
    const u = row.userId != null ? String(row.userId) : '';
    const c = row.currency != null ? String(row.currency) : 'USD';
    expectedMap.set(walletKey(u, c), Number(row.expectedBalance) || 0);
  }
  const walletKeySet = new Set();
  const checkedAt = new Date();
  const mismatches = [];

  for (const w of wallets) {
    const u = w.userId != null ? String(w.userId) : '';
    const c = w.currency || 'USD';
    const key = walletKey(u, c);
    walletKeySet.add(key);
    const expected = expectedMap.has(key) ? expectedMap.get(key) : 0;
    const actual = Number(w.balance) || 0;
    const difference = Math.round((actual - expected) * 10000) / 10000;
    if (Math.abs(difference) >= tolerance) {
      mismatches.push({
        userId: u,
        currency: c,
        actualBalance: actual,
        expectedBalance: expected,
        difference,
        checkedAt,
      });
    }
  }

  for (const row of ledgerRows) {
    const u = row.userId != null ? String(row.userId) : '';
    const c = row.currency != null ? String(row.currency) : 'USD';
    const key = walletKey(u, c);
    if (!walletKeySet.has(key)) {
      const expected = Number(row.expectedBalance) || 0;
      if (Math.abs(expected) >= tolerance) {
        mismatches.push({
          userId: u,
          currency: c,
          actualBalance: 0,
          expectedBalance: expected,
          difference: -expected,
          checkedAt,
        });
      }
    }
  }

  const doc = {
    checkedAt,
    tolerance,
    walletsScanned: wallets.length,
    ledgerWalletLegsSeen: ledgerRows.length,
    mismatchCount: mismatches.length,
    mismatches,
  };

  const db = await getDb();
  const { insertedId } = await db.collection(COLLECTION).insertOne(doc);
  const runId = insertedId.toString();

  if (mismatches.length > 0) {
    const top = mismatches.slice(0, TOP_MISMATCHES_LOG);
    console.warn(
      `[reconciliation] MISMATCH runId=${runId} count=${mismatches.length} tolerance=${tolerance}`,
      JSON.stringify({ top })
    );
    alertService
      .createAlert({
        type: alertService.ALERT_TYPES.RECON_MISMATCH,
        referenceId: runId,
        message: `Reconciliation: ${mismatches.length} wallet/ledger mismatch(es)`,
        metadata: { runId, mismatchCount: mismatches.length, tolerance, sample: top },
      })
      .catch((e) => console.warn('[alert] create failed', e?.message));
  } else {
    console.log(
      `[reconciliation] OK runId=${runId} wallets=${wallets.length} ledgerRows=${ledgerRows.length} tolerance=${tolerance}`
    );
  }

  return { ...doc, _id: insertedId, id: runId };
}

async function getLatestRun() {
  const db = await getDb();
  return db.collection(COLLECTION).findOne({}, { sort: { checkedAt: -1 } });
}

export default { runDailyWalletVsLedger, getLatestRun };
