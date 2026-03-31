/**
 * Export CSV: every user with operational wallet + ledger WALLET (2110), and PAMM (investor stake + manager capital).
 * Read-only. Requires MongoDB (CONNECTION_STRING in .env).
 *
 *   node scripts/export-users-wallet-ledger-csv.js
 *   node scripts/export-users-wallet-ledger-csv.js --out=./logs/wallet-ledger.csv
 *
 * Env: EXPORT_OUT (output path), optional
 *
 * Default output uses a new file each run (`users-wallet-ledger-YYYY-MM-DD_HHmmss.csv`) so the CSV can stay open
 * in Excel. If you pass `--out=` to a locked file, the script writes `*-run-<timestamp>.csv` instead.
 *
 * PAMM columns (USD): active allocation balances (investor), realized PnL sum on those rows, manager currentDeposit sum.
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDb, closeMongo } from '../config/mongo.js';
import { ENTITY_COMPANY } from '../modules/finance/chart-of-accounts.js';
import ledgerRepo from '../modules/finance/ledger.repository.js';
import walletRepo from '../modules/wallet/wallet.repository.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const COMPANY_IDS = new Set([ENTITY_COMPANY, 'company', 'SYSTEM_ACCOUNT']);

/** Default file name includes time so each run is a new file; avoids EBUSY when yesterday's CSV is open in Excel. */
function defaultOutPath() {
  const d = new Date();
  const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}_${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}${String(d.getSeconds()).padStart(2, '0')}`;
  return path.join(__dirname, '..', 'logs', `users-wallet-ledger-${stamp}.csv`);
}

/**
 * Windows returns EBUSY if the target file is open (e.g. Excel). Write to an alternate name instead.
 * @returns {string} path actually written
 */
function writeCsvSafe(targetPath, content) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  try {
    fs.writeFileSync(targetPath, content, 'utf8');
    return targetPath;
  } catch (e) {
    const recoverable = e && (e.code === 'EBUSY' || e.code === 'EPERM');
    if (recoverable) {
      const dir = path.dirname(targetPath);
      const base = path.basename(targetPath, '.csv');
      const alt = path.join(dir, `${base}-run-${Date.now()}.csv`);
      fs.writeFileSync(alt, content, 'utf8');
      console.warn(`[export] Could not overwrite (file may be open in another app): ${targetPath}`);
      console.warn(`[export] Wrote to: ${alt}`);
      return alt;
    }
    throw e;
  }
}

function parseArgs(argv) {
  const out = {};
  for (const a of argv.slice(2)) {
    const m = /^--([^=]+)=(.*)$/.exec(a);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

function csvEscape(v) {
  const s = v == null ? '' : String(v);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function round2(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return '';
  return (Math.round(x * 100) / 100).toFixed(2);
}

async function main() {
  const args = parseArgs(process.argv);
  const outPath = args.out || process.env.EXPORT_OUT || defaultOutPath();

  const db = await getDb();
  const userRows = await db
    .collection('users')
    .find({})
    .project({ email: 1, accountNo: 1 })
    .toArray();

  const userMeta = new Map();
  for (const u of userRows) {
    userMeta.set(u._id.toString(), {
      email: (u.email || '').toLowerCase(),
      accountNo: u.accountNo != null ? String(u.accountNo) : '',
    });
  }

  const walletRows = await walletRepo.listAllWallets();
  const ledgerRows = await ledgerRepo.aggregateWalletExpectedBalancesByUserCurrency();
  const creditTxAgg = await db
    .collection('wallet_transactions')
    .aggregate([
      {
        $match: {
          type: { $in: ['import_opening_balance', 'admin_credit'] },
          status: 'completed',
        },
      },
      {
        $addFields: {
          userNorm: { $toString: '$userId' },
          currencyNorm: { $ifNull: ['$currency', 'USD'] },
          amountNum: { $toDouble: { $ifNull: ['$amount', 0] } },
        },
      },
      {
        $group: {
          _id: { u: '$userNorm', c: '$currencyNorm' },
          initial_deposit: {
            $sum: {
              $cond: [{ $eq: ['$type', 'import_opening_balance'] }, '$amountNum', 0],
            },
          },
          admin_credit: {
            $sum: {
              $cond: [{ $eq: ['$type', 'admin_credit'] }, '$amountNum', 0],
            },
          },
        },
      },
    ])
    .toArray();
  /** @type {Map<string, Map<string, { initial: number, admin: number }>>} */
  const creditByUserCurrency = new Map();
  for (const r of creditTxAgg) {
    const uid = String(r._id?.u || '');
    const cur = String(r._id?.c || 'USD');
    if (!creditByUserCurrency.has(uid)) creditByUserCurrency.set(uid, new Map());
    creditByUserCurrency.get(uid).set(cur, {
      initial: Number(r.initial_deposit) || 0,
      admin: Number(r.admin_credit) || 0,
    });
  }

  const allocAgg = await db
    .collection('pamm_allocations')
    .aggregate([
      { $match: { status: 'active' } },
      { $addFields: { followerNorm: { $toString: '$followerId' } } },
      {
        $group: {
          _id: '$followerNorm',
          pamm_investor_stake_usd: { $sum: { $toDouble: { $ifNull: ['$allocatedBalance', 0] } } },
          pamm_investor_realized_pnl_usd: { $sum: { $toDouble: { $ifNull: ['$realizedPnl', 0] } } },
          pamm_active_allocations_count: { $sum: 1 },
        },
      },
    ])
    .toArray();

  const mgrAgg = await db
    .collection('pamm_managers')
    .aggregate([
      { $addFields: { userNorm: { $toString: '$userId' } } },
      {
        $group: {
          _id: '$userNorm',
          pamm_manager_capital_usd: { $sum: { $toDouble: { $ifNull: ['$currentDeposit', 0] } } },
          pamm_manager_funds_count: { $sum: 1 },
        },
      },
    ])
    .toArray();

  /** @type {Map<string, { stake: number, realized: number, allocCount: number }>} */
  const pammInvestorByUser = new Map();
  for (const r of allocAgg) {
    const uid = String(r._id);
    pammInvestorByUser.set(uid, {
      stake: Number(r.pamm_investor_stake_usd) || 0,
      realized: Number(r.pamm_investor_realized_pnl_usd) || 0,
      allocCount: Number(r.pamm_active_allocations_count) || 0,
    });
  }

  /** @type {Map<string, { capital: number, fundCount: number }>} */
  const pammManagerByUser = new Map();
  for (const r of mgrAgg) {
    const uid = String(r._id);
    pammManagerByUser.set(uid, {
      capital: Number(r.pamm_manager_capital_usd) || 0,
      fundCount: Number(r.pamm_manager_funds_count) || 0,
    });
  }

  /** @type {Map<string, Map<string, number>>} */
  const walletByUser = new Map();
  for (const w of walletRows) {
    const uid = String(w.userId);
    if (!walletByUser.has(uid)) walletByUser.set(uid, new Map());
    walletByUser.get(uid).set(w.currency || 'USD', Number(w.balance) || 0);
  }

  /** @type {Map<string, Map<string, number>>} */
  const ledgerByUser = new Map();
  for (const r of ledgerRows) {
    const uid = String(r.userId);
    if (COMPANY_IDS.has(uid)) continue;
    const cur = r.currency || 'USD';
    if (!ledgerByUser.has(uid)) ledgerByUser.set(uid, new Map());
    ledgerByUser.get(uid).set(cur, Number(r.expectedBalance) || 0);
  }

  const lines = [];
  const header = [
    'user_id',
    'email',
    'account_no',
    'currency',
    'wallet_balance',
    'ledger_wallet_2110',
    'difference_wallet_minus_ledger',
    'initial_deposit',
    'admin_credit',
    'pamm_investor_stake_usd',
    'pamm_investor_realized_pnl_usd',
    'pamm_active_allocations_count',
    'pamm_manager_capital_usd',
    'pamm_manager_funds_count',
  ];
  lines.push(header.map(csvEscape).join(','));

  const userIdsSorted = [...userMeta.keys()].sort();

  for (const uid of userIdsSorted) {
    const meta = userMeta.get(uid);
    const wMap = walletByUser.get(uid) || new Map();
    const lMap = ledgerByUser.get(uid) || new Map();
    const currencies = new Set([...wMap.keys(), ...lMap.keys()]);
    if (currencies.size === 0) currencies.add('USD');

    const sortedCur = [...currencies].sort();
    const inv = pammInvestorByUser.get(uid);
    const mgr = pammManagerByUser.get(uid);
    const pStake = inv ? round2(inv.stake) : '0.00';
    const pReal = inv ? round2(inv.realized) : '0.00';
    const pAcnt = inv ? String(inv.allocCount) : '0';
    const pCap = mgr ? round2(mgr.capital) : '0.00';
    const pFunds = mgr ? String(mgr.fundCount) : '0';

    for (const cur of sortedCur) {
      const wb = wMap.has(cur) ? wMap.get(cur) : null;
      const lb = lMap.has(cur) ? lMap.get(cur) : null;
      const wn = wb != null && Number.isFinite(wb) ? wb : 0;
      const ln = lb != null && Number.isFinite(lb) ? lb : 0;
      const diff = wn - ln;
      const credits = creditByUserCurrency.get(uid)?.get(cur) || { initial: 0, admin: 0 };
      const row = [
        uid,
        meta.email,
        meta.accountNo,
        cur,
        round2(wn),
        round2(ln),
        round2(diff),
        round2(credits.initial),
        round2(credits.admin),
        pStake,
        pReal,
        pAcnt,
        pCap,
        pFunds,
      ];
      lines.push(row.map(csvEscape).join(','));
    }
  }

  const seenUsers = new Set(userIdsSorted);
  const orphanWalletLedgerIds = new Set(
    [...walletByUser.keys(), ...ledgerByUser.keys()].filter((id) => !seenUsers.has(id))
  );
  const orphanUids = orphanWalletLedgerIds;
  for (const uid of [...orphanUids].sort()) {
    const wMap = walletByUser.get(uid) || new Map();
    const lMap = ledgerByUser.get(uid) || new Map();
    const currencies = new Set([...wMap.keys(), ...lMap.keys()]);
    const inv = pammInvestorByUser.get(uid);
    const mgr = pammManagerByUser.get(uid);
    const pStake = inv ? round2(inv.stake) : '0.00';
    const pReal = inv ? round2(inv.realized) : '0.00';
    const pAcnt = inv ? String(inv.allocCount) : '0';
    const pCap = mgr ? round2(mgr.capital) : '0.00';
    const pFunds = mgr ? String(mgr.fundCount) : '0';
    for (const cur of [...currencies].sort()) {
      const wn = wMap.has(cur) ? wMap.get(cur) : 0;
      const ln = lMap.has(cur) ? lMap.get(cur) : 0;
      const credits = creditByUserCurrency.get(uid)?.get(cur) || { initial: 0, admin: 0 };
      const row = [
        uid,
        '',
        '',
        cur,
        round2(wn),
        round2(ln),
        round2(wn - ln),
        round2(credits.initial),
        round2(credits.admin),
        pStake,
        pReal,
        pAcnt,
        pCap,
        pFunds,
      ];
      lines.push(row.map(csvEscape).join(','));
    }
  }

  const pammOnlyUids = [...new Set([...pammInvestorByUser.keys(), ...pammManagerByUser.keys()])].filter(
    (id) => !userMeta.has(id) && !orphanWalletLedgerIds.has(id)
  );
  for (const uid of pammOnlyUids.sort()) {
    const wMap = walletByUser.get(uid) || new Map();
    const lMap = ledgerByUser.get(uid) || new Map();
    const currencies = new Set([...wMap.keys(), ...lMap.keys()]);
    if (currencies.size === 0) currencies.add('USD');
    const inv = pammInvestorByUser.get(uid);
    const mgr = pammManagerByUser.get(uid);
    const pStake = inv ? round2(inv.stake) : '0.00';
    const pReal = inv ? round2(inv.realized) : '0.00';
    const pAcnt = inv ? String(inv.allocCount) : '0';
    const pCap = mgr ? round2(mgr.capital) : '0.00';
    const pFunds = mgr ? String(mgr.fundCount) : '0';
    for (const cur of [...currencies].sort()) {
      const wn = wMap.has(cur) ? wMap.get(cur) : 0;
      const ln = lMap.has(cur) ? lMap.get(cur) : 0;
      const credits = creditByUserCurrency.get(uid)?.get(cur) || { initial: 0, admin: 0 };
      const row = [
        uid,
        '',
        '',
        cur,
        round2(wn),
        round2(ln),
        round2(wn - ln),
        round2(credits.initial),
        round2(credits.admin),
        pStake,
        pReal,
        pAcnt,
        pCap,
        pFunds,
      ];
      lines.push(row.map(csvEscape).join(','));
    }
  }

  const written = writeCsvSafe(outPath, lines.join('\n') + '\n');
  console.log(`Wrote ${lines.length - 1} data rows (+ header) to ${written}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => closeMongo());
