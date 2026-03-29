/**
 * Mark a manager_trades row so it no longer affects Bull Run today/month % and cumulative P&L
 * (after an economic rollback or ops correction). Idempotent.
 *
 *   node scripts/mark-pamm-trade-excluded-from-metrics.js --position-id=<id>
 */
import 'dotenv/config';
import pammRepo from '../modules/pamm/pamm.repository.js';

const pid = process.argv.find((a) => a.startsWith('--position-id='))?.slice('--position-id='.length)?.trim();
if (!pid) {
  console.error('Usage: node scripts/mark-pamm-trade-excluded-from-metrics.js --position-id=<positionId>');
  process.exit(1);
}

const r = await pammRepo.excludeTradeFromFundMetrics(pid);
console.log(JSON.stringify({ positionId: pid, ...r }, null, 2));
process.exit(0);
