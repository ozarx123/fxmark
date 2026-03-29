/**
 * Admin moves IB under another IB (parentId). Cycle + max depth checks.
 */
import ibRepo from './ib.repository.js';

export const MAX_IB_LEVEL = 5;

/**
 * Walk upline from proposedParentId. If ibUserId appears, assigning ibUserId.parent = proposedParentId would create a cycle.
 * @param {string} ibUserId
 * @param {string} proposedParentId
 * @param {(id: string) => Promise<string|null|undefined>} getParentId
 */
export async function wouldAssigningParentCreateCycle(ibUserId, proposedParentId, getParentId) {
  const target = String(ibUserId).trim();
  let cur = String(proposedParentId).trim();
  const visited = new Set();
  while (cur) {
    if (cur === target) return true;
    if (visited.has(cur)) return false;
    visited.add(cur);
    const next = await getParentId(cur);
    cur = next != null && String(next).trim() !== '' ? String(next).trim() : null;
  }
  return false;
}

/** @returns {boolean} true if new IB level (parent depth + 1) exceeds max */
export function newIbLevelExceedsMax(parentDepth, maxLevel = MAX_IB_LEVEL) {
  const d = Number(parentDepth);
  if (!Number.isFinite(d) || d < 1) return true;
  return d + 1 > maxLevel;
}

/**
 * @param {string} ibUserId - IB being moved
 * @param {string|null} newParentUserId - upline IB user id, or null for root
 * @returns {Promise<{ parentVal: string|null }>}
 */
export async function validateIbParentChange(ibUserId, newParentUserId) {
  const ibStr = String(ibUserId).trim();
  if (!ibStr) {
    const err = new Error('ibUserId required');
    err.statusCode = 400;
    throw err;
  }
  const targetProf = await ibRepo.getProfileByUserId(ibStr);
  if (!targetProf) {
    const err = new Error('IB profile not found for this user');
    err.statusCode = 404;
    throw err;
  }

  if (newParentUserId == null || String(newParentUserId).trim() === '') {
    return { parentVal: null };
  }

  const pStr = String(newParentUserId).trim();
  if (pStr === ibStr) {
    const err = new Error('IB cannot be their own parent');
    err.statusCode = 400;
    throw err;
  }

  const parentProf = await ibRepo.getProfileByUserId(pStr);
  if (!parentProf) {
    const err = new Error('Parent must be a user with an IB profile');
    err.statusCode = 400;
    throw err;
  }

  const cycle = await wouldAssigningParentCreateCycle(ibStr, pStr, async (id) => {
    const prof = await ibRepo.getProfileByUserId(id);
    return prof?.parentId != null ? String(prof.parentId) : null;
  });
  if (cycle) {
    const err = new Error('That parent is under this IB in the hierarchy; would create a cycle');
    err.statusCode = 400;
    throw err;
  }

  const parentDepth = await ibRepo.getHierarchyDepth(pStr);
  if (newIbLevelExceedsMax(parentDepth, MAX_IB_LEVEL)) {
    const newLevel = parentDepth + 1;
    const err = new Error(`IB hierarchy limited to ${MAX_IB_LEVEL} levels; new position would be level ${newLevel}`);
    err.statusCode = 400;
    throw err;
  }

  return { parentVal: pStr };
}

export default { validateIbParentChange, MAX_IB_LEVEL, wouldAssigningParentCreateCycle, newIbLevelExceedsMax };
