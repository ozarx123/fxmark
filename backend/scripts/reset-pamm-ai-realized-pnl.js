/**
 * One-off reconciliation script for PAMM AI funds (e.g. BULL RUN).
 *
 * What it does:
 * - Finds all PAMM managers whose name is 'BULL RUN' (case-insensitive) or fundType === 'ai'.
 * - For each such fund, sets realizedPnl = 0 on all active allocations.
 *
 * Why:
 * - Existing followers may have realizedPnl that includes trades from before they joined.
 * - After we changed distribution logic to exclude pre-join trades, we want followers'
 *   P&L to start from zero going forward.
 *
 * IMPORTANT:
 * - This does NOT touch wallets or ledger entries. It only resets the realizedPnl field
 *   used for reporting in the UI.
 *
 * Run from backend folder:
 *   node scripts/reset-pamm-ai-realized-pnl.js
 */

import pammRepo from '../modules/pamm/pamm.repository.js';

async function main() {
  const managers = await pammRepo.listAllManagers({ limit: 200 });
  const aiFunds = managers.filter((m) => {
    const name = String(m.name || '').toUpperCase();
    const type = String(m.fundType || '').toLowerCase();
    return name === 'BULL RUN' || type === 'ai';
  });

  if (!aiFunds.length) {
    // eslint-disable-next-line no-console
    console.log('[pamm-ai] No AI/BULL RUN funds found. Nothing to do.');
    process.exit(0);
  }

  // eslint-disable-next-line no-console
  console.log('[pamm-ai] Found AI funds:', aiFunds.map((f) => ({ id: f.id, name: f.name, fundType: f.fundType })));

  let totalAllocations = 0;
  for (const fund of aiFunds) {
    const allocations = await pammRepo.listAllocationsByManager(fund.id, { status: 'active' });
    if (!allocations.length) continue;

    for (const alloc of allocations) {
      await pammRepo.updateAllocation(alloc.id, { realizedPnl: 0 });
      totalAllocations += 1;
    }

    // eslint-disable-next-line no-console
    console.log(`[pamm-ai] Fund ${fund.id} (${fund.name}) — reset realizedPnl on ${allocations.length} allocations.`);
  }

  // eslint-disable-next-line no-console
  console.log(`[pamm-ai] Done. Total allocations updated: ${totalAllocations}.`);
  process.exit(0);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[pamm-ai] Reset script failed:', err);
  process.exit(1);
});

