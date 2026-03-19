/**
 * List all indexes on ledger_entries (read-only).
 * Run: node scripts/list-ledger-indexes.js
 */
import 'dotenv/config';
import { getDb, closeMongo } from '../config/mongo.js';
import { LEDGER_COLLECTION } from '../modules/finance/ledger.model.js';

const db = await getDb();
const indexes = await db.collection(LEDGER_COLLECTION).indexes();
console.log(JSON.stringify(indexes, null, 2));
await closeMongo();
