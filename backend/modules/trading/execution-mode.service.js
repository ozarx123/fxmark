/**
 * Execution mode service — get/set broker execution mode and hybrid rules.
 * Persists to MongoDB via execution-settings.repository.
 */
import * as settingsRepo from './execution-settings.repository.js';
import { auditExecutionModeChange, auditHybridRulesChange } from '../admin/execution-mode.audit.js';

export const MODES = Object.freeze(['A_BOOK', 'B_BOOK', 'HYBRID']);

export async function getExecutionMode() {
  const doc = await settingsRepo.get();
  return {
    executionMode: doc.executionMode || 'A_BOOK',
    hybridRules: doc.hybridRules || {},
    updatedBy: doc.updatedBy,
    updatedAt: doc.updatedAt,
  };
}

export async function setExecutionMode(mode, adminId = null) {
  const valid = MODES.includes(mode);
  if (!valid) {
    const err = new Error(`Invalid execution mode. Must be one of: ${MODES.join(', ')}`);
    err.statusCode = 400;
    throw err;
  }
  const current = await settingsRepo.get();
  const previousMode = current.executionMode || 'A_BOOK';
  await settingsRepo.set({ executionMode: mode }, adminId);
  await auditExecutionModeChange({
    oldMode: previousMode,
    newMode: mode,
    adminId,
  });
  return getExecutionMode();
}

export async function getHybridRules() {
  const doc = await settingsRepo.get();
  return doc.hybridRules || {};
}

export async function updateHybridRules(rules, adminId = null) {
  const current = await settingsRepo.get();
  const previousRules = { ...(current.hybridRules || {}) };
  const merged = { ...previousRules, ...rules };
  await settingsRepo.set({ hybridRules: merged }, adminId);
  await auditHybridRulesChange({
    oldRules: previousRules,
    newRules: merged,
    adminId,
  });
  return getHybridRules();
}

export default {
  getExecutionMode,
  setExecutionMode,
  getHybridRules,
  updateHybridRules,
  MODES,
};
