/**
 * Blocks most /api traffic with 503 when platform maintenance is active.
 * Exempt: /api/platform/maintenance, /api/health, GET /api/market/* (read-only quotes/candles), auth flows, JWT with staff roles.
 */
import * as maintenanceService from '../modules/admin/maintenance.service.js';
import { optionalAuthenticate } from './middleware.js';

const BYPASS = maintenanceService.MAINTENANCE_BYPASS_ROLES;

function apiSubPath(req) {
  let p = req.path;
  if (p && p !== '/') p = p.replace(/\/+$/, '') || '/';
  else {
    const u = (req.url || '').split('?')[0];
    p = (u.replace(/\/+$/, '') || '/');
  }
  // Mounted at /api: path is usually /admin/...; if full path slipped through, normalize
  if (p.startsWith('/api/')) p = p.slice(4) || '/';
  return p;
}

function normalizeStaffRole(role) {
  if (role == null || role === '') return '';
  return String(role).trim().toLowerCase().replace(/\s+/g, '_');
}

function runOptionalAuth(req, res) {
  return new Promise((resolve, reject) => {
    optionalAuthenticate(req, res, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

export async function maintenanceApiGate(req, res, next) {
  if (req.method === 'OPTIONS') return next();

  const p = apiSubPath(req);

  if (p === '/platform/maintenance' || p === '/health') return next();
  if (p === '/webhooks/nowpayments') return next();
  // Read-only market routes: candles/quotes have no account data; allow charts/tickers during maintenance
  if (req.method === 'GET' && (p === '/market/candles' || p === '/market/quote' || p.startsWith('/market/'))) {
    return next();
  }

  let active;
  let message;
  try {
    active = await maintenanceService.isActive();
    message = maintenanceService.getPublicMessage();
  } catch {
    return next();
  }

  if (!active) return next();

  try {
    await runOptionalAuth(req, res);
  } catch {
    // continue as anonymous
  }

  const role = normalizeStaffRole(req.user?.role);
  if (role && BYPASS.has(role)) return next();

  const authPostAllow = new Set(['/auth/login', '/auth/forgot-password', '/auth/refresh']);
  if (authPostAllow.has(p) && req.method === 'POST') return next();
  if (p === '/auth/reset-password' || p.startsWith('/auth/reset-password')) return next();
  if (p.startsWith('/auth/verify-email') || p.startsWith('/auth/resend')) return next();

  if ((p === '/auth/register' || p === '/auth/signup') && req.method === 'POST') {
    return res.status(503).json({ error: 'Platform maintenance', maintenance: true, message });
  }
  if (p.startsWith('/auth/')) return next();

  return res.status(503).json({ error: 'Platform maintenance', maintenance: true, message });
}
