/**
 * Assign sequential accountNo (10001, 10002, …) only to users missing accountNo.
 * Does not change users who already have accountNo (e.g. bulk-import FX numbers).
 * Removes legacy loginAccountId field from all users.
 *
 * Uses MONGODB_URI from .env. Run from backend:
 *   node scripts/backfill-missing-account-no.js
 */
import 'dotenv/config';
import { getDb } from '../config/mongo.js';
import userRepo from '../modules/users/user.repository.js';

async function main() {
  const db = await getDb();
  const col = db.collection('users');
  const cursor = col
    .find({
      $or: [{ accountNo: { $exists: false } }, { accountNo: null }, { accountNo: '' }],
    })
    .sort({ createdAt: 1 });

  let assigned = 0;
  for await (const u of cursor) {
    const id = u._id?.toString();
    if (!id) continue;
    await userRepo.ensureAccountNo(id);
    assigned += 1;
    if (assigned % 200 === 0) console.log('Assigned', assigned, '…');
  }

  const unsetRes = await col.updateMany({}, { $unset: { loginAccountId: '' } });
  console.log('Done. Assigned accountNo to', assigned, 'user(s). Unset loginAccountId on', unsetRes.modifiedCount, 'document(s).');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
