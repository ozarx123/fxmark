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
