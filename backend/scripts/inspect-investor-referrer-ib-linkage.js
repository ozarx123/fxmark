/**
 * READ-ONLY: Inspect user/referrer/IB profile linkage for a given investor.
 * No code changes. Run: node scripts/inspect-investor-referrer-ib-linkage.js
 */
import 'dotenv/config';
import { getDb } from '../config/mongo.js';
import { ObjectId } from 'mongodb';

const INVESTOR_ID = '69b7fb805ad28a8befc6c061';
const TRADE_ID = '69b95cd24641424f17034291';

console.log('=== Investor / referrer / IB profile linkage (read-only) ===\n');
console.log('Target investorId:', INVESTOR_ID);
console.log('Target trade_id:', TRADE_ID);
console.log('');

const db = await getDb();
const usersCol = db.collection('users');
const profilesCol = db.collection('ib_profiles');

const idStr = INVESTOR_ID;
let investor = await usersCol.findOne({ _id: new ObjectId(idStr) });
if (!investor) investor = await usersCol.findOne({ _id: idStr });

console.log('1. Investor record');
if (!investor) {
  console.log('   NOT FOUND (no user with _id =', INVESTOR_ID, ')');
  process.exit(0);
}
console.log('   _id:', investor._id, '(type:', typeof investor._id, investor._id?.constructor?.name || '', ')');
console.log('   email:', investor.email ?? '(none)');
console.log('   referrerId:', investor.referrerId ?? '(missing)', '(type:', typeof investor.referrerId, investor.referrerId?.constructor?.name ?? '', ')');

const referrerIdRaw = investor.referrerId;
if (referrerIdRaw == null || referrerIdRaw === '') {
  console.log('\n2. Referrer record');
  console.log('   N/A — investor has no referrerId');
  console.log('\n3. IB profile record');
  console.log('   N/A');
  console.log('\n4. Exact break point');
  console.log('   investor has no referrerId');
  console.log('\n5. Minimal safe fix recommendation');
  console.log('   Set users.referrerId for this investor to the referring IB\'s user id when they sign up (e.g. from ref link). Do not change commission logic.');
  console.log('\n6. Do NOT implement fix yet');
  process.exit(0);
}

const referrerIdStr = String(referrerIdRaw);
let referrer = await usersCol.findOne({ _id: new ObjectId(referrerIdStr) });
if (!referrer && ObjectId.isValid(referrerIdStr) && referrerIdStr.length === 24) {
  referrer = await usersCol.findOne({ _id: referrerIdStr });
}
if (!referrer) referrer = await usersCol.findOne({ _id: referrerIdRaw });

console.log('\n2. Referrer record');
if (!referrer) {
  console.log('   NOT FOUND (no user with _id =', referrerIdRaw, ')');
  console.log('\n3. IB profile record');
  console.log('   N/A (referrer user missing)');
  console.log('\n4. Exact break point');
  console.log('   referrer user not found');
  console.log('\n5. Minimal safe fix recommendation');
  console.log('   Ensure the referrer user exists in users collection with _id matching investor.referrerId.');
  console.log('\n6. Do NOT implement fix yet');
  process.exit(0);
}
console.log('   _id:', referrer._id, '(type:', typeof referrer._id, referrer._id?.constructor?.name || '', ')');
console.log('   email:', referrer.email ?? '(none)');

const profileByStr = await profilesCol.findOne({ userId: referrerIdStr });
const profileByObj = ObjectId.isValid(referrerIdStr) && referrerIdStr.length === 24
  ? await profilesCol.findOne({ userId: new ObjectId(referrerIdStr) })
  : null;

const profile = profileByStr || profileByObj;

console.log('\n3. IB profile record');
if (!profile) {
  console.log('   NOT FOUND (no ib_profiles entry for userId =', referrerIdStr, 'or ObjectId)');
  console.log('\n4. Exact break point');
  console.log('   referrer exists but has no ib_profiles entry');
  console.log('\n5. Minimal safe fix recommendation');
  console.log('   Either register the referrer as IB (create ib_profiles entry with userId = referrer._id) or ensure investor.referrerId points to a user who has an IB profile.');
  console.log('\n6. Do NOT implement fix yet');
  process.exit(0);
}
console.log('   profile _id:', profile._id);
console.log('   userId:', profile.userId, '(type:', typeof profile.userId, profile.userId?.constructor?.name ?? '', ')');
console.log('   status:', profile.status ?? '(no field)');

console.log('\n4. Type consistency (exact break point)');
const refIdType = referrerIdRaw?.constructor?.name ?? typeof referrerIdRaw;
const refIdVal = referrerIdRaw;
const referrerIdType = referrer._id?.constructor?.name ?? typeof referrer._id;
const referrerIdVal = referrer._id;
const profileUserIdType = profile.userId?.constructor?.name ?? typeof profile.userId;
const profileUserIdVal = profile.userId;

const refMatchesReferrer = refIdVal == null ? false : (String(refIdVal) === String(referrerIdVal));
const refMatchesProfile = refIdVal == null ? false : (String(refIdVal) === String(profileUserIdVal));

console.log('   investor.referrerId:', refIdType, refIdVal);
console.log('   referrer._id:', referrerIdType, referrerIdVal);
console.log('   ib_profiles.userId:', profileUserIdType, profileUserIdVal);
console.log('   referrerId === referrer._id (value):', refMatchesReferrer);
console.log('   referrerId === profile.userId (value):', refMatchesProfile);

if (!refMatchesReferrer) {
  console.log('   Break: id type/value mismatch — investor.referrerId does not match referrer._id.');
} else if (!refMatchesProfile) {
  console.log('   Break: id type/value mismatch — referrer._id / investor.referrerId does not match ib_profiles.userId (profile lookup would fail with strict match).');
} else {
  console.log('   No type mismatch; chain would resolve if getUplineChainForClient uses same lookup (userId string and ObjectId).');
}

console.log('\n5. Minimal safe fix recommendation');
if (!investor.referrerId) {
  console.log('   Set users.referrerId for this investor when they sign up via ref link.');
} else if (!referrer) {
  console.log('   Ensure referrer user exists in users with _id matching investor.referrerId.');
} else if (!profile) {
  console.log('   Create ib_profiles entry for the referrer (userId = referrer._id) or have investor referred by an existing IB.');
} else if (!refMatchesReferrer || !refMatchesProfile) {
  console.log('   Normalize storage so referrerId, referrer._id, and ib_profiles.userId are consistent (e.g. all string or all ObjectId) for lookups.');
} else {
  console.log('   Linkage is consistent; if chain is still empty, check getUplineChainForClient logic (e.g. profile query).');
}
console.log('\n6. Do NOT implement fix yet');
console.log('\n=== End inspection ===');
