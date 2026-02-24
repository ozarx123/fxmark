import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import config from '../../config/env.config.js';
import userRepo from '../users/user.repository.js';
import { getDb } from '../../config/mongo.js';

const REFRESH_COLLECTION = 'refresh_tokens';
const SALT_ROUNDS = 10;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_MIN_LEN = 8;

async function refreshCollection() {
  const db = await getDb();
  return db.collection(REFRESH_COLLECTION);
}

function signAccessToken(payload) {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: config.jwtExpiry });
}

function signRefreshToken(payload) {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: config.jwtRefreshExpiry });
}

function validateEmail(email) {
  if (!email || typeof email !== 'string') return 'Email is required';
  const e = email.trim().toLowerCase();
  if (!e) return 'Email is required';
  if (!EMAIL_REGEX.test(e)) return 'Invalid email format';
  return null;
}

function validatePassword(password, isSignup = false) {
  if (!password || typeof password !== 'string') return 'Password is required';
  if (password.length < PASSWORD_MIN_LEN) return `Password must be at least ${PASSWORD_MIN_LEN} characters`;
  if (isSignup) {
    if (!/[A-Z]/.test(password)) return 'Password must contain at least one uppercase letter';
    if (!/[a-z]/.test(password)) return 'Password must contain at least one lowercase letter';
    if (!/[0-9]/.test(password)) return 'Password must contain at least one number';
  }
  return null;
}

async function register(payload) {
  const email = (payload.email || '').toLowerCase().trim();
  const password = payload.password;

  const emailErr = validateEmail(payload.email);
  if (emailErr) {
    const err = new Error(emailErr);
    err.statusCode = 400;
    throw err;
  }
  const pwdErr = validatePassword(password, true);
  if (pwdErr) {
    const err = new Error(pwdErr);
    err.statusCode = 400;
    throw err;
  }
  const existing = await userRepo.findByEmail(email);
  if (existing) {
    const err = new Error('Email already registered');
    err.statusCode = 409;
    throw err;
  }
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const name = (payload.name || '').trim() || email.split('@')[0];
  const ref = (payload.ref || '').trim();
  let referrerId = null;
  if (ref) {
    const ibRepo = (await import('../ib/ib.repository.js')).default;
    const ibProfile = await ibRepo.getProfileByUserId(ref) || await ibRepo.getProfileById(ref);
    if (ibProfile) referrerId = ibProfile.userId || ref;
  }
  const userId = await userRepo.createOne({
    email,
    passwordHash,
    name,
    role: payload.role || 'user',
    kycStatus: payload.kycStatus || 'pending',
    profileComplete: false,
    ...(referrerId && { referrerId }),
  });
  const user = await userRepo.findById(userId);
  const accessToken = signAccessToken({ id: userId, email: user.email, role: user.role || 'user' });
  const refreshToken = await createRefreshToken(userId);
  return { accessToken, refreshToken, user: sanitizeUser(user) };
}

async function login(payload) {
  const email = (payload.email || '').toLowerCase().trim();
  const password = payload.password;

  const emailErr = validateEmail(payload.email);
  if (emailErr) {
    const err = new Error(emailErr);
    err.statusCode = 400;
    throw err;
  }
  const pwdErr = validatePassword(password, false);
  if (pwdErr) {
    const err = new Error(pwdErr);
    err.statusCode = 400;
    throw err;
  }
  const user = await userRepo.findByEmailWithPassword(email);
  if (!user) {
    const err = new Error('Invalid email or password');
    err.statusCode = 401;
    throw err;
  }
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    const err = new Error('Invalid email or password');
    err.statusCode = 401;
    throw err;
  }
  const accessToken = signAccessToken({ id: user.id, email: user.email, role: user.role || 'user' });
  const refreshToken = await createRefreshToken(user.id);
  return { accessToken, refreshToken, user: sanitizeUser(user) };
}

async function createRefreshToken(userId) {
  const jti = randomBytes(24).toString('hex');
  const token = signRefreshToken({ id: userId, jti });
  const decoded = jwt.decode(token);
  const col = await refreshCollection();
  await col.insertOne({
    userId,
    jti,
    expiresAt: new Date(decoded.exp * 1000),
    createdAt: new Date(),
  });
  return token;
}

async function refresh(refreshToken) {
  if (!refreshToken) {
    const err = new Error('Refresh token is required');
    err.statusCode = 400;
    throw err;
  }
  let decoded;
  try {
    decoded = jwt.verify(refreshToken, config.jwtSecret);
  } catch {
    const err = new Error('Invalid or expired refresh token');
    err.statusCode = 401;
    throw err;
  }
  const col = await refreshCollection();
  const stored = await col.findOne({ jti: decoded.jti, userId: decoded.id });
  if (!stored) {
    const err = new Error('Refresh token invalid or revoked');
    err.statusCode = 401;
    throw err;
  }
  if (new Date() > stored.expiresAt) {
    await col.deleteOne({ jti: decoded.jti });
    const err = new Error('Refresh token expired');
    err.statusCode = 401;
    throw err;
  }
  await col.deleteOne({ jti: decoded.jti });
  const user = await userRepo.findById(decoded.id);
  if (!user) {
    const err = new Error('User not found');
    err.statusCode = 401;
    throw err;
  }
  const accessToken = signAccessToken({ id: user.id, email: user.email, role: user.role || 'user' });
  const newRefreshToken = await createRefreshToken(user.id);
  return { accessToken, refreshToken: newRefreshToken };
}

async function logout(userId, refreshToken) {
  if (!refreshToken) return;
  try {
    const decoded = jwt.decode(refreshToken);
    if (decoded?.jti) {
      const col = await refreshCollection();
      await col.deleteOne({ jti: decoded.jti });
    }
  } catch {}
}

async function me(userId) {
  if (!userId) {
    const err = new Error('Unauthorized');
    err.statusCode = 401;
    throw err;
  }
  const user = await userRepo.findById(userId);
  if (!user) {
    const err = new Error('User not found');
    err.statusCode = 404;
    throw err;
  }
  return sanitizeUser(user);
}

function sanitizeUser(user) {
  if (!user) return null;
  const { passwordHash, ...safe } = user;
  return safe;
}

export default {
  register,
  login,
  refresh,
  logout,
  me,
  signToken: signAccessToken,
};
