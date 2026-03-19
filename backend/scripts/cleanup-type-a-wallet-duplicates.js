/**
 * Type-A cleanup only (investigation groups 5, 10, 11):
 * - Duplicate WALLET + paired TRADING_PNL ledger rows (same referenceType/referenceId)
 * - Duplicate wallet_transactions (same userId, type, reference)
 * Keeps earliest createdAt (then _id) per group; deletes the rest.
 *
 * Does NOT modify wallets.balance.
 * Does NOT touch other duplicate groups.
 *
 * Usage:
 *   node scripts/cleanup-type-a-wallet-duplicates.js           # dry-run
 *   node scripts/cleanup-type-a-wallet-duplicates.js --apply  # execute deletes
 */
import 'dotenv/config';
import { getDb, withTransaction } from '../config/mongo.js';
import { ObjectId } from 'mongodb';
import { ACCOUNTS, ENTITY_COMPANY } from '../modules/finance/chart-of-accounts.js';
import { LEDGER_COLLECTION } from '../modules/finance/ledger.model.js';
import ledgerRepo from '../modules/finance/ledger.repository.js';

const WALLET_TX = 'wallet_transactions';
const WALLETS = 'wallets';

/** Investigation Type A only */
const GROUPS = [
  { label: 'G5', refType: 'trade', refId: '69b865651f2db42ad31f561a', entityId: '699f291212a35103f3f0a869', expect: 2 },
  { label: 'G10', refType: 'pamm_dist', refId: '69ba6e27eada85998ce727d0', entityId: '69b7fb805ad28a8befc6c061', expect: 3 },
  { label: 'G11', refType: 'pamm_dist', refId: '69ba6e27eada85998ce727d0', entityId: '69a02aa64655692fb6ae960f', expect: 3 },
];

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

async function findWalletLegs(col, entityId, refType, refId) {
  const f = {
    $and: [{ accountCode: ACCOUNTS.WALLET }, entityOr(entityId), { referenceType: refType }, refOr('referenceId', refId)],
  };
  return col.find(f).sort({ createdAt: 1, _id: 1 }).toArray();
}

async function findPnlLegsTrade(col, entityId, refId) {
  const f = {
    $and: [
      { accountCode: ACCOUNTS.TRADING_PNL },
      entityOr(entityId),
      { referenceType: 'trade' },
      refOr('referenceId', refId),
    ],
  };
  return col.find(f).sort({ createdAt: 1, _id: 1 }).toArray();
}

/** DB may use company, SYSTEM_ACCOUNT, or legacy lowercase `system` */
const COMPANY_ENTITY_OR = {
  $or: [...new Set([ENTITY_COMPANY, 'SYSTEM_ACCOUNT', 'system'])].map((entityId) => ({ entityId })),
};

async function findPnlLegsPammDist(col, refId, pammFundId, debitAmount) {
  const f = {
    $and: [
      { accountCode: ACCOUNTS.TRADING_PNL },
      COMPANY_ENTITY_OR,
      { referenceType: 'pamm_dist' },
      refOr('referenceId', refId),
      { pammFundId: String(pammFundId) },
      { debit: Number(debitAmount) || 0 },
      { credit: 0 },
    ],
  };
  return col.find(f).sort({ createdAt: 1, _id: 1 }).toArray();
}

async function findWalletTxs(col, entityId, refType, refId) {
  const f = {
    $and: [{ userId: String(entityId) }, { type: refType }, refOr('reference', refId)],
  };
  return col.find(f).sort({ createdAt: 1, _id: 1 }).toArray();
}

function splitKeepRemove(docs) {
  if (docs.length === 0) return { keep: null, remove: [] };
  const [keep, ...rest] = docs;
  return { keep, remove: rest };
}

async function mismatchReport(userIds) {
  const db = await getDb();
  const wCol = db.collection(WALLETS);
  const unique = [...new Set(userIds.map(String))];
  const rows = [];
  for (const uid of unique) {
    const walletBal = Number((await wCol.findOne({ userId: uid, currency: 'USD' }))?.balance) || 0;
    const ledgerBal = await ledgerRepo.getBalance(uid, ACCOUNTS.WALLET);
    const diff = Math.round((walletBal - ledgerBal) * 10000) / 10000;
    rows.push({ userId: uid, walletBalance: walletBal, ledgerWallet2110: ledgerBal, diff });
  }
  return rows;
}

async function run() {
  console.log('=== Type-A duplicate cleanup (groups 5, 10, 11) ===');
  console.log('Mode:', APPLY ? 'APPLY (deletes)' : 'DRY-RUN (no deletes)\n');

  const db = await getDb();
  const ledgerCol = db.collection(LEDGER_COLLECTION);
  const txCol = db.collection(WALLET_TX);

  let totalLedgerRemoved = 0;
  let totalTxRemoved = 0;
  const summary = [];

  for (const g of GROUPS) {
    const walletLegs = await findWalletLegs(ledgerCol, g.entityId, g.refType, g.refId);
    let pnlLegs = [];
    if (g.refType === 'trade') {
      pnlLegs = await findPnlLegsTrade(ledgerCol, g.entityId, g.refId);
    } else {
      const fundId = walletLegs[0]?.pammFundId;
      const wCredit = Number(walletLegs[0]?.credit) || 0;
      if (!fundId) {
        console.error(`[${g.label}] ABORT: no WALLET leg / pammFundId for pamm_dist`);
        process.exit(1);
      }
      pnlLegs = await findPnlLegsPammDist(ledgerCol, g.refId, fundId, wCredit);
    }
    const txs = await findWalletTxs(txCol, g.entityId, g.refType, g.refId);

    if (walletLegs.length !== g.expect || pnlLegs.length !== g.expect || txs.length !== g.expect) {
      console.error(`[${g.label}] ABORT: count mismatch`, {
        walletLegs: walletLegs.length,
        pnlLegs: pnlLegs.length,
        txs: txs.length,
        expect: g.expect,
      });
      process.exit(1);
    }

    const wk = splitKeepRemove(walletLegs);
    const pk = splitKeepRemove(pnlLegs);
    const tk = splitKeepRemove(txs);

    const ledgerRemoveIds = [...wk.remove.map((d) => d._id), ...pk.remove.map((d) => d._id)];
    const txRemoveIds = tk.remove.map((d) => d._id);

    summary.push({
      group: g.label,
      entityId: g.entityId,
      refType: g.refType,
      refId: g.refId,
      ledgerKept: wk.keep
        ? {
            walletId: wk.keep._id.toString(),
            pnlId: pk.keep._id.toString(),
            walletCreatedAt: wk.keep.createdAt,
          }
        : null,
      ledgerRemovedCount: ledgerRemoveIds.length,
      ledgerRemovedIds: ledgerRemoveIds.map((id) => id.toString()),
      txKeptId: tk.keep?._id.toString(),
      txRemovedCount: txRemoveIds.length,
      txRemovedIds: txRemoveIds.map((id) => id.toString()),
    });

    if (APPLY && ledgerRemoveIds.length + txRemoveIds.length > 0) {
      await withTransaction(async (session) => {
        if (ledgerRemoveIds.length) {
          const lr = await ledgerCol.deleteMany({ _id: { $in: ledgerRemoveIds } }, { session });
          if (lr.deletedCount !== ledgerRemoveIds.length) {
            throw new Error(`Ledger delete count ${lr.deletedCount} !== ${ledgerRemoveIds.length}`);
          }
        }
        if (txRemoveIds.length) {
          const tr = await txCol.deleteMany({ _id: { $in: txRemoveIds } }, { session });
          if (tr.deletedCount !== txRemoveIds.length) {
            throw new Error(`Tx delete count ${tr.deletedCount} !== ${txRemoveIds.length}`);
          }
        }
      });
    }

    totalLedgerRemoved += ledgerRemoveIds.length;
    totalTxRemoved += txRemoveIds.length;
  }

  console.log(JSON.stringify({ perGroup: summary, totals: { ledgerRowsRemoved: totalLedgerRemoved, walletTxRemoved: totalTxRemoved } }, null, 2));

  const affectedUsers = GROUPS.map((g) => g.entityId);
  console.log('\n=== Post-cleanup wallet vs ledger WALLET (2110) — dry-run style ===');
  const report = await mismatchReport(affectedUsers);
  console.log(JSON.stringify(report, null, 2));
  if (!APPLY) {
    console.log('\nDry-run only. Re-run with --apply to execute deletes.');
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
