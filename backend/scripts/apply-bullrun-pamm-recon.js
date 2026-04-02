/**
 * Apply Bull Run PAMM reconciliation from CSV (same as export: user_id, pamm_actual).
 * Reduces allocatedBalance by (bull_run_stake − pamm_actual) and posts ledger + fund trading balance.
 *
 * Modes:
 *   --mode=writeoff (default): CLIENT_FUNDS debit + TRADING_PNL credit; no investor wallet credit.
 *   --mode=return: same as partial withdraw — postPammUnallocation + wallet credit (use when cash returns to wallet).
 *
 *   node scripts/apply-bullrun-pamm-recon.js --dry-run
 *   node scripts/apply-bullrun-pamm-recon.js --batch-id=20260401
 *   node scripts/apply-bullrun-pamm-recon.js --recon=C:/path/recon_010426.csv
 *
 * Env: RECON_CSV_PATH, or repo root recon_010426 / recon_010426.csv
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { getDb, withTransaction, closeMongo } from '../config/mongo.js';
import financialTransactionService from '../modules/finance/financial-transaction.service.js';
import ledgerService from '../modules/finance/ledger.service.js';
import ledgerRepo from '../modules/finance/ledger.repository.js';
import pammRepo from '../modules/pamm/pamm.repository.js';
import positionRepo from '../modules/trading/position.repository.js';
import tradingAccountRepo from '../modules/trading/trading-account.repository.js';
import walletRepo from '../modules/wallet/wallet.repository.js';
import { parseReconCsv, loadReconMap } from './lib/pamm-recon-csv.js';

function parseArgs(argv) {
  const out = {};
  for (const a of argv.slice(2)) {
    const m = /^--([^=]+)=(.*)$/.exec(a);
    if (m) out[m[1]] = m[2];
    else if (a === '--dry-run') out.dryRun = '1';
  }
  return out;
}

function round2(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.round(x * 100) / 100;
}

async function getBullRunManagerIdSet() {
  const db = await getDb();
  const list = await db
    .collection('pamm_managers')
    .find({ $or: [{ fundType: 'ai' }, { name: /^bull\s*run$/i }] })
    .project({ _id: 1 })
    .toArray();
  return new Set(list.map((m) => m._id.toString()));
}

async function hasOpenPositionsForFund(fundId) {
  const fund = await pammRepo.getManagerById(fundId);
  if (!fund?.tradingAccountId || !fund?.userId) return false;
  const open = await positionRepo.listOpen(fund.userId, { accountId: fund.tradingAccountId, limit: 1 });
  return open.length > 0;
}

function splitProportional(totalAdjust, allocs) {
  const stakes = allocs.map((a) => Math.max(0, Number(a.allocatedBalance) || 0));
  const sum = stakes.reduce((s, x) => s + x, 0);
  if (sum < 0.001 || totalAdjust < 0.001) return [];
  const n = allocs.length;
  const raw = stakes.map((s) => round2((totalAdjust * s) / sum));
  let diff = round2(totalAdjust - raw.reduce((a, b) => a + b, 0));
  if (Math.abs(diff) >= 0.005 && n > 0) {
    raw[n - 1] = round2(raw[n - 1] + diff);
  }
  return allocs.map((alloc, i) => ({
    alloc,
    adjust: Math.min(raw[i], stakes[i]),
  }));
}

function refFor(batchId, userId, fundId) {
  return `pamm_recon|${batchId}|u:${userId}|f:${String(fundId)}`;
}

async function loadMap(args) {
  if (args.recon) {
    const resolved = path.resolve(process.cwd(), args.recon);
    if (!fs.existsSync(resolved)) {
      console.error('[apply-recon] --recon file not found.');
      console.error(`  Resolved path: ${resolved}`);
      console.error(`  cwd: ${process.cwd()}`);
      console.error('  Place recon_010426.csv at the repo root or pass an absolute path.');
      process.exit(1);
    }
    const text = fs.readFileSync(resolved, 'utf8');
    const m = parseReconCsv(text);
    console.log(`[apply-recon] Loaded ${resolved} (${m.size} parsed row(s))`);
    if (m.size === 0) {
      console.error('[apply-recon] CSV has no data rows, or header must include: user_id, pamm_actual');
    }
    return m;
  }
  return loadReconMap({ warnNoFile: true, logPrefix: '[apply-recon]' });
}

async function applyOneUser(uid, targetActual, batchId, mode, dryRun, bullRunSet) {
  const uidStr = String(uid).trim();
  const allocs = await pammRepo.listAllocationsByFollowerFlexible(uidStr, { status: 'active', limit: 50 });
  const brAllocs = allocs.filter((a) => bullRunSet.has(String(a.managerId)));
  if (brAllocs.length === 0) {
    return { status: 'skip', reason: 'no_active_bull_run_allocation' };
  }

  for (const a of brAllocs) {
    const open = await hasOpenPositionsForFund(a.managerId);
    if (open) {
      return { status: 'error', reason: `fund_has_open_positions:${String(a.managerId)}` };
    }
  }

  const totalStake = round2(brAllocs.reduce((s, a) => s + (Number(a.allocatedBalance) || 0), 0));
  const target = round2(Number(targetActual));
  if (!Number.isFinite(target) || target < 0) {
    return { status: 'skip', reason: 'invalid_pamm_actual' };
  }

  const totalAdjust = round2(totalStake - target);
  if (totalAdjust <= 0.01) {
    return { status: 'skip', reason: totalAdjust < 0 ? 'target_gt_stake' : 'nothing_to_reduce' };
  }

  if (totalAdjust > totalStake + 0.01) {
    return { status: 'error', reason: 'adjust_exceeds_stake' };
  }

  const parts = splitProportional(totalAdjust, brAllocs);
  const byFund = new Map();
  for (const { alloc, adjust } of parts) {
    if (adjust < 0.001) continue;
    const mid = String(alloc.managerId);
    if (!byFund.has(mid)) byFund.set(mid, 0);
    byFund.set(mid, round2(byFund.get(mid) + adjust));
  }

  if (dryRun) {
    return {
      status: 'dry_run',
      totalStake,
      target,
      totalAdjust,
      funds: [...byFund.entries()],
      parts: parts.map((p) => ({ allocationId: p.alloc.id, adjust: p.adjust })),
    };
  }

  if (mode === 'return') {
    await financialTransactionService.runPairedWithTransaction(async (session) => {
      await financialTransactionService.syncWalletToLedgerAfterMutation(session, uidStr, 'USD', async (s) => {
        for (const [fundId, amt] of byFund) {
          if (amt < 0.001) continue;
          const ref = refFor(batchId, uidStr, fundId);
          await ledgerService.postPammUnallocation(uidStr, amt, 'USD', ref, fundId, { session: s });
        }
      });
      const sumReturn = round2([...byFund.values()].reduce((a, b) => a + b, 0));
      if (sumReturn > 0.001) {
        await walletRepo.createTransaction(
          {
            userId: uidStr,
            type: 'pamm_unalloc',
            amount: sumReturn,
            currency: 'USD',
            status: 'completed',
            reference: `recon|${batchId}|${uidStr}`,
            completedAt: new Date(),
          },
          { session }
        );
      }
    }, { label: 'bullrun_pamm_recon_return' });
  } else {
    await withTransaction(async (session) => {
      for (const [fundId, amt] of byFund) {
        if (amt < 0.001) continue;
        const ref = refFor(batchId, uidStr, fundId);
        await ledgerService.postPammReconciliationWriteDown(uidStr, amt, 'USD', ref, fundId, { session });
      }
      for (const { alloc, adjust } of parts) {
        if (adjust < 0.001) continue;
        const newBal = round2((Number(alloc.allocatedBalance) || 0) - adjust);
        await pammRepo.updateAllocation(alloc.id, { allocatedBalance: Math.max(0, newBal) }, { session });
      }
      for (const [fundId, amt] of byFund) {
        if (amt < 0.001) continue;
        const manager = await pammRepo.getManagerById(fundId);
        if (manager?.tradingAccountId && manager?.userId) {
          await tradingAccountRepo.updateBalance(manager.tradingAccountId, manager.userId, -amt, { session });
        }
      }
    });
  }

  if (mode === 'return') {
    for (const { alloc, adjust } of parts) {
      if (adjust < 0.001) continue;
      const newBal = round2((Number(alloc.allocatedBalance) || 0) - adjust);
      await pammRepo.updateAllocation(alloc.id, { allocatedBalance: Math.max(0, newBal) });
    }
    for (const [fundId, amt] of byFund) {
      if (amt < 0.001) continue;
      const manager = await pammRepo.getManagerById(fundId);
      if (manager?.tradingAccountId && manager?.userId) {
        await tradingAccountRepo.updateBalance(manager.tradingAccountId, manager.userId, -amt);
      }
    }
  }

  return { status: 'ok', totalStake, target, totalAdjust, mode };
}

async function main() {
  const args = parseArgs(process.argv);
  const dryRun = args.dryRun === '1';
  const mode = (args.mode || 'writeoff').toLowerCase() === 'return' ? 'return' : 'writeoff';
  const batchId = args['batch-id'] || `batch_${Date.now()}`;
  const reconMap = await loadMap(args);
  if (reconMap.size === 0) {
    console.error(
      '[apply-recon] No recon data. Use --recon=path/to/recon_010426.csv (file must exist), with columns user_id and pamm_actual.'
    );
    process.exitCode = 1;
    return;
  }

  const bullRunSet = await getBullRunManagerIdSet();
  if (bullRunSet.size === 0) {
    console.warn('[apply-recon] No Bull Run funds (fundType ai / name BULL RUN). Nothing to do.');
    return;
  }

  await ledgerRepo.ensureLedgerReferenceIdIndex();

  let ok = 0;
  let skip = 0;
  let err = 0;
  let dry = 0;

  for (const [uid, rec] of reconMap) {
    const actual = rec?.pamm_actual;
    if (actual == null || !Number.isFinite(actual)) continue;

    try {
      const result = await applyOneUser(uid, actual, batchId, mode, dryRun, bullRunSet);
      if (result.status === 'ok') {
        ok += 1;
        console.log(`[apply-recon] OK ${uid} adjust=${result.totalAdjust} -> target=${result.target} (${mode})`);
      } else if (result.status === 'dry_run') {
        dry += 1;
        console.log(`[apply-recon] DRY ${uid} stake=${result.totalStake} target=${result.target} adjust=${result.totalAdjust}`, result.parts);
      } else if (result.status === 'skip') {
        skip += 1;
        console.log(`[apply-recon] SKIP ${uid} ${result.reason}`);
      } else {
        err += 1;
        console.error(`[apply-recon] FAIL ${uid} ${result.reason}`);
      }
    } catch (e) {
      err += 1;
      console.error(`[apply-recon] ERROR ${uid}`, e.message || e);
    }
  }

  console.log(
    `[apply-recon] Done batch=${batchId} mode=${mode} dryRun=${dryRun} ok=${ok} dry=${dry} skip=${skip} err=${err}`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => closeMongo());
