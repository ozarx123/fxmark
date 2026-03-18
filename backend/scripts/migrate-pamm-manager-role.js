/**
 * One-off: set role to 'trader' for any user with role 'pamm_manager'.
 * PAMM has been removed; this cleans up existing users.
 * Run: node scripts/migrate-pamm-manager-role.js
 */
import 'dotenv/config';
import { getDb } from '../config/mongo.js';

const USERS_COLLECTION = 'users';

async function main() {
  const db = await getDb();
  const col = db.collection(USERS_COLLECTION);
  const result = await col.updateMany(
    { role: 'pamm_manager' },
    { $set: { role: 'trader', updatedAt: new Date() } }
  );
  console.log(`Updated ${result.modifiedCount} user(s) from role pamm_manager to trader.`);
  if (result.matchedCount === 0) {
    console.log('No users with role pamm_manager found.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
