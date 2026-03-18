/**
 * Mark emailVerified=true for ALL existing users.
 *
 * WARNING:
 * - This will mark every user record as verified, regardless of whether
 *   they actually confirmed via email. Use ONLY in dev/staging or when
 *   you explicitly want to bypass email verification.
 *
 * Run from backend folder:
 *   node scripts/verify-all-users.js
 */
import 'dotenv/config';
import { getDb } from '../config/mongo.js';

async function main() {
  const db = await getDb();
  const users = db.collection('users');

  const result = await users.updateMany(
    {},
    { $set: { emailVerified: true, updatedAt: new Date() } },
  );

  console.log(`Updated ${result.modifiedCount} users to emailVerified=true.`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Error in verify-all-users:', err);
  process.exit(1);
});

