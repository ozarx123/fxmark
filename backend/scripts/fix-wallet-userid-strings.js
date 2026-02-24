/**
 * Fix wallet documents: ensure userId is stored as string (not ObjectId).
 * Run: node scripts/fix-wallet-userid-strings.js
 * Safe to run multiple times.
 */
import 'dotenv/config';
import { getDb } from '../config/mongo.js';

async function fix() {
  const db = await getDb();
  const col = db.collection('wallets');
  const cursor = col.find({});
  let updated = 0;
  for await (const doc of cursor) {
    const uid = doc.userId;
    if (uid != null && typeof uid !== 'string') {
      const str = uid.toString ? uid.toString() : String(uid);
      await col.updateOne(
        { _id: doc._id },
        { $set: { userId: str, updatedAt: new Date() } }
      );
      updated++;
      console.log('Fixed wallet', doc._id, 'userId:', uid, '->', str);
    }
  }
  console.log('Done. Updated', updated, 'wallets.');
}

fix().catch((err) => {
  console.error(err);
  process.exit(1);
});
