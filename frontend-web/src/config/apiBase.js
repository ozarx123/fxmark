/**
 * API base for fetch() calls.
 *
 * - If `VITE_API_URL` is set (see `.env`, `.env.local`, or mode-specific `.env.*`), that wins — including in `vite` dev.
 *   Point it at the same backend where Zoho / DB are configured (e.g. local `http://localhost:3000/api` or your Cloud Run URL).
 * - If unset in dev: uses `/api` → Vite proxy → `http://localhost:3000` (see `vite.config.js`).
 * - Production build without `VITE_API_URL`: falls back to `PROD_API_BASE`.
 *
 * Common pitfall: `test-email.js` uses **local** `backend/.env`, but the SPA hits **Cloud Run** if `VITE_API_URL` is the deployed API → different env → e.g. 535 on resend while local test works.
 */
export const PROD_API_BASE = 'https://fxmark-backend-541368249845.us-central1.run.app/api';

export function getApiBase() {
  const v = import.meta.env.VITE_API_URL || '';
  if (v) return v.replace(/\/+$/, '');
  if (import.meta.env.DEV) return '/api';
  return PROD_API_BASE;
}

export function getApiOrigin() {
  return getApiBase().replace(/\/api\/?$/, '');
}
