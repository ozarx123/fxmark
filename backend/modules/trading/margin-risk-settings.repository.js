/**
 * Broker margin risk (tick engine) — MongoDB `settings` collection.
 * Effective values: stored document overrides per-field; missing document uses env fallbacks (see get()).
 */
import { getDb } from '../../config/mongo.js';

const KEY = 'broker_margin_risk';
const COLLECTION = 'settings';

function envFallbackStopOut() {
  const v = parseFloat(process.env.MARGIN_LEVEL_STOP_OUT_BELOW_PCT || '0');
  return Number.isFinite(v) && v > 0 ? v : 0;
}

function envFallbackWarn() {
  const raw = (process.env.MARGIN_LEVEL_WARN_BELOW_PCT ?? '').trim();
  if (raw === '' || raw === '0') return 0;
  const v = parseFloat(raw);
  return Number.isFinite(v) && v > 0 ? v : 0;
}

function envFallbackWarnInterval() {
  const v = parseInt(process.env.MARGIN_LEVEL_WARN_INTERVAL_MS || '120000', 10);
  return Number.isFinite(v) && v >= 30_000 ? v : 120_000;
}

async function col() {
  const db = await getDb();
  return db.collection(COLLECTION);
}

/**
 * @returns {Promise<{ key: string, stopOutBelowPct: number, warnBelowPct: number, warnIntervalMs: number, updatedAt: Date|null, updatedBy: string|null, fromDatabase: boolean }>}
 */
export async function get() {
  const fb = {
    stopOutBelowPct: envFallbackStopOut(),
    warnBelowPct: envFallbackWarn(),
    warnIntervalMs: envFallbackWarnInterval(),
  };
  const c = await col();
  const doc = await c.findOne({ key: KEY });
  if (!doc) {
    return {
      key: KEY,
      ...fb,
      updatedAt: null,
      updatedBy: null,
      fromDatabase: false,
    };
  }
  return {
    key: KEY,
    stopOutBelowPct:
      doc.stopOutBelowPct != null && Number.isFinite(Number(doc.stopOutBelowPct))
        ? Math.max(0, Number(doc.stopOutBelowPct))
        : fb.stopOutBelowPct,
    warnBelowPct:
      doc.warnBelowPct != null && Number.isFinite(Number(doc.warnBelowPct))
        ? Math.max(0, Number(doc.warnBelowPct))
        : fb.warnBelowPct,
    warnIntervalMs:
      doc.warnIntervalMs != null && Number.isFinite(Number(doc.warnIntervalMs))
        ? Math.max(30_000, Number(doc.warnIntervalMs))
        : fb.warnIntervalMs,
    updatedAt: doc.updatedAt || null,
    updatedBy: doc.updatedBy != null ? String(doc.updatedBy) : null,
    fromDatabase: true,
  };
}

/**
 * @param {{ stopOutBelowPct?: number, warnBelowPct?: number, warnIntervalMs?: number }} partial
 */
export async function set(partial, updatedBy = null) {
  const current = await get();
  const stopOutBelowPct =
    partial.stopOutBelowPct !== undefined
      ? Math.min(500, Math.max(0, Number(partial.stopOutBelowPct) || 0))
      : current.stopOutBelowPct;
  const warnBelowPct =
    partial.warnBelowPct !== undefined
      ? Math.min(500, Math.max(0, Number(partial.warnBelowPct) || 0))
      : current.warnBelowPct;
  const warnIntervalMs =
    partial.warnIntervalMs !== undefined
      ? Math.min(600_000, Math.max(30_000, Number(partial.warnIntervalMs) || 120_000))
      : current.warnIntervalMs;

  if (stopOutBelowPct > 0 && warnBelowPct > 0 && warnBelowPct <= stopOutBelowPct) {
    const err = new Error(
      'Margin warning threshold must be above stop-out threshold (e.g. warn 150%, stop 50%).'
    );
    err.statusCode = 400;
    throw err;
  }

  const now = new Date();
  const doc = {
    key: KEY,
    stopOutBelowPct,
    warnBelowPct,
    warnIntervalMs,
    updatedBy: updatedBy != null ? String(updatedBy) : null,
    updatedAt: now,
  };
  const c = await col();
  await c.updateOne({ key: KEY }, { $set: doc }, { upsert: true });
  return { ...doc, fromDatabase: true };
}

export default { get, set };
