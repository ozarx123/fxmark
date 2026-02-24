/**
 * IB level calculator — determine IB level from hierarchy (tree depth)
 */
import ibRepo from './ib.repository.js';

/**
 * Get level for an IB (1 = top, 2 = under level 1, etc.)
 * @param {string} ibId - IB profile id or userId
 * @returns {Promise<number>}
 */
async function getLevel(ibId) {
  const profile = await ibRepo.getProfileById(ibId) || await ibRepo.getProfileByUserId(ibId);
  if (!profile) return 1;
  const userId = profile.userId || ibId;
  const depth = await ibRepo.getHierarchyDepth(userId);
  return depth;
}

/**
 * Get level for a user id (must be an IB)
 */
async function getLevelByUserId(userId) {
  return getLevel(userId);
}

export default { getLevel, getLevelByUserId };
