/**
 * Admin-managed env overrides: stored in Mongo, applied to process.env after DB connects.
 * Does not replace backend/.env — database values override file for the same key name.
 */
import repo from './platform-env.repository.js';

/** Never manageable here (Mongo must connect using host/env first). */
export const ENV_KEY_DENYLIST = new Set([
  'CONNECTION_STRING',
  'MONGODB_URI',
  'MONGO_URL',
]);

/**
 * Curated keys (from backend/.env.example) shown first in admin UI.
 * Other valid keys can still be stored via "custom key".
 */
export const CURATED_ENV_KEYS = [
  'API_URL',
  'FRONTEND_URL',
  'WEB_APP_URL',
  'TWELVE_DATA_API_KEY',
  'TWELVE_DATA_WS',
  'FINNHUB_API_KEY',
  'JWT_SECRET',
  'JWT_EXPIRY',
  'ZOHO_MAIL_USER',
  'ZOHO_MAIL_PASSWORD',
  'ZOHO_SMTP_HOST',
  'ZOHO_SMTP_PORT',
  'FROM_EMAIL',
  'FROM_NAME',
  'REDIS_URL',
  'REDIS_HOST',
  'REDIS_PORT',
  'REDIS_PASSWORD',
  'ALLOWED_ORIGINS',
  'RATE_LIMIT_MAX_AUTH',
  'RATE_LIMIT_MAX_GLOBAL',
  'DEFAULT_IB_REFERRER_USER_ID',
  'MARGIN_LEVEL_STOP_OUT_BELOW_PCT',
  'MARGIN_LEVEL_WARN_BELOW_PCT',
  'MARGIN_LEVEL_WARN_INTERVAL_MS',
  'MAIL_WALLET_BALANCE_UPDATES',
  'SUBSCRIBED_SYMBOLS',
  'QUOTE_POLL_INTERVAL_MS',
];

const KEY_REGEX = /^[A-Z][A-Z0-9_]*$/;
const MAX_KEY_LEN = 128;
const MAX_VALUE_LEN = 32_000;

export function isValidEnvKey(key) {
  if (!key || typeof key !== 'string') return false;
  const k = key.trim();
  if (k.length === 0 || k.length > MAX_KEY_LEN) return false;
  if (!KEY_REGEX.test(k)) return false;
  if (ENV_KEY_DENYLIST.has(k)) return false;
  return true;
}

export function maskSecret(value) {
  const s = value == null ? '' : String(value);
  if (!s) return '';
  if (s.length <= 4) return '****';
  const vis = 4;
  const stars = Math.min(12, Math.max(4, s.length - vis));
  return `${'*'.repeat(stars)}${s.slice(-vis)}`;
}

/** Load DB overrides into process.env (call after Mongo ping, before feeds that read env). */
export async function applyPlatformEnvOverridesFromDatabase() {
  let entries;
  try {
    entries = await repo.getEntries();
  } catch (e) {
    console.warn('[platform-env] Could not load overrides:', e?.message || e);
    return { applied: 0 };
  }
  let n = 0;
  for (const [k, meta] of Object.entries(entries)) {
    if (!isValidEnvKey(k)) continue;
    if (meta && typeof meta.value === 'string') {
      process.env[k] = meta.value;
      n++;
    }
  }
  if (n > 0) {
    console.log(`[platform-env] Applied ${n} database override(s) into process.env`);
  }
  return { applied: n };
}

export async function listForAdmin() {
  const entries = await repo.getEntries();
  const row = (key) => ({
    key,
    hasDatabaseOverride: !!(entries[key]?.value != null && entries[key].value !== ''),
    maskedEffective: maskSecret(process.env[key]),
    updatedAt: entries[key]?.updatedAt || null,
    updatedBy: entries[key]?.updatedBy || null,
  });
  const curated = CURATED_ENV_KEYS.map((key) => row(key));
  const extraKeys = Object.keys(entries).filter((k) => !CURATED_ENV_KEYS.includes(k));
  const extra = extraKeys.filter(isValidEnvKey).map((key) => row(key));
  return {
    curated,
    extra,
    notes: {
      bootstrap:
        'Mongo connection strings (CONNECTION_STRING / MONGODB_URI) cannot be stored here — set them in the host environment or backend/.env.',
      mergeOrder: 'On each process start, backend/.env loads first, then database overrides replace values for the same key names.',
      hotUpdate:
        'Saving here updates process.env immediately. Feeds that read keys when they start (e.g. Finnhub/TwelveData) pick up changes after the next server restart unless they re-read env dynamically.',
    },
  };
}

/**
 * @param {string} key
 * @param {string} value - empty string removes override and deletes process.env[key]
 */
export async function setOverride(key, value, adminId) {
  const k = String(key || '').trim();
  if (!isValidEnvKey(k)) {
    const err = new Error(
      ENV_KEY_DENYLIST.has(k)
        ? 'This key cannot be managed here (use host .env for database URI).'
        : 'Invalid key: use UPPER_SNAKE_CASE (letter, then letters/digits/underscore).'
    );
    err.statusCode = 400;
    throw err;
  }
  const v = value == null ? '' : String(value);
  if (v.length > MAX_VALUE_LEN) {
    const err = new Error(`Value too long (max ${MAX_VALUE_LEN} characters)`);
    err.statusCode = 400;
    throw err;
  }
  if (v === '') {
    const existing = await repo.getEntries();
    if (!existing[k]) {
      const err = new Error('No database override exists for this key; nothing to clear.');
      err.statusCode = 400;
      throw err;
    }
    await repo.deleteEntry(k);
    delete process.env[k];
  } else {
    await repo.setEntry(k, v, adminId);
    process.env[k] = v;
  }
}

export default {
  ENV_KEY_DENYLIST,
  CURATED_ENV_KEYS,
  isValidEnvKey,
  maskSecret,
  applyPlatformEnvOverridesFromDatabase,
  listForAdmin,
  setOverride,
};
