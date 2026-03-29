/**
 * Access-token revocation (logout) via cache TTL aligned with JWT exp.
 * Uses Redis when configured; otherwise in-memory fallback (single-instance only).
 */
import { get, set } from '../../src/services/cache.js';

function keyForJti(jti) {
  return `revoked_at_jti:${jti}`;
}

/**
 * @param {string} jti
 * @param {number} expSec - JWT exp (seconds since epoch)
 */
export async function revokeAccessJti(jti, expSec) {
  if (!jti || !expSec) return;
  const now = Math.floor(Date.now() / 1000);
  const ttl = Math.max(1, expSec - now);
  await set(keyForJti(jti), 1, ttl);
}

export async function isAccessJtiRevoked(jti) {
  if (!jti) return false;
  const v = await get(keyForJti(jti));
  return v != null;
}
