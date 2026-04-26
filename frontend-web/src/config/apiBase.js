/**
 * API base for fetch() calls.
 *
 * - If `VITE_API_URL` is set (see `.env`, `.env.local`, or mode-specific `.env.*`), that wins — including in `vite` dev.
 *   Point it at the same backend where Zoho / DB are configured (e.g. local `http://localhost:3000/api` or your Cloud Run URL).
 * - If unset in dev: uses `/api` → Vite proxy → `http://localhost:3000` (see `vite.config.js`).
 * - Production build without `VITE_API_URL`: falls back to `PROD_API_BASE`.
 *
 * Common pitfall: `test-email.js` uses **local** `backend/.env`, but the SPA hits **Cloud Run** if `VITE_API_URL` is the deployed API → different env → e.g. 535 on resend while local test works.
 *
 * **Stale baked URLs:** CI/Vercel can embed an old `VITE_API_URL`. If that host is gone (503, no CORS), the browser
 * shows misleading CORS errors. Known-dead hosts are ignored so production falls back to `PROD_API_BASE`.
 */
export const PROD_API_BASE = 'https://fxmark-backend-77025790101.us-central1.run.app/api';

/** Retired API hosts still baked into old bundles — ignored so `getApiBase()` uses `PROD_API_BASE`. */
const STALE_BAKED_API_HOSTS = ['fxmark-backend-541368249845.us-central1.run.app'];

/** Production web app hostnames that must always use `PROD_API_BASE` (ignores wrong `VITE_API_URL` from CI). */
const CANONICAL_API_HOSTNAMES = ['fxmarktrade.com', 'www.fxmarktrade.com'];

function viteApiUrlIsStale(url) {
  const u = String(url || '').trim();
  if (!u) return false;
  return STALE_BAKED_API_HOSTS.some((host) => u.includes(host));
}

function isFxmarktradeProductionPortal() {
  if (typeof window === 'undefined') return false;
  const h = window.location.hostname.toLowerCase();
  return CANONICAL_API_HOSTNAMES.includes(h);
}

export function getApiBase() {
  if (import.meta.env.PROD && isFxmarktradeProductionPortal()) {
    return PROD_API_BASE.replace(/\/+$/, '');
  }
  let v = (import.meta.env.VITE_API_URL || '').trim();
  if (viteApiUrlIsStale(v)) v = '';
  if (v) return v.replace(/\/+$/, '');
  if (import.meta.env.DEV) return '/api';
  return PROD_API_BASE;
}

export function getApiOrigin() {
  return getApiBase().replace(/\/api\/?$/, '');
}
