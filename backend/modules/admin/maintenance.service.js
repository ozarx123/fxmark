/**
 * Platform maintenance: effective state (manual + scheduled window), in-memory cache, scheduler tick.
 */
import repo from './maintenance.repository.js';

/** Same bypass as admin panel for API during maintenance */
export const MAINTENANCE_BYPASS_ROLES = new Set([
  'superadmin',
  'super_admin',
  'admin',
  'dealing_desk',
  'risk_manager',
  'finance_manager',
  'compliance_officer',
  'support_manager',
]);

const CACHE_TTL_MS = 15_000;
let cache = {
  active: false,
  message: '',
  source: 'off',
  fetchedAt: 0,
  raw: null,
};

function computeEffective(doc, now = new Date()) {
  const message = (doc?.message && String(doc.message).trim()) || repo.defaultMessage();
  if (doc?.enabled === true) {
    return { active: true, message, source: 'manual' };
  }
  if (doc?.scheduleEnabled && doc.scheduleStart && doc.scheduleEnd) {
    const s = doc.scheduleStart instanceof Date ? doc.scheduleStart : new Date(doc.scheduleStart);
    const e = doc.scheduleEnd instanceof Date ? doc.scheduleEnd : new Date(doc.scheduleEnd);
    if (!Number.isNaN(s.getTime()) && !Number.isNaN(e.getTime()) && now >= s && now <= e) {
      return { active: true, message, source: 'schedule' };
    }
  }
  return { active: false, message: '', source: 'off' };
}

async function refreshCache() {
  let doc = null;
  try {
    doc = await repo.getDocument();
  } catch (err) {
    console.warn('[maintenance] cache refresh failed:', err?.message || err);
  }
  const eff = computeEffective(doc);
  cache = {
    ...eff,
    fetchedAt: Date.now(),
    raw: doc,
  };
  return cache;
}

export async function tick() {
  await refreshCache();
}

export async function getCachedEffective() {
  if (Date.now() - cache.fetchedAt > CACHE_TTL_MS) {
    await refreshCache();
  }
  return { active: cache.active, message: cache.message || repo.defaultMessage(), source: cache.source };
}

export async function getPublicStatus() {
  const { active, message } = await getCachedEffective();
  return { maintenance: active, message: active ? message : '' };
}

export async function isActive() {
  return (await getCachedEffective()).active;
}

export function getPublicMessage() {
  return cache.active ? cache.message || repo.defaultMessage() : '';
}

export async function getAdminPayload() {
  await refreshCache();
  const doc = cache.raw;
  const now = new Date();
  const eff = computeEffective(doc, now);
  return {
    enabled: !!doc?.enabled,
    message: doc?.message || repo.defaultMessage(),
    scheduleEnabled: !!doc?.scheduleEnabled,
    scheduleStart: doc?.scheduleStart ? new Date(doc.scheduleStart).toISOString() : null,
    scheduleEnd: doc?.scheduleEnd ? new Date(doc.scheduleEnd).toISOString() : null,
    updatedAt: doc?.updatedAt || null,
    updatedBy: doc?.updatedBy || null,
    effectiveActive: eff.active,
    effectiveSource: eff.source,
    serverTime: now.toISOString(),
  };
}

export async function updateSettings(body, adminId) {
  const scheduleEnabled = !!body.scheduleEnabled;
  let scheduleStart = body.scheduleStart != null && body.scheduleStart !== '' ? new Date(body.scheduleStart) : null;
  let scheduleEnd = body.scheduleEnd != null && body.scheduleEnd !== '' ? new Date(body.scheduleEnd) : null;
  if (scheduleEnabled) {
    if (!scheduleStart || Number.isNaN(scheduleStart.getTime())) {
      const err = new Error('scheduleStart is required when schedule is enabled');
      err.statusCode = 400;
      throw err;
    }
    if (!scheduleEnd || Number.isNaN(scheduleEnd.getTime())) {
      const err = new Error('scheduleEnd is required when schedule is enabled');
      err.statusCode = 400;
      throw err;
    }
    if (scheduleEnd <= scheduleStart) {
      const err = new Error('scheduleEnd must be after scheduleStart');
      err.statusCode = 400;
      throw err;
    }
  } else {
    scheduleStart = null;
    scheduleEnd = null;
  }

  await repo.upsert({
    enabled: !!body.enabled,
    message: body.message != null ? String(body.message) : repo.defaultMessage(),
    scheduleEnabled,
    scheduleStart,
    scheduleEnd,
    updatedBy: adminId,
  });
  return getAdminPayload();
}

export function startMaintenanceScheduler() {
  const INTERVAL_MS = 60_000;
  setInterval(() => {
    refreshCache().catch((e) => console.warn('[maintenance] scheduler tick:', e?.message || e));
  }, INTERVAL_MS);
  console.log(`[maintenance] Scheduler running every ${INTERVAL_MS / 1000}s`);
}

export default {
  MAINTENANCE_BYPASS_ROLES,
  tick,
  getPublicStatus,
  isActive,
  getPublicMessage,
  getAdminPayload,
  updateSettings,
  startMaintenanceScheduler,
  refreshCache,
};
