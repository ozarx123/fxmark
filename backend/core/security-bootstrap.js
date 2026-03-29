/**
 * Production security gates and helpers (uses process.env only — safe to load before other app imports).
 */

export function isLocalApiDeployment() {
  const apiUrl = (process.env.API_URL || '').trim();
  if (!apiUrl) return true;
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(apiUrl);
}

/** True when the API is treated as a public production deployment (stricter CORS / env rules). */
export function isStrictProductionSecurity() {
  return process.env.NODE_ENV === 'production' && !isLocalApiDeployment();
}

/** Parse ALLOWED_ORIGINS into a non-empty array, or null if unset. */
export function getAllowedOriginsList() {
  const raw = (process.env.ALLOWED_ORIGINS || '').trim();
  if (!raw) return null;
  const list = raw.split(',').map((o) => o.trim()).filter(Boolean);
  return list.length > 0 ? list : null;
}

/**
 * Express `trust proxy`: behind Render/nginx, one hop is typical.
 * TRUST_PROXY=true|1|on — enable (1 hop). false|0|off — disable.
 * Unset: 1 hop when strict production; otherwise false.
 */
export function resolveTrustProxy() {
  const t = (process.env.TRUST_PROXY || '').trim().toLowerCase();
  if (t === 'false' || t === '0' || t === 'off') return false;
  if (t === 'true' || t === '1' || t === 'on') return 1;
  if (isStrictProductionSecurity()) return 1;
  return false;
}

/**
 * Exit the process if production is configured insecurely.
 * Call by importing this module early from src/index.js (module side-effect at bottom).
 */
export function assertProductionSecurity() {
  const nodeEnv = process.env.NODE_ENV || 'development';
  const jwt = (process.env.JWT_SECRET || '').trim();
  const weakJwt = !jwt || jwt === 'change-me' || jwt.length < 32;

  if (nodeEnv === 'production' && weakJwt) {
    console.error(
      '[security] FATAL: In production JWT_SECRET must be set to a random value of at least 32 characters (not the default).'
    );
    process.exit(1);
  }

  if (isStrictProductionSecurity()) {
    const origins = getAllowedOriginsList();
    if (!origins) {
      console.error(
        '[security] FATAL: ALLOWED_ORIGINS must list at least one origin when NODE_ENV=production and API_URL is not localhost (CORS + Socket.IO).'
      );
      process.exit(1);
    }
    if (String(process.env.RATE_LIMIT_SKIP_AUTH).toLowerCase() === 'true') {
      console.error('[security] FATAL: RATE_LIMIT_SKIP_AUTH must not be true on public production.');
      process.exit(1);
    }
  }

  if (isStrictProductionSecurity()) {
    const exp = (process.env.JWT_EXPIRY || '7d').trim();
    const longAccess = /^(\d{2,}|[4-9])\s*d$/i.test(exp) || /week|month|year/i.test(exp);
    if (longAccess) {
      console.warn(
        '[security] JWT_EXPIRY looks long for a public deployment. Prefer short-lived access tokens (e.g. 15m) plus refresh; see .env.example.'
      );
    }
  }
}

assertProductionSecurity();
