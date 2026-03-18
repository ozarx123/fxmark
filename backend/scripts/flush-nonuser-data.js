/**
 * Flush trading / ledger / PAMM data but keep users.
 *
 * WARNING: This is destructive. It will delete:
 * - Refresh tokens
 * - Orders & positions
 * - Trading accounts
 * - Ledger entries
 * - PAMM managers, allocations, trades
 * - IB hierarchy & commissions
 *
 * It will NOT delete:
 * - Users (accounts)
 * - Wallet balances (wallets collection)
 * - Wallet transaction history
 *
 * Run from backend folder (test/dev only):
 *   node scripts/flush-nonuser-data.js
 */
import 'dotenv/config';
import { getDb } from '../config/mongo.js';

async function main() {
  const db = await getDb();
  console.log('Connected to Mongo. Flushing non-user trading data...');

  // Collections to clear
  const collections = [
    'refresh_tokens',
    'orders',
    'positions',
    'trading_accounts',
    'ledger_entries',
    'pamm_managers',
    'pamm_allocations',
    'manager_trades',
    'ib_profiles',
    'ib_commissions',
    'ib_payouts',
  ];

  for (const name of collections) {
    const col = db.collection(name);
    const count = await col.countDocuments();
    if (count === 0) {
      console.log(`- ${name}: already empty`);
      continue;
    }
    const res = await col.deleteMany({});
    console.log(`- ${name}: deleted ${res.deletedCount} documents`);
  }

  console.log('\nDone. Users and wallets were NOT touched.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Error in flush-nonuser-data:', err);
  process.exit(1);
});

