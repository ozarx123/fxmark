/**
 * Backfill missing referrerId for the affected investor (immersegeneraltrading@gmail.com)
 * so PAMM IB commission chain resolves. Sets referrerId to wecorpdigital@gmail.com user id.
 *
 * Run once from backend: node scripts/backfill-investor-referrer-id.js
 */
import 'dotenv/config';
import { getDb } from '../config/mongo.js';
import ibRepo from '../modules/ib/ib.repository.js';

const INVESTOR_EMAIL = 'immersegeneraltrading@gmail.com';
const REFERRER_EMAIL = 'wecorpdigital@gmail.com';

async function main() {
  const db = await getDb();
  const usersCol = db.collection('users');

  const investor = await usersCol.findOne({ email: INVESTOR_EMAIL.toLowerCase().trim() });
  if (!investor) {
    console.error('Investor not found:', INVESTOR_EMAIL);
    process.exit(1);
  }

  const referrer = await usersCol.findOne({ email: REFERRER_EMAIL.toLowerCase().trim() });
  if (!referrer) {
    console.error('Referrer user not found:', REFERRER_EMAIL);
    process.exit(1);
  }

  const referrerId = referrer._id != null ? String(referrer._id) : null;
  const profile = await ibRepo.getProfileByUserId(referrerId) || await ibRepo.getProfileById(referrerId);
  if (!profile) {
    console.error('Referrer has no ib_profiles entry. Create an IB profile for', REFERRER_EMAIL, 'first.');
    process.exit(1);
  }

  const investorIdStr = String(investor._id);
  const result = await usersCol.updateOne(
    { _id: investor._id },
    { $set: { referrerId, updatedAt: new Date() } }
  );

  if (result.modifiedCount === 0 && result.matchedCount === 1) {
    const current = await usersCol.findOne({ _id: investor._id }, { projection: { referrerId: 1 } });
    if (current && String(current.referrerId) === referrerId) {
      console.log('Investor already has correct referrerId. No change.');
    } else {
      console.error('Update matched but modifiedCount 0.');
      process.exit(1);
    }
  } else if (result.modifiedCount !== 1) {
    console.error('Update failed:', result);
    process.exit(1);
  } else {
    console.log('Backfill applied: set referrerId for', INVESTOR_EMAIL, 'to', referrerId, '(' + REFERRER_EMAIL + ')');
  }

  const chain = await ibRepo.getUplineChainForClient(investorIdStr);
  console.log('Verification: getUplineChainForClient(investor) length =', chain.length);
  if (chain.length > 0) console.log('  Chain:', chain.map((id) => String(id)));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
