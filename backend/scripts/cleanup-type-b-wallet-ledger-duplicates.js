/**
 * Type-B cleanup only — see docs/WALLET_LEDGER_TYPE_B_DUPLICATE_PLAN.md
 * Removes duplicate WALLET (2110) + paired TRADING_PNL (4100) ledger rows per business key.
 * Does NOT modify wallets.balance, wallet_transactions, or create indexes.
 * One MongoDB transaction per group; aborts group if validation fails.
 *
 * Usage:
 *   node scripts/cleanup-type-b-wallet-ledger-duplicates.js           # dry-run
 *   node scripts/cleanup-type-b-wallet-ledger-duplicates.js --apply  # execute
 */
import 'dotenv/config';
import { getDb, withTransaction } from '../config/mongo.js';
import { ObjectId } from 'mongodb';
import { ACCOUNTS, ENTITY_COMPANY } from '../modules/finance/chart-of-accounts.js';
import { LEDGER_COLLECTION } from '../modules/finance/ledger.model.js';

const PAMM_FUND_ID = '69b83f299aacda0c6343b693';

/** Source: WALLET_LEDGER_TYPE_B_DUPLICATE_PLAN.md */
const GROUPS = [
  { label: 'B1', entityId: '699f291212a35103f3f0a869', refId: '69b8eae93f1a86aa75dcb5fe', expect: 2 },
  { label: 'B2', entityId: '699cb012383e9f4609083a31', refId: '69b8eae93f1a86aa75dcb5fe', expect: 2 },
  { label: 'B3', entityId: '699f291212a35103f3f0a869', refId: '69b8eae83f1a86aa75dcb5fc', expect: 2 },
  { label: 'B4', entityId: '699cb012383e9f4609083a31', refId: '69b8eae83f1a86aa75dcb5fc', expect: 2 },
  { label: 'B5', entityId: '69b7fb805ad28a8befc6c061', refId: '69b9a8e7b73d4bf3fa96ff2e', expect: 3 },
  { label: 'B6', entityId: '69a02aa64655692fb6ae960f', refId: '69b9a8e7b73d4bf3fa96ff2e', expect: 3 },
  { label: 'B7', entityId: '699f291212a35103f3f0a869', refId: '69b9a8e7b73d4bf3fa96ff2e', expect: 3 },
  { label: 'B8', entityId: '699cb012383e9f4609083a31', refId: '69b9a8e7b73d4bf3fa96ff2e', expect: 3 },
];

const REF_TYPE = 'pamm_dist';
const APPLY = process.argv.includes('--apply');

function refOr(field, refId) {
  const s = String(refId);
  const or = [{ [field]: s }];
  if (ObjectId.isValid(s) && s.length === 24) or.push({ [field]: new ObjectId(s) });
  return { $or: or };
}

function entityOr(uid) {
  const s = String(uid);
  const or = [{ entityId: s }];
  if (ObjectId.isValid(s) && s.length === 24) or.push({ entityId: new ObjectId(s) });
  return { $or: or };
}

/** Ledger may use company, SYSTEM_ACCOUNT, or lowercase legacy `system` */
const COMPANY_ENTITY_OR = {
  $or: [...new Set([ENTITY_COMPANY, 'SYSTEM_ACCOUNT', 'system'])].map((entityId) => ({ entityId })),
};

async function findWalletLegs(col, entityId, refId, pammFundId) {
  const f = {
    $and: [
      { accountCode: ACCOUNTS.WALLET },
      entityOr(entityId),
      { referenceType: REF_TYPE },
      refOr('referenceId', refId),
      { pammFundId: String(pammFundId) },
    ],
  };
  return col.find(f).sort({ createdAt: 1, _id: 1 }).toArray();
}

/**
 * Do not match debit in MongoDB — float storage can break equality (e.g. 57.38 vs 57.379999).
 * Fetch PNL candidates and filter in JS to paired WALLET credit.
 */
async function findPnlLegs(col, refId, pammFundId, walletCredit) {
  const f = {
    $and: [
      { accountCode: ACCOUNTS.TRADING_PNL },
      COMPANY_ENTITY_OR,
      { referenceType: REF_TYPE },
      refOr('referenceId', refId),
      { pammFundId: String(pammFundId) },
    ],
  };
  const all = await col.find(f).sort({ createdAt: 1, _id: 1 }).toArray();
  const wc = Number(walletCredit) || 0;
  return all.filter((r) => sameNumber(Number(r.debit) || 0, wc) && sameNumber(Number(r.credit) || 0, 0));
}

/** Cent-level tolerance for ledger floats */
function sameNumber(a, b, tol = 0.005) {
  return Math.abs(Number(a) - Number(b)) <= tol;
}

function allSameCredits(rows) {
  if (rows.length === 0) return false;
  const c0 = Number(rows[0].credit) || 0;
  return rows.every((r) => sameNumber(r.credit, c0) && sameNumber(r.debit, 0));
}

function allSameDebits(rows) {
  if (rows.length === 0) return false;
  const d0 = Number(rows[0].debit) || 0;
  return rows.every((r) => sameNumber(r.debit, d0) && sameNumber(r.credit, 0));
}

async function countDuplicateWalletGroups() {
  const db = await getDb();
  const col = db.collection(LEDGER_COLLECTION);
  const byKey = new Map();
  const cur = col.find({ accountCode: ACCOUNTS.WALLET });
  while (await cur.hasNext()) {
    const d = await cur.next();
    const eid = d.entityId != null ? String(d.entityId) : '';
    const rid = d.referenceId != null ? String(d.referenceId) : '';
    const pf = d.pammFundId != null ? String(d.pammFundId) : '';
    const key = `${eid}|${d.referenceType || ''}|${rid}|${pf}`;
    byKey.set(key, (byKey.get(key) || 0) + 1);
  }
  let dupGroups = 0;
  for (const c of byKey.values()) {
    if (c > 1) dupGroups += 1;
  }
  return dupGroups;
}

async function run() {
  console.log('=== Type-B WALLET + TRADING_PNL duplicate cleanup ===');
  console.log('Mode:', APPLY ? 'APPLY' : 'DRY-RUN');
  console.log('Does not modify wallets.balance or wallet_transactions.\n');

  const db = await getDb();
  const ledgerCol = db.collection(LEDGER_COLLECTION);

  const results = [];
  let totalDeleted = 0;
  let completed = 0;
  let aborted = 0;

  for (const g of GROUPS) {
    const walletLegs = await findWalletLegs(ledgerCol, g.entityId, g.refId, PAMM_FUND_ID);
    const creditAmt = Number(walletLegs[0]?.credit) || 0;
    const pnlLegs = await findPnlLegs(ledgerCol, g.refId, PAMM_FUND_ID, creditAmt);

    const rec = {
      group: g.label,
      status: 'aborted',
      reason: null,
      keptWalletId: null,
      keptPnlId: null,
      deletedWalletIds: [],
      deletedPnlIds: [],
    };

    if (walletLegs.length !== g.expect) {
      rec.reason = `WALLET row count ${walletLegs.length} !== expected ${g.expect}`;
      results.push(rec);
      aborted += 1;
      console.error(`[${g.label}] ABORT:`, rec.reason);
      continue;
    }
    if (walletLegs.length < 2) {
      rec.reason = 'WALLET rows < 2 (nothing to dedupe)';
      results.push(rec);
      aborted += 1;
      console.error(`[${g.label}] ABORT:`, rec.reason);
      continue;
    }
    if (!allSameCredits(walletLegs)) {
      rec.reason = 'WALLET duplicate group has inconsistent credit/debit';
      results.push(rec);
      aborted += 1;
      console.error(`[${g.label}] ABORT:`, rec.reason);
      continue;
    }
    if (pnlLegs.length !== walletLegs.length) {
      rec.reason = `PNL count ${pnlLegs.length} !== WALLET count ${walletLegs.length}`;
      results.push(rec);
      aborted += 1;
      console.error(`[${g.label}] ABORT:`, rec.reason);
      continue;
    }
    if (!allSameDebits(pnlLegs)) {
      rec.reason = 'TRADING_PNL duplicate group inconsistent';
      results.push(rec);
      aborted += 1;
      console.error(`[${g.label}] ABORT:`, rec.reason);
      continue;
    }
    if (!sameNumber(pnlLegs[0].debit, walletLegs[0].credit)) {
      rec.reason = 'PNL debit does not match WALLET credit';
      results.push(rec);
      aborted += 1;
      console.error(`[${g.label}] ABORT:`, rec.reason);
      continue;
    }

    const wKeep = walletLegs[0];
    const wRemove = walletLegs.slice(1);
    const pKeep = pnlLegs[0];
    const pRemove = pnlLegs.slice(1);

    if (wRemove.length === 0 || pRemove.length === 0) {
      rec.reason = 'No rows marked for deletion';
      results.push(rec);
      aborted += 1;
      console.error(`[${g.label}] ABORT:`, rec.reason);
      continue;
    }
    if (wRemove.length !== pRemove.length) {
      rec.reason = 'Internal: wallet vs pnl remove count mismatch';
      results.push(rec);
      aborted += 1;
      console.error(`[${g.label}] ABORT:`, rec.reason);
      continue;
    }

    rec.keptWalletId = wKeep._id.toString();
    rec.keptPnlId = pKeep._id.toString();
    rec.deletedWalletIds = wRemove.map((d) => d._id.toString());
    rec.deletedPnlIds = pRemove.map((d) => d._id.toString());
    rec.status = 'validated';

    const delCount = wRemove.length + pRemove.length;

    if (APPLY) {
      try {
        await withTransaction(async (session) => {
          const wids = wRemove.map((d) => d._id);
          const pids = pRemove.map((d) => d._id);
          const wr = await ledgerCol.deleteMany({ _id: { $in: wids } }, { session });
          const pr = await ledgerCol.deleteMany({ _id: { $in: pids } }, { session });
          if (wr.deletedCount !== wids.length || pr.deletedCount !== pids.length) {
            throw new Error(
              `Delete mismatch: wallet ${wr.deletedCount}/${wids.length} pnl ${pr.deletedCount}/${pids.length}`
            );
          }
        });
        rec.status = 'completed';
        totalDeleted += delCount;
        completed += 1;
        console.log(`[${g.label}] OK deleted ${delCount} ledger rows (${wRemove.length} WALLET + ${pRemove.length} PNL)`);
      } catch (e) {
        rec.status = 'aborted';
        rec.reason = e.message || String(e);
        aborted += 1;
        console.error(`[${g.label}] TRANSACTION FAILED:`, rec.reason);
      }
    } else {
      rec.status = 'dry_run_ok';
      totalDeleted += delCount;
      completed += 1;
      console.log(`[${g.label}] DRY-RUN would delete ${delCount} rows`);
    }

    results.push(rec);
  }

  const dupAfter = await countDuplicateWalletGroups();

  console.log('\n=== SUMMARY JSON ===');
  console.log(
    JSON.stringify(
      {
        groupsProcessed: GROUPS.length,
        completed,
        aborted,
        totalRowsDeleted: APPLY ? results.filter((r) => r.status === 'completed').reduce((s, r) => s + r.deletedWalletIds.length + r.deletedPnlIds.length, 0) : totalDeleted,
        perGroup: results,
        remainingDuplicateWalletBusinessKeyGroups: dupAfter,
        indexSafeNote:
          dupAfter === 0
            ? 'No duplicate WALLET business-key groups remain by this scan; still run ensure-wallet-ledger-unique-index.js before creating wallet_event_unique.'
            : 'Duplicates remain; do NOT create wallet_event_unique until zero.',
      },
      null,
      2
    )
  );

  if (!APPLY) {
    console.log('\nDry-run only. Run with --apply to execute.');
  }

  if (aborted > 0 && APPLY) {
    process.exit(1);
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
