/**
 * Cache with optional Redis backend for faster execution.
 * Uses Redis when REDIS_URL or REDIS_HOST is set; otherwise in-memory only.
 * Same get/set/del API; values are JSON-serialized for Redis.
 */

import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import dotenv from 'dotenv';
import Redis from 'ioredis';

// Ensure .env is loaded from backend root (works regardless of process cwd or import order)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, '../../.env');
const envExists = fs.existsSync(envPath);
const result = dotenv.config({ path: envPath, override: true });
if (!envExists) {
  console.warn('[cache] .env not found at', envPath, '- Redis will be disabled unless REDIS_URL/REDIS_HOST is set in environment');
} else if (result.error) {
  console.warn('[cache] Failed to load .env:', result.error.message);
} else {
  const hasRedis = !!(process.env.REDIS_URL || (process.env.REDIS_HOST || '').trim());
  console.log('[cache] .env loaded from', envPath, '| REDIS_URL/REDIS_HOST set:', hasRedis);
}

const memoryStore = new Map();
const CACHE_PREFIX = 'cache:';

function getRedisConfig() {
  const url = (process.env.REDIS_URL || '').trim();
  const prefix = (process.env.REDIS_PREFIX || 'fxmark:').trim() || undefined;
  if (url) {
    return { url, keyPrefix: prefix, maxRetriesPerRequest: 3, lazyConnect: true };
  }
  const host = (process.env.REDIS_HOST || '').trim();
  if (!host) return null;
  return {
    host: host || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: (process.env.REDIS_PASSWORD || '').trim() || undefined,
    db: parseInt(process.env.REDIS_DB || '0', 10),
    keyPrefix: prefix,
    maxRetriesPerRequest: 3,
    retryStrategy(times) {
      if (times > 3) return null;
      return Math.min(times * 200, 2000);
    },
    lazyConnect: true,
  };
}

let redisClient = null;
let redisFailed = false;

function getRedis() {
  if (redisFailed) return null;
  if (redisClient) return redisClient;
  const config = getRedisConfig();
  if (!config) return null;
  try {
    redisClient = config.url ? new Redis(config.url) : new Redis(config);
    redisClient.on('error', (err) => {
      console.warn('[cache] Redis error:', err.message);
    });
    redisClient.on('connect', () => {
      redisFailed = false;
    });
    return redisClient;
  } catch (err) {
    console.warn('[cache] Redis init failed, using memory:', err.message);
    redisFailed = true;
    return null;
  }
}

/** @returns {Promise<boolean>} true if Redis is usable */
export async function isRedisAvailable() {
  const redis = getRedis();
  if (!redis) return false;
  try {
    await redis.ping();
    return true;
  } catch {
    return false;
  }
}

/**
 * Get multiple keys in one round-trip (Redis: MGET; memory: parallel get).
 * @param {string[]} keys
 * @returns {Promise<(any|null)[]>} Cached values in same order (null if missing)
 */
export async function getMany(keys) {
  if (!keys || keys.length === 0) return [];
  const redis = getRedis();
  if (redis) {
    try {
      const prefixed = keys.map((k) => CACHE_PREFIX + k);
      const rawList = await redis.mget(...prefixed);
      return rawList.map((raw) => (raw == null ? null : JSON.parse(raw)));
    } catch (err) {
      redisFailed = true;
      console.warn('[cache] Redis mget failed:', err.message);
    }
  }
  return Promise.all(keys.map((k) => get(k)));
}

/**
 * Get value from cache (Redis first, then memory)
 * @param {string} key
 * @returns {Promise<any|null>} Cached value or null
 */
export async function get(key) {
  const redis = getRedis();
  if (redis) {
    try {
      const raw = await redis.get(CACHE_PREFIX + key);
      if (raw == null) return null;
      return JSON.parse(raw);
    } catch (err) {
      redisFailed = true;
      console.warn('[cache] Redis get failed, fallback to memory:', err.message);
    }
  }
  const entry = memoryStore.get(key);
  if (!entry) return null;
  if (entry.expiresAt && Date.now() > entry.expiresAt) {
    memoryStore.delete(key);
    return null;
  }
  return Promise.resolve(entry.value);
}

/**
 * Set value in cache with optional TTL (seconds)
 * @param {string} key
 * @param {any} value - Must be JSON-serializable
 * @param {number} [ttlSeconds] - TTL in seconds
 */
export async function set(key, value, ttlSeconds = 60) {
  const redis = getRedis();
  if (redis) {
    try {
      const k = CACHE_PREFIX + key;
      const v = JSON.stringify(value);
      if (ttlSeconds > 0) {
        await redis.setex(k, ttlSeconds, v);
      } else {
        await redis.set(k, v);
      }
      return;
    } catch (err) {
      redisFailed = true;
      console.warn('[cache] Redis set failed, fallback to memory:', err.message);
    }
  }
  const expiresAt = ttlSeconds > 0 ? Date.now() + ttlSeconds * 1000 : null;
  memoryStore.set(key, { value, expiresAt });
  return Promise.resolve();
}

/**
 * Delete key from cache
 * @param {string} key
 */
export async function del(key) {
  const redis = getRedis();
  if (redis) {
    try {
      await redis.del(CACHE_PREFIX + key);
      return;
    } catch (err) {
      redisFailed = true;
      console.warn('[cache] Redis del failed:', err.message);
    }
  }
  memoryStore.delete(key);
  return Promise.resolve();
}
