import repo from './feature-flags.repository.js';

const FLAG_CACHE_TTL_MS = 10_000;
let cacheAt = 0;
let cacheFlags = null;

function parseBooleanLike(value) {
  if (value == null) return null;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return null;
}

async function getGlobalFlagsCached() {
  const now = Date.now();
  if (cacheFlags && now - cacheAt < FLAG_CACHE_TTL_MS) return cacheFlags;
  cacheFlags = await repo.getGlobalFlags();
  cacheAt = now;
  return cacheFlags;
}

async function isFeatureEnabled(flagId, options = {}) {
  const { defaultValue = false, envVar = '' } = options;
  const forced = envVar ? parseBooleanLike(process.env[envVar]) : null;
  if (forced != null) return forced;
  const flags = await getGlobalFlagsCached();
  if (Object.prototype.hasOwnProperty.call(flags, flagId)) return !!flags[flagId];
  return !!defaultValue;
}

async function setGlobalFlags(flags) {
  const saved = await repo.setGlobalFlags(flags);
  cacheFlags = saved;
  cacheAt = Date.now();
  return saved;
}

function invalidateFeatureFlagCache() {
  cacheAt = 0;
  cacheFlags = null;
}

export default {
  isFeatureEnabled,
  setGlobalFlags,
  invalidateFeatureFlagCache,
};
