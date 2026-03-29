/**
 * In-process snapshot for hot tick path (avoid Mongo on every quote).
 * Refreshed on server start and after admin updates.
 */
import marginRiskSettingsRepo from './margin-risk-settings.repository.js';

let snapshot = {
  stopOutBelowPct: 0,
  warnBelowPct: 0,
  warnIntervalMs: 120_000,
};

export function getMarginRiskRuntime() {
  return snapshot;
}

export async function refreshMarginRiskRuntime() {
  const d = await marginRiskSettingsRepo.get();
  snapshot = {
    stopOutBelowPct: d.stopOutBelowPct,
    warnBelowPct: d.warnBelowPct,
    warnIntervalMs: d.warnIntervalMs,
  };
}
