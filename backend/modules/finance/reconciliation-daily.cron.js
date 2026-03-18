/**
 * Schedule daily wallet–ledger reconciliation (UTC off-peak).
 * Disable: RECONCILIATION_CRON_DISABLED=1
 */
import reconciliationDailyService from './reconciliation-daily.service.js';

const MS_DAY = 24 * 60 * 60 * 1000;

function msUntilNextUtcHour(hourUtc) {
  const now = Date.now();
  const d = new Date();
  let t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hourUtc, 5, 0, 0);
  if (t <= now) t += MS_DAY;
  return t - now;
}

export function startDailyWalletLedgerReconciliation() {
  if (process.env.RECONCILIATION_CRON_DISABLED === '1') {
    console.log('[reconciliation-daily] cron disabled (RECONCILIATION_CRON_DISABLED=1)');
    return;
  }
  const hour = Math.min(23, Math.max(0, parseInt(process.env.RECONCILIATION_DAILY_HOUR_UTC || '3', 10)));
  const run = () => {
    reconciliationDailyService.runDailyWalletVsLedger().catch((e) => {
      console.error('[reconciliation-daily] run failed', e?.message || e);
    });
  };
  const delay = msUntilNextUtcHour(hour);
  console.log(`[reconciliation-daily] first run in ${Math.round(delay / 60000)} min (UTC hour ${hour}), then every 24h`);
  setTimeout(() => {
    run();
    setInterval(run, MS_DAY);
  }, delay);
}
