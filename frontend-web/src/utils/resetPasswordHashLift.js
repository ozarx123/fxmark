/**
 * Email links use `origin/#/reset-password?token=…` so hosts that only serve `/` still load the SPA.
 * Call once before react-router initializes so the real pathname is `/reset-password?…`.
 */
export function liftPasswordResetHashFromUrl() {
  try {
    const h = window.location.hash;
    if (!h || h.length < 2) return;
    const inner = h.slice(1);
    const pathPart = inner.split('?')[0];
    const queryPart = inner.includes('?') ? inner.slice(inner.indexOf('?')) : '';
    if (pathPart !== 'reset-password' && pathPart !== '/reset-password') return;
    window.history.replaceState(null, '', `/reset-password${queryPart}`);
  } catch (e) {
    console.warn('[auth] liftPasswordResetHashFromUrl', e);
  }
}
