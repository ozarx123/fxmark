/**
 * Mark a user's email as verified in MongoDB.
 * Run from backend: node scripts/verify-email.js <email>
 * Example: node scripts/verify-email.js shamsoup@gmail.com
 */
import 'dotenv/config';
import { getDb } from '../config/mongo.js';

const USERS_COLLECTION = 'users';

async function verifyEmail() {
  const email = (process.argv[2] || process.env.VERIFY_EMAIL || '').trim().toLowerCase();
  if (!email) {
    console.error('Usage: node scripts/verify-email.js <email>');
    console.error('Example: node scripts/verify-email.js shamsoup@gmail.com');
    process.exit(1);
  }

  const db = await getDb();
  const col = db.collection(USERS_COLLECTION);
  const user = await col.findOne({ email });

  if (!user) {
    console.error('User not found:', email);
    process.exit(1);
  }

  if (user.emailVerified === true) {
    console.log('Email already verified:', email);
    process.exit(0);
  }

  await col.updateOne(
    { email },
    { $set: { emailVerified: true, updatedAt: new Date() } }
  );
  console.log('Email verified successfully:', email);
}

verifyEmail().catch((err) => {
  console.error(err);
  process.exit(1);
});
