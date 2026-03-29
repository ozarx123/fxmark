/**
 * Reverse Bull Run close effects for one position (distributions, IB commission, reserve, manager PAMM balance).
 * Uses reversal ledger entries and paired wallet updates — idempotent per position/user.
 *
 * From backend directory:
 *   node scripts/rollback-bullrun-trade.js --dry-run --latest-bull-run
 *   node scripts/rollback-bullrun-trade.js --position-id=<id>
 *
 * Find the row that matches the UI (e.g. XAUUSD, PnL −39442.80) — `--latest-bull-run` is only
 * the most recent close by time, not necessarily that ticket:
 *   node scripts/rollback-bullrun-trade.js --list-recent=40 --symbol=XAUUSD --pnl=-39442.8
 */
import {
  findLatestBullRunTrade,
  listRecentBullRunTrades,
  rollbackBullRunTradeClose,
} from '../modules/pamm/bullrun-trade-rollback.service.js';

function parseArgs(argv) {
  const out = {
    dryRun: false,
    latest: false,
    positionId: null,
    listRecent: null,
    symbol: null,
    pnl: null,
    pnlTolerance: null,
  };
  for (const a of argv) {
    if (a === '--dry-run') out.dryRun = true;
    else if (a === '--latest-bull-run') out.latest = true;
    else if (a === '--list-recent') out.listRecent = 30;
    else if (a.startsWith('--list-recent=')) out.listRecent = Number(a.slice('--list-recent='.length)) || 30;
    else if (a.startsWith('--symbol=')) out.symbol = a.slice('--symbol='.length).trim();
    else if (a.startsWith('--pnl=')) out.pnl = a.slice('--pnl='.length).trim();
    else if (a.startsWith('--pnl-tolerance=')) out.pnlTolerance = Number(a.slice('--pnl-tolerance='.length));
    else if (a.startsWith('--position-id=')) out.positionId = a.slice('--position-id='.length).trim();
  }
  return out;
}

async function main() {
  const {
    dryRun,
    latest,
    positionId: argPid,
    listRecent,
    symbol,
    pnl,
    pnlTolerance,
  } = parseArgs(process.argv.slice(2));

  if (listRecent != null) {
    const rows = await listRecentBullRunTrades({
      limit: listRecent,
      symbol: symbol || null,
      pnlApprox: pnl != null && pnl !== '' ? Number(pnl) : null,
      pnlTolerance: pnlTolerance != null ? pnlTolerance : 1,
    });
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ count: rows.length, trades: rows }, null, 2));
    // eslint-disable-next-line no-console
    console.log(
      '\nUse: node scripts/rollback-bullrun-trade.js --dry-run --position-id=<positionId from row above>'
    );
    process.exit(0);
  }

  let positionId = argPid;
  if (latest) {
    const t = await findLatestBullRunTrade();
    if (!t?.positionId) {
      // eslint-disable-next-line no-console
      console.error('[bullrun-rollback] No Bull Run trade found.');
      process.exit(1);
    }
    positionId = t.positionId;
    // eslint-disable-next-line no-console
    console.log('[bullrun-rollback] Latest Bull Run trade:', {
      positionId: t.positionId,
      pnl: t.pnl,
      managerId: t.managerId,
      createdAt: t.createdAt,
    });
  }

  if (!positionId) {
    // eslint-disable-next-line no-console
    console.error(
      'Usage: node scripts/rollback-bullrun-trade.js [--dry-run] (--latest-bull-run | --position-id=<id> | --list-recent[=N] [--symbol=XAUUSD] [--pnl=-39442.8] [--pnl-tolerance=1])'
    );
    process.exit(1);
  }

  const result = await rollbackBullRunTradeClose(positionId, { dryRun });
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(result, null, dryRun ? 2 : 0));
  process.exit(0);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[bullrun-rollback] Failed:', err?.message || err);
  process.exit(1);
});
