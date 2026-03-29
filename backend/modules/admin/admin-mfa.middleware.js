import { authenticator } from 'otplib';

/**
 * When ADMIN_MFA_TOTP_SECRET is set (base32 from `otplib` / authenticator apps),
 * every admin API request must include a valid current TOTP in header
 * `X-Admin-Mfa` or `X-Admin-Mfa-Code`.
 *
 * One shared secret is suitable for a small team; prefer per-user enrollment for larger orgs.
 */
export function requireAdminMfaIfConfigured(req, res, next) {
  const secret = (process.env.ADMIN_MFA_TOTP_SECRET || '').trim().replace(/\s+/g, '');
  if (!secret) return next();

  const raw = req.headers['x-admin-mfa'] || req.headers['x-admin-mfa-code'];
  const code = typeof raw === 'string' ? raw.trim() : Array.isArray(raw) ? String(raw[0] || '').trim() : '';

  if (!code || !authenticator.check(code, secret)) {
    return res.status(401).json({
      error: 'Valid admin MFA code required',
      code: 'ADMIN_MFA_REQUIRED',
      hint: 'Send current TOTP in header X-Admin-Mfa (same secret as ADMIN_MFA_TOTP_SECRET).',
    });
  }
  next();
}
