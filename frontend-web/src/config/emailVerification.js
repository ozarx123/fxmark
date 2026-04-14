/**
 * When false (set VITE_EMAIL_VERIFICATION_REQUIRED=false), the SPA does not require
 * verified email for routing or post-signup — align with backend EMAIL_VERIFICATION_REQUIRED.
 */
export function isEmailVerificationRequired() {
  const v = import.meta.env.VITE_EMAIL_VERIFICATION_REQUIRED;
  if (v === undefined || v === '') return true;
  const s = String(v).trim().toLowerCase();
  if (['0', 'false', 'no', 'off'].includes(s)) return false;
  return true;
}
