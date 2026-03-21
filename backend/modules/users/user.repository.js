import { getDb } from '../../config/mongo.js';
import { ObjectId } from 'mongodb';

const COLLECTION = 'users';

let indexEnsured = false;
async function ensureIndex() {
  if (indexEnsured) return;
  const col = await collection();
  await col.createIndex({ email: 1 }, { unique: true });
  indexEnsured = true;
}

async function collection() {
  const db = await getDb();
  return db.collection(COLLECTION);
}

function generateAccountNo() {
  return 'FX' + String(Math.floor(10000000 + Math.random() * 90000000));
}

async function createOne(doc, options = {}) {
  await ensureIndex();
  const col = await collection();
  const accountNo = doc.accountNo !== undefined && doc.accountNo !== null && doc.accountNo !== ''
    ? String(doc.accountNo)
    : generateAccountNo();
  const createdAt = doc.createdAt instanceof Date ? doc.createdAt : new Date();
  const updatedAt = doc.updatedAt instanceof Date ? doc.updatedAt : new Date();
  const { createdAt: _c, updatedAt: _u, ...rest } = doc;
  const insertOpts = options.session ? { session: options.session } : {};
  const { insertedId } = await col.insertOne(
    {
      ...rest,
      accountNo,
      createdAt,
      updatedAt,
    },
    insertOpts
  );
  return insertedId.toString();
}

async function findByEmail(email) {
  const col = await collection();
  const user = await col.findOne({ email: (email || '').toLowerCase().trim() });
  return user ? toUser(user) : null;
}

async function findByAccountNo(accountNo) {
  if (!accountNo || typeof accountNo !== 'string') return null;
  const col = await collection();
  const normalized = accountNo.trim().toUpperCase();
  const user = await col.findOne({ accountNo: normalized });
  return user ? toUser(user) : null;
}

/** Find user by accountNo exactly as stored (no normalization). For bulk import duplicate check. */
async function findByAccountNoExact(accountNo) {
  if (accountNo == null) return null;
  const col = await collection();
  const user = await col.findOne({ accountNo: String(accountNo) });
  return user ? toUser(user) : null;
}

/** Find user by referralCode (CRM referral code). For bulk import Refer By resolution. */
async function findByReferralCode(referralCode) {
  if (!referralCode || typeof referralCode !== 'string') return null;
  const col = await collection();
  const code = referralCode.trim();
  if (!code) return null;
  const user = await col.findOne({ referralCode: code });
  return user ? toUser(user) : null;
}

async function ensureAccountNo(userId) {
  const user = await findById(userId);
  if (!user || user.accountNo) return user;
  const col = await collection();
  const accountNo = generateAccountNo();
  if (!ObjectId.isValid(userId)) return user;
  await col.updateOne(
    { _id: new ObjectId(userId) },
    { $set: { accountNo, updatedAt: new Date() } }
  );
  return { ...user, accountNo };
}

async function findById(id) {
  if (!id) return null;
  const col = await collection();
  let _id;
  try {
    _id = ObjectId.isValid(id) ? new ObjectId(id) : null;
  } catch {
    return null;
  }
  if (!_id) return null;
  const user = await col.findOne({ _id });
  return user ? toUser(user) : null;
}

/** Get user by id with password hashes (for auth change-password flows). Do not expose to API. */
async function findByIdWithPasswordHashes(id) {
  if (!id) return null;
  const col = await collection();
  let _id;
  try {
    _id = ObjectId.isValid(id) ? new ObjectId(id) : null;
  } catch {
    return null;
  }
  if (!_id) return null;
  const user = await col.findOne({ _id });
  return user ? { id: user._id.toString(), ...user, _id: undefined } : null;
}

async function updateById(id, update) {
  if (!id) return null;
  const col = await collection();
  const _id = new ObjectId(id);
  const $set = { updatedAt: new Date() };
  const $unset = {};
  for (const [k, v] of Object.entries(update || {})) {
    if (v === null || v === undefined) {
      $unset[k] = '';
    } else {
      $set[k] = v;
    }
  }
  const ops = { $set };
  if (Object.keys($unset).length) ops.$unset = $unset;
  const result = await col.findOneAndUpdate({ _id }, ops, { returnDocument: 'after' });
  return result ? toUser(result) : null;
}

function toUser(row) {
  if (!row) return null;
  const {
    _id,
    passwordHash,
    investorPasswordHash,
    emailVerificationToken,
    emailVerificationExpires,
    passwordResetToken,
    passwordResetExpires,
    ...rest
  } = row;
  return { id: _id.toString(), ...rest };
}

function toUserWithHash(row) {
  if (!row) return null;
  const { _id, ...rest } = row;
  return { id: _id.toString(), ...rest };
}

async function findByEmailWithPassword(email) {
  const col = await collection();
  const user = await col.findOne({ email: (email || '').toLowerCase().trim() });
  return user ? toUserWithHash(user) : null;
}

/**
 * Atomically verify email: match token, not yet verified, not expired → set verified and clear token.
 * @returns {Promise<{ ok: true, user: object } | { ok: true, alreadyVerified: true, user: object } | { ok: false, reason: 'expired'|'not_found' }>}
 */
async function completeEmailVerificationByToken(token) {
  if (!token || typeof token !== 'string') return { ok: false, reason: 'not_found' };
  const t = token.trim();
  if (!t) return { ok: false, reason: 'not_found' };
  const col = await collection();
  const now = new Date();

  const updated = await col.findOneAndUpdate(
    {
      emailVerificationToken: t,
      emailVerified: { $ne: true },
      emailVerificationExpires: { $gt: now },
    },
    {
      $set: { emailVerified: true, updatedAt: now },
      $unset: { emailVerificationToken: '', emailVerificationExpires: '' },
    },
    { returnDocument: 'after' }
  );

  if (updated) {
    return { ok: true, user: toUser(updated) };
  }

  const still = await col.findOne(
    { emailVerificationToken: t },
    { projection: { emailVerified: 1, emailVerificationExpires: 1 } }
  );
  if (still) {
    if (still.emailVerified === true) {
      const full = await col.findOne(
        { _id: still._id },
        { projection: { passwordHash: 0, investorPasswordHash: 0 } }
      );
      await col.updateOne(
        { _id: still._id },
        { $unset: { emailVerificationToken: '', emailVerificationExpires: '' }, $set: { updatedAt: new Date() } }
      );
      return { ok: true, alreadyVerified: true, user: toUser(full) };
    }
    const exp = still.emailVerificationExpires ? new Date(still.emailVerificationExpires) : null;
    if (!exp || exp <= now) {
      await col.updateOne(
        { _id: still._id },
        { $unset: { emailVerificationToken: '', emailVerificationExpires: '' }, $set: { updatedAt: now } }
      );
      return { ok: false, reason: 'expired' };
    }
  }

  return { ok: false, reason: 'not_found' };
}

/**
 * Apply new password hash when passwordResetToken matches and is not expired; clears reset fields.
 * @returns {Promise<{ ok: true, user: object } | { ok: false, reason: 'expired'|'invalid' }>}
 */
async function resetPasswordWithToken(token, passwordHash) {
  const col = await collection();
  const now = new Date();
  const t = (token || '').trim();
  if (!t) return { ok: false, reason: 'invalid' };

  const updated = await col.findOneAndUpdate(
    {
      passwordResetToken: t,
      passwordResetExpires: { $gt: now },
    },
    {
      $set: { passwordHash, updatedAt: now },
      $unset: { passwordResetToken: '', passwordResetExpires: '' },
    },
    { returnDocument: 'after' }
  );

  if (updated) {
    return { ok: true, user: toUser(updated) };
  }

  const still = await col.findOne(
    { passwordResetToken: t },
    { projection: { passwordResetExpires: 1 } }
  );
  if (still) {
    const exp = still.passwordResetExpires ? new Date(still.passwordResetExpires) : null;
    if (!exp || exp <= now) {
      await col.updateOne(
        { _id: still._id },
        { $unset: { passwordResetToken: '', passwordResetExpires: '' }, $set: { updatedAt: now } }
      );
      return { ok: false, reason: 'expired' };
    }
  }

  return { ok: false, reason: 'invalid' };
}

/** List users (admin). Excludes passwordHash. Optional role/kycStatus filters. */
async function list(options = {}) {
  const col = await collection();
  const filter = {};
  if (options.role) filter.role = options.role;
  if (options.kycStatus) filter.kycStatus = options.kycStatus;
  if (options.search) {
    const s = options.search.trim();
    if (s) {
      filter.$or = [
        { email: { $regex: s, $options: 'i' } },
        { name: { $regex: s, $options: 'i' } },
      ];
    }
  }
  const cursor = col.find(filter, { projection: { passwordHash: 0 } }).sort({ createdAt: -1 });
  const limit = Math.min(options.limit || 200, 500);
  const list = await cursor.limit(limit).toArray();
  return list.map((row) => toUser(row));
}

export default {
  collection,
  createOne,
  findByEmail,
  findByAccountNo,
  findByAccountNoExact,
  findByReferralCode,
  findById,
  findByIdWithPasswordHashes,
  updateById,
  list,
  toUser,
  findByEmailWithPassword,
  completeEmailVerificationByToken,
  resetPasswordWithToken,
  ensureAccountNo,
};
