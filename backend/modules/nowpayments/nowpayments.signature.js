/**
 * NOWPayments IPN: HMAC-SHA512 verification.
 * Primary: raw request body. Fallback: sorted JSON (recursive key sort).
 */
import crypto from 'crypto';

function sortKeysDeep(value) {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  const sorted = {};
  for (const k of Object.keys(value).sort()) {
    sorted[k] = sortKeysDeep(value[k]);
  }
  return sorted;
}

function timingSafeEqualHex(a, b) {
  const x = String(a || '').trim().toLowerCase();
  const y = String(b || '').trim().toLowerCase();
  if (!/^[0-9a-f]+$/.test(x) || !/^[0-9a-f]+$/.test(y) || x.length !== y.length) {
    return false;
  }
  try {
    const bx = Buffer.from(x, 'hex');
    const by = Buffer.from(y, 'hex');
    if (bx.length !== by.length) return false;
    return crypto.timingSafeEqual(bx, by);
  } catch {
    return false;
  }
}

/**
 * @param {object} opts
 * @param {object} [opts.body] Parsed JSON body
 * @param {Buffer} [opts.rawBody] Raw request body
 * @param {string} opts.secret IPN secret from NOWPayments dashboard
 * @param {string} [opts.headerSig] x-nowpayments-sig header
 */
export function verifyNowpaymentsIpnSignature({ body, rawBody, secret, headerSig }) {
  if (!secret || typeof secret !== 'string' || !headerSig) return false;

  const candidates = [];
  if (Buffer.isBuffer(rawBody) && rawBody.length > 0) {
    candidates.push(rawBody);
  }
  if (body && typeof body === 'object') {
    const sorted = sortKeysDeep(body);
    candidates.push(Buffer.from(JSON.stringify(sorted), 'utf8'));
  }

  for (const buf of candidates) {
    const h = crypto.createHmac('sha512', secret).update(buf).digest('hex');
    if (timingSafeEqualHex(h, headerSig)) return true;
  }
  return false;
}

export { sortKeysDeep };
