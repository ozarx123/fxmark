import { getDb } from '../../config/mongo.js';
import { ObjectId } from 'mongodb';

const COLLECTION = 'users';
const COUNTERS = 'sequence_counters';
/** Keeps existing counter doc in Mongo so sequence continues (was used for loginAccountId). */
const NUMERIC_ACCOUNT_NO_COUNTER_ID = 'userLoginAccountId';
const NUMERIC_ACCOUNT_NO_START = 10001;

let indexEnsured = false;
async function ensureIndex() {
  if (indexEnsured) return;
  const col = await collection();
  await col.createIndex({ email: 1 }, { unique: true });
  await col.createIndex({ accountNo: 1 }, { unique: true, sparse: true });
  try {
    await col.dropIndex('loginAccountId_1');
  } catch {
    /* index may not exist */
  }
  indexEnsured = true;
}

async function collection() {
  const db = await getDb();
  return db.collection(COLLECTION);
}

function seqFromFindOneAndUpdateResult(result) {
  if (result == null) return null;
  const doc = typeof result === 'object' && 'value' in result && result.value !== undefined ? result.value : result;
  const seq = doc?.seq;
  return seq == null ? null : Number(seq);
}

/** Next sequential numeric accountNo string: "10001", "10002", … Only for users without accountNo. */
async function getNextNumericAccountNo(options = {}) {
  const db = await getDb();
  const ctr = db.collection(COUNTERS);
  const session = options.session || undefined;
  const result = await ctr.findOneAndUpdate(
    { _id: NUMERIC_ACCOUNT_NO_COUNTER_ID },
    [
      {
        $set: {
          seq: {
            $add: [{ $ifNull: ['$seq', NUMERIC_ACCOUNT_NO_START - 1] }, 1],
          },
        },
      },
    ],
    { upsert: true, returnDocument: 'after', ...(session ? { session } : {}) }
  );
  const seq = seqFromFindOneAndUpdateResult(result);
  if (seq == null || !Number.isFinite(seq)) {
    throw new Error('Failed to allocate accountNo');
  }
  return String(seq);
}

function normalizeAccountNoForStorage(accountNo) {
  return String(accountNo).trim().toUpperCase();
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Case-insensitive match; does not change stored values on existing users. */
function accountNoEqualityFilter(raw) {
  const t = (raw || '').trim();
  if (!t) return null;
  return { accountNo: { $regex: new RegExp(`^${escapeRegex(t)}$`, 'i') } };
}

async function createOne(doc, options = {}) {
  await ensureIndex();
  const col = await collection();
  let accountNo;
  if (doc.accountNo !== undefined && doc.accountNo !== null && String(doc.accountNo).trim() !== '') {
    accountNo = normalizeAccountNoForStorage(doc.accountNo);
  } else {
    accountNo = await getNextNumericAccountNo(options);
  }
  const createdAt = doc.createdAt instanceof Date ? doc.createdAt : new Date();
  const updatedAt = doc.updatedAt instanceof Date ? doc.updatedAt : new Date();
  const { createdAt: _c, updatedAt: _u, accountNo: _an, ...rest } = doc;
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
  const filter = accountNoEqualityFilter(accountNo);
  if (!filter) return null;
  const user = await col.findOne(filter);
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

async function ensureAccountNo(userId, options = {}) {
  const user = await findById(userId);
  if (!user) return null;
  if (user.accountNo != null && String(user.accountNo).trim() !== '') return user;
  const col = await collection();
  if (!ObjectId.isValid(userId)) return user;
  const accountNo = await getNextNumericAccountNo(options);
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
    loginAccountId: _legacyLoginAccountId,
    ...rest
  } = row;
  return { id: _id.toString(), ...rest };
}

function toUserWithHash(row) {
  if (!row) return null;
  const { _id, loginAccountId: _l, ...rest } = row;
  return { id: _id.toString(), ...rest };
}

async function findByEmailWithPassword(email) {
  const col = await collection();
  const user = await col.findOne({ email: (email || '').toLowerCase().trim() });
  return user ? toUserWithHash(user) : null;
}

async function findByAccountNoWithPassword(rawAccountNo) {
  if (!rawAccountNo || typeof rawAccountNo !== 'string') return null;
  const col = await collection();
  const filter = accountNoEqualityFilter(rawAccountNo);
  if (!filter) return null;
  const user = await col.findOne(filter);
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
      const or = [
        { email: { $regex: s, $options: 'i' } },
        { name: { $regex: s, $options: 'i' } },
      ];
      or.push(accountNoEqualityFilter(s));
      filter.$or = or.filter(Boolean);
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
  findByAccountNoWithPassword,
  getNextNumericAccountNo,
  completeEmailVerificationByToken,
  resetPasswordWithToken,
  ensureAccountNo,
};
