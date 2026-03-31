/**
 * Global middleware (ESM)
 */
import jwtStrategy from '../modules/auth/jwt.strategy.js';
import { isAccessJtiRevoked } from '../modules/auth/token-revocation.service.js';
import userRepo from '../modules/users/user.repository.js';
import { getDb } from '../config/mongo.js';

let dbCheckLast = 0;
let dbCheckOk = true;
/** Last ping failure message (for cached 503 detail in development). */
let dbCheckLastError = '';
const DB_CHECK_TTL_MS = 5000;

/** Returns 503 if MongoDB is unavailable (cached 5s). Skips /health on this router. */
export const requireDb = async (req, res, next) => {
  if (req.method === 'OPTIONS') return next();
  const path = req.path || '';
  if (path === '/health') return next();
  const now = Date.now();
  if (now - dbCheckLast < DB_CHECK_TTL_MS) {
    if (!dbCheckOk) {
      const body = {
        error: 'Database unavailable. Check CONNECTION_STRING in backend/.env and ensure MongoDB is running.',
      };
      if (process.env.NODE_ENV !== 'production' && dbCheckLastError) body.detail = dbCheckLastError;
      return res.status(503).json(body);
    }
    return next();
  }
  try {
    const hasUri =
      !!(process.env.CONNECTION_STRING && String(process.env.CONNECTION_STRING).trim()) ||
      !!(process.env.MONGODB_URI && String(process.env.MONGODB_URI).trim());
    if (!hasUri) {
      dbCheckOk = false;
      dbCheckLast = now;
      dbCheckLastError = 'CONNECTION_STRING / MONGODB_URI not set';
      return res.status(503).json({ error: 'Database not configured. Set CONNECTION_STRING in backend/.env' });
    }
    const db = await getDb();
    await db.admin().command({ ping: 1 });
    dbCheckOk = true;
    dbCheckLastError = '';
    dbCheckLast = now;
    next();
  } catch (err) {
    dbCheckOk = false;
    dbCheckLast = now;
    dbCheckLastError = err.message || String(err);
    console.error('[requireDb]', err.message);
    const body = {
      error: 'Database unavailable. Check CONNECTION_STRING in backend/.env and ensure MongoDB is running.',
    };
    if (process.env.NODE_ENV !== 'production') body.detail = err.message;
    res.status(503).json(body);
  }
};

export const requestId = (req, res, next) => {
  req.id = req.headers['x-request-id'] || `req-${Date.now()}`;
  res.setHeader('x-request-id', req.id);
  next();
};

/** Case-insensitive `Bearer <jwt>`; trims token (avoids silent 401 when clients send `bearer`). */
function parseBearerToken(req) {
  const h = req.headers.authorization;
  if (!h || typeof h !== 'string') return '';
  const m = h.match(/^\s*Bearer\s+(\S+)/i);
  return m ? String(m[1]).trim() : '';
}

export const authenticate = async (req, res, next) => {
  try {
    const token = parseBearerToken(req);
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized', reason: 'missing_authorization' });
    }
    const payload = jwtStrategy.decode(token);
    if (!payload) {
      return res.status(401).json({ error: 'Invalid token', reason: 'invalid_or_expired_token' });
    }
    if (payload.jti && (await isAccessJtiRevoked(payload.jti))) {
      return res.status(401).json({ error: 'Token revoked', reason: 'token_revoked' });
    }
    const uid = payload.id ?? payload.sub ?? payload.userId ?? payload._id;
    if (uid == null || uid === '') {
      return res.status(401).json({ error: 'Invalid token', reason: 'token_missing_subject' });
    }
    req.user = { ...payload, id: String(uid) };
    if (!payload.role && req.user.id) {
      const user = await userRepo.findById(req.user.id);
      if (user) req.user.role = user.role || 'user';
    }
    next();
  } catch (e) {
    next(e);
  }
};

/** Like authenticate but does not require a token; sets req.user only when token is valid. */
export const optionalAuthenticate = async (req, res, next) => {
  try {
    const token = parseBearerToken(req);
    if (!token) return next();
    const payload = jwtStrategy.decode(token);
    if (!payload) return next();
    if (payload.jti && (await isAccessJtiRevoked(payload.jti))) return next();
    const uid = payload.id ?? payload.sub ?? payload.userId ?? payload._id;
    if (uid == null || uid === '') return next();
    req.user = { ...payload, id: String(uid) };
    if (!payload.role && req.user.id) {
      const user = await userRepo.findById(req.user.id);
      if (user) req.user.role = user.role || 'user';
    }
    next();
  } catch (e) {
    next(e);
  }
};

/** MongoDB driver errors use names like MongoServerError, MongoNetworkError, MongoServerSelectionError, … */
function isMongoDriverErrorName(err) {
  const n = err && err.name;
  return typeof n === 'string' && /^Mongo[A-Z]/.test(n);
}

/** Walk a short cause chain (wrapped errors from resend / nodemailer). */
function errorMessageChain(err, maxDepth = 5) {
  const parts = [];
  let e = err;
  for (let i = 0; i < maxDepth && e; i++) {
    if (e.message) parts.push(String(e.message));
    e = e.cause;
  }
  return parts.join(' \n ');
}

/**
 * True when the error likely indicates MongoDB connectivity / driver issues (safe to show generic DB hint).
 * Excludes SMTP/email transport (nodemailer, 535, etc.) so resend-verification failures are not mislabeled.
 */
function isMongoConnectivityError(err) {
  const m = (err.message || '').toLowerCase();
  const chain = errorMessageChain(err).toLowerCase();
  if (!m && !chain) return false;
  // Do not treat email/SMTP failures as DB unavailable (message or wrapped cause)
  if (
    chain.includes('smtp') ||
    chain.includes('nodemailer') ||
    chain.includes('535') ||
    chain.includes('invalid login') ||
    (chain.includes('zoho') && (chain.includes('mail') || chain.includes('smtp'))) ||
    /eauth|etls|certificate/i.test(chain)
  ) {
    return false;
  }
  // MongoServerError includes duplicate key (11000), validation, etc. — not "DB unreachable"
  if (err?.name === 'MongoServerError') return false;
  if (isMongoDriverErrorName(err)) return true;
  return (
    m.includes('mongodb') ||
    m.includes('mongodb+srv') ||
    m.includes('mongodb.net') ||
    m.includes('connection_string') ||
    m.includes('connection refused') ||
    (m.includes('econnrefused') && (m.includes('27017') || m.includes('mongodb'))) ||
    m.includes('not set in .env') ||
    m.includes('server selection timed out') ||
    m.includes('wait queue timeout') ||
    (m.includes('ssl') && (m.includes('mongodb') || m.includes('mongo.net'))) ||
    (m.includes('tls') && (m.includes('mongodb') || m.includes('mongo.net'))) ||
    (m.includes('authentication failed') && (m.includes('mongodb') || m.includes('atlas') || m.includes('mongo.net')))
  );
}

/** Resend flow wraps failures as 502; never replace with generic DB hint when the app wrapped a downstream error. */
function isResendVerificationWrappedError(err) {
  const msg = (err.message || '').toLowerCase();
  return msg.includes('failed to send verification email') && err.cause != null;
}

export const errorHandler = (err, req, res, next) => {
  // Match Express: many libraries set `status`, others set `statusCode` (http-errors sets both).
  const raw = err.statusCode ?? err.status;
  let status = 500;
  if (typeof raw === 'number' && raw >= 400 && raw < 600) status = raw;
  else if (typeof raw === 'string' && /^\d{3}$/.test(raw)) {
    const n = parseInt(raw, 10);
    if (n >= 400 && n < 600) status = n;
  }
  const originalMessage = err.message || 'Internal Server Error';
  let msg = originalMessage;

  const isProd = process.env.NODE_ENV === 'production';
  const is5xx = status >= 500;

  if (is5xx) {
    console.error(`[${req.id}] ${req.method} ${req.path} → ${status}:`, originalMessage);
    if (err.stack) console.error(err.stack);
    // 502 = upstream/email in this app — never replace with generic Mongo message
    // 503 = typically requireDb — not produced here with same shape
    const allowGenericDbMessage =
      status !== 502 &&
      status !== 503 &&
      !isResendVerificationWrappedError(err) &&
      isMongoConnectivityError(err);
    if (allowGenericDbMessage) {
      msg = 'Database unavailable. Check CONNECTION_STRING in backend/.env and ensure MongoDB is running.';
    }
  }

  const body = isProd
    ? { error: msg }
    : {
        error: msg,
        message: msg,
        requestId: req.id,
      };
  if (!isProd && is5xx && originalMessage) {
    body.detail = originalMessage;
    if (err.cause && typeof err.cause.message === 'string') {
      body.detailCause = err.cause.message;
    }
  }
  if (err.code) body.code = err.code;
  if (err.hint) body.hint = err.hint;
  if (body.stack) delete body.stack;
  res.status(status).json(body);
};

export default { requestId, authenticate, errorHandler };
