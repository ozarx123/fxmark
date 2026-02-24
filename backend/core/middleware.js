/**
 * Global middleware (ESM)
 */
import jwtStrategy from '../modules/auth/jwt.strategy.js';
import userRepo from '../modules/users/user.repository.js';
import { getDb } from '../config/mongo.js';

let dbCheckLast = 0;
let dbCheckOk = true;
const DB_CHECK_TTL_MS = 5000;

/** Returns 503 if MongoDB is unavailable (cached 5s). Skips /auth/login, /auth/register, /auth/signup. */
export const requireDb = async (req, res, next) => {
  const path = req.path || '';
  if (path === '/health') return next();
  const now = Date.now();
  if (now - dbCheckLast < DB_CHECK_TTL_MS) {
    if (!dbCheckOk) return res.status(503).json({ error: 'Database unavailable. Check CONNECTION_STRING in backend/.env and ensure MongoDB is running.' });
    return next();
  }
  try {
    if (!process.env.CONNECTION_STRING && !process.env.MONGODB_URI) {
      dbCheckOk = false;
      dbCheckLast = now;
      return res.status(503).json({ error: 'Database not configured. Set CONNECTION_STRING in backend/.env' });
    }
    const db = await getDb();
    await db.admin().command({ ping: 1 });
    dbCheckOk = true;
    dbCheckLast = now;
    next();
  } catch (err) {
    dbCheckOk = false;
    dbCheckLast = now;
    console.error('[requireDb]', err.message);
    res.status(503).json({
      error: 'Database unavailable. Check CONNECTION_STRING in backend/.env and ensure MongoDB is running.',
      detail: err.message,
    });
  }
};

export const requestId = (req, res, next) => {
  req.id = req.headers['x-request-id'] || `req-${Date.now()}`;
  res.setHeader('x-request-id', req.id);
  next();
};

export const authenticate = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    const payload = jwtStrategy.decode(token);
    if (!payload) return res.status(401).json({ error: 'Invalid token' });
    req.user = payload;
    if (!payload.role && payload.id) {
      const user = await userRepo.findById(payload.id);
      if (user) req.user.role = user.role || 'user';
    }
    next();
  } catch (e) {
    next(e);
  }
};

function isDbError(err) {
  const m = (err.message || '').toLowerCase();
  return (
    m.includes('mongodb') ||
    m.includes('mongo') ||
    m.includes('connection_string') ||
    m.includes('connection refused') ||
    m.includes('econnrefused') ||
    m.includes('ssl') ||
    m.includes('tls') ||
    m.includes('authentication failed') ||
    m.includes('not set in .env')
  );
}

export const errorHandler = (err, req, res, next) => {
  const status = err.statusCode || 500;
  let msg = err.message || 'Internal Server Error';

  if (status >= 500) {
    console.error(`[${req.id}] ${req.method} ${req.path} → ${status}:`, err.message);
    if (err.stack) console.error(err.stack);
    if (isDbError(err)) {
      msg = 'Database unavailable. Check CONNECTION_STRING in backend/.env and ensure MongoDB is running.';
    }
  }

  res.status(status).json({
    error: msg,
    message: msg,
    requestId: req.id,
  });
};

export default { requestId, authenticate, errorHandler };
