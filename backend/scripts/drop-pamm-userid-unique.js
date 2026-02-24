/**
 * Drop unique index on pamm_managers.userId so managers can have multiple funds.
 * Run: node scripts/drop-pamm-userid-unique.js
 */
import 'dotenv/config';
import { getDb } from '../config/mongo.js';

async function run() {
  const db = await getDb();
  const col = db.collection('pamm_managers');
  try {
    await col.dropIndex('userId_1');
    console.log('Dropped unique index on userId. Managers can now have multiple funds.');
  } catch (e) {
    if (e.code === 27 || e.codeName === 'IndexNotFound') {
      console.log('Index userId_1 already removed or never existed.');
    } else {
      console.error('[drop-pamm-userid-unique]', e.message);
      process.exit(1);
    }
  }
  process.exit(0);
}

run();
