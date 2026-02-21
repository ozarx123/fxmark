/**
 * Simple in-memory cache with TTL.
 * Redis can be added later via ioredis when REDIS_URL is set.
 */

const memoryStore = new Map();

/**
 * Get value from cache
 * @param {string} key
 * @returns {any|null} Cached value or null
 */
export function get(key) {
  const entry = memoryStore.get(key);
  if (!entry) return null;
  if (entry.expiresAt && Date.now() > entry.expiresAt) {
    memoryStore.delete(key);
    return null;
  }
  return entry.value;
}

/**
 * Set value in cache with optional TTL (seconds)
 * @param {string} key
 * @param {any} value
 * @param {number} [ttlSeconds] - TTL in seconds
 */
export function set(key, value, ttlSeconds = 60) {
  const expiresAt = ttlSeconds > 0 ? Date.now() + ttlSeconds * 1000 : null;
  memoryStore.set(key, { value, expiresAt });
}

/**
 * Delete key from cache
 * @param {string} key
 */
export function del(key) {
  memoryStore.delete(key);
}
