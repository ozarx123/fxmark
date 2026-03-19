import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import config from '../../config/env.config.js';
import userRepo from '../users/user.repository.js';
import { getDb } from '../../config/mongo.js';
import emailService from '../email/email.service.js';

const REFRESH_COLLECTION = 'refresh_tokens';
const VERIFICATION_COLLECTION = 'email_verification_tokens';

function getVerificationExpiryMs() {
  const n = parseInt(process.env.EMAIL_VERIFICATION_EXPIRY_MS || '', 10);
  if (!Number.isNaN(n) && n > 0) return n;
  return 60 * 60 * 1000; // 1 hour default
}

function getWebAppBaseUrlForEmail() {
  const base = (config.frontendBaseUrl || '').trim().replace(/\/$/, '');
  if (!base) {
    throw new Error('FRONTEND_URL must be set for email verification links');
  }
  return base;
}

function buildVerificationEmailLink(token) {
  const base = getWebAppBaseUrlForEmail().replace(/\/$/, '');
  return `${base}/verify-email?token=${encodeURIComponent(token)}`;
}

async function verificationCollection() {
  const db = await getDb();
  return db.collection(VERIFICATION_COLLECTION);
}

/** Remove legacy tokens (old flow) so only the user document token is valid. */
async function purgeLegacyVerificationTokens(userId) {
  if (!userId) return;
  try {
    const col = await verificationCollection();
    await col.deleteMany({ userId });
  } catch (e) {
    console.warn('[auth] purgeLegacyVerificationTokens:', e.message);
  }
}

/** Store a new opaque token on the user; overwrites any previous token. */
async function assignVerificationTokenToUser(userId) {
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + getVerificationExpiryMs());
  await userRepo.updateById(userId, {
    emailVerificationToken: token,
    emailVerificationExpires: expiresAt,
  });
  await purgeLegacyVerificationTokens(userId);
  return token;
}

/** Legacy: one-time token collection (still honored in verifyEmail for old links). */
async function consumeVerificationToken(token) {
  const col = await verificationCollection();
  const doc = await col.findOneAndDelete({ token });
  return doc || null;
}

async function sendVerificationEmail(email, token) {
  const link = buildVerificationEmailLink(token);
  const expiryLabel =
    getVerificationExpiryMs() >= 24 * 60 * 60 * 1000
      ? `${Math.round(getVerificationExpiryMs() / (24 * 60 * 60 * 1000))} day(s)`
      : `${Math.round(getVerificationExpiryMs() / (60 * 1000))} minutes`;
  const subject = 'Verify your email — FXMARK';
  const html = `
    <p>Thanks for signing up. Please verify your email by clicking the link below.</p>
    <p><a href="${link}">Verify email</a></p>
    <p>Link: ${link}</p>
    <p>This link expires in ${expiryLabel}.</p>
    <p>If you didn't create an account, you can ignore this email.</p>
  `;
  const result = await emailService.sendMail({ to: email, subject, html, text: `Verify your email: ${link}` });
  return result;
}
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
    const ibProfile = await ibRepo.getProfileByReferralCode(ref) ||
      await ibRepo.getProfileByUserId(ref) ||
      await ibRepo.getProfileById(ref);
    if (ibProfile && ibProfile.userId != null) referrerId = String(ibProfile.userId);
  }
  const userId = await userRepo.createOne({
    email,
    passwordHash,
    name,
    role: payload.role || 'user',
    kycStatus: payload.kycStatus || 'pending',
    profileComplete: false,
    emailVerified: false,
    ...(referrerId && { referrerId }),
  });
  const user = await userRepo.findById(userId);
  // Send verification email (non-blocking; do not fail registration if email fails)
  try {
    const token = await assignVerificationTokenToUser(userId);
    await sendVerificationEmail(email, token);
  } catch (e) {
    console.warn('[auth] Verification email send failed:', e.message);
  }
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
  if (user.emailVerified !== true) {
    const err = new Error('Email not verified');
    err.statusCode = 403;
    err.code = 'EMAIL_NOT_VERIFIED';
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
  if (user.emailVerified !== true) {
    const err = new Error('Email not verified');
    err.statusCode = 403;
    err.code = 'EMAIL_NOT_VERIFIED';
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
  const { passwordHash, investorPasswordHash, emailVerificationToken, emailVerificationExpires, ...safe } = user;
  return safe;
}

async function verifyEmail(token) {
  if (!token || typeof token !== 'string' || !String(token).trim()) {
    const err = new Error('Verification token is required');
    err.statusCode = 400;
    err.code = 'TOKEN_REQUIRED';
    err.hint = 'Use the link from your email or request a new verification email.';
    throw err;
  }
  const t = token.trim();

  // Primary: token on user document (atomic update — safe under concurrent requests)
  const primary = await userRepo.completeEmailVerificationByToken(t);
  if (primary.ok) {
    if (primary.alreadyVerified) {
      return {
        verified: true,
        alreadyVerified: true,
        message: 'Your email is already verified.',
        user: sanitizeUser(primary.user),
      };
    }
    return { verified: true, user: sanitizeUser(primary.user) };
  }
  if (primary.reason === 'expired') {
    const err = new Error('This verification link has expired. Please request a new verification email.');
    err.statusCode = 400;
    err.code = 'TOKEN_EXPIRED';
    err.hint = 'Use “Resend verification email” on the sign-in page.';
    throw err;
  }

  // Legacy: token in email_verification_tokens (emails sent before user-field migration)
  const doc = await consumeVerificationToken(t);
  if (!doc) {
    const err = new Error('Invalid verification link. It may have been used already or is incorrect.');
    err.statusCode = 400;
    err.code = 'TOKEN_INVALID';
    err.hint = 'Request a new verification email from the sign-in page.';
    throw err;
  }
  if (new Date() > new Date(doc.expiresAt)) {
    const err = new Error('This verification link has expired. Please request a new verification email.');
    err.statusCode = 400;
    err.code = 'TOKEN_EXPIRED';
    err.hint = 'Use “Resend verification email” on the sign-in page.';
    throw err;
  }
  const user = await userRepo.updateById(doc.userId, {
    emailVerified: true,
    emailVerificationToken: null,
    emailVerificationExpires: null,
  });
  if (!user) {
    const err = new Error('User not found');
    err.statusCode = 404;
    throw err;
  }
  await purgeLegacyVerificationTokens(doc.userId);
  return { verified: true, user: sanitizeUser(user) };
}

async function resendVerificationEmail(email) {
  const e = (email || '').toLowerCase().trim();
  if (!e) {
    const err = new Error('Email is required');
    err.statusCode = 400;
    throw err;
  }
  const user = await userRepo.findByEmail(e);
  if (!user) {
    const err = new Error('No account found with this email');
    err.statusCode = 404;
    throw err;
  }
  if (user.emailVerified) {
    const err = new Error('Email is already verified');
    err.statusCode = 400;
    throw err;
  }
  try {
    const token = await assignVerificationTokenToUser(user.id);
    const result = await sendVerificationEmail(e, token);
    if (!result.sent) {
      const err = new Error(result.error || 'Failed to send verification email');
      err.statusCode = 502;
      throw err;
    }
    return { sent: true, message: 'Verification email sent' };
  } catch (err) {
    if (err.statusCode) throw err;
    const wrap = new Error('Failed to send verification email');
    wrap.statusCode = 502;
    wrap.cause = err;
    throw wrap;
  }
}

/** Change main password (requires current password). */
async function changePassword(userId, currentPassword, newPassword) {
  if (!userId) {
    const err = new Error('Unauthorized');
    err.statusCode = 401;
    throw err;
  }
  const user = await userRepo.findByIdWithPasswordHashes(userId);
  if (!user || !user.passwordHash) {
    const err = new Error('User not found');
    err.statusCode = 404;
    throw err;
  }
  const ok = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!ok) {
    const err = new Error('Current password is incorrect');
    err.statusCode = 400;
    throw err;
  }
  const pwdErr = validatePassword(newPassword, true);
  if (pwdErr) {
    const err = new Error(pwdErr);
    err.statusCode = 400;
    throw err;
  }
  const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  await userRepo.updateById(userId, { passwordHash });
  return { success: true, message: 'Password updated' };
}

/** Change investor password (for trader/assistant access). Requires current investor password. */
async function changeInvestorPassword(userId, currentInvestorPassword, newInvestorPassword) {
  if (!userId) {
    const err = new Error('Unauthorized');
    err.statusCode = 401;
    throw err;
  }
  const user = await userRepo.findByIdWithPasswordHashes(userId);
  if (!user) {
    const err = new Error('User not found');
    err.statusCode = 404;
    throw err;
  }
  if (!user.investorPasswordHash) {
    const err = new Error('Investor password is not set');
    err.statusCode = 400;
    throw err;
  }
  const ok = await bcrypt.compare(currentInvestorPassword, user.investorPasswordHash);
  if (!ok) {
    const err = new Error('Current investor password is incorrect');
    err.statusCode = 400;
    throw err;
  }
  const pwdErr = validatePassword(newInvestorPassword, true);
  if (pwdErr) {
    const err = new Error(pwdErr);
    err.statusCode = 400;
    throw err;
  }
  const investorPasswordHash = await bcrypt.hash(newInvestorPassword, SALT_ROUNDS);
  await userRepo.updateById(userId, { investorPasswordHash });
  return { success: true, message: 'Investor password updated' };
}

export default {
  register,
  login,
  refresh,
  logout,
  me,
  verifyEmail,
  resendVerificationEmail,
  changePassword,
  changeInvestorPassword,
  signToken: signAccessToken,
};
