/**
 * Delete all users and their related data EXCEPT a small whitelist.
 *
 * WHITELIST (kept):
 * - shamsoup@gmail.com
 * - infomarkdesign@gmail.com
 * - wecorpdigital@gmail.com
 *
 * This script will:
 * - Keep the 3 whitelisted users and all their data.
 * - Delete all OTHER users from `users`.
 * - Also delete related data for deleted users from:
 *   - refresh_tokens
 *   - wallets
 *   - wallet_transactions
 *   - trading_accounts
 *   - orders
 *   - positions
 *   - pamm_managers (userId field)
 *   - pamm_allocations (followerId)
 *   - manager_trades (managerId not strictly userId but filtered via kept managers)
 *   - ib_profiles, ib_commissions, ib_payouts
 *
 * WARNING: This is destructive. Run only in a dev/test environment.
 *
 * Run from backend folder:
 *   node scripts/delete-extra-users.js
 */
import 'dotenv/config';
import { getDb } from '../config/mongo.js';

const WHITELIST_EMAILS = [
  'shamsoup@gmail.com',
  'infomarkdesign@gmail.com',
  'wecorpdigital@gmail.com',
].map((e) => e.toLowerCase());

async function main() {
  const db = await getDb();
  const usersCol = db.collection('users');

  console.log('Fetching users to keep (whitelist)...');
  const keepUsers = await usersCol
    .find({ email: { $in: WHITELIST_EMAILS } })
    .project({ _id: 1, email: 1 })
    .toArray();

  if (!keepUsers.length) {
    console.warn('No whitelisted users found. Aborting to avoid wiping all users.');
    process.exit(1);
  }

  const keepIds = keepUsers.map((u) => u._id.toString());
  console.log('Keeping users:', keepUsers.map((u) => u.email).join(', '));

  // Delete all other users
  console.log('\nDeleting non-whitelisted users from users collection...');
  const deleteUsersResult = await usersCol.deleteMany({ _id: { $nin: keepUsers.map((u) => u._id) } });
  console.log(`- users: deleted ${deleteUsersResult.deletedCount}`);

  // Helper to delete by userId in a collection
  async function deleteByUserId(collectionName, fieldName = 'userId') {
    const col = db.collection(collectionName);
    const res = await col.deleteMany({ [fieldName]: { $nin: keepIds } });
    console.log(`- ${collectionName}: deleted ${res.deletedCount} documents (where ${fieldName} not in keepIds)`);
  }

  console.log('\nDeleting related data for non-whitelisted users...');
  await deleteByUserId('refresh_tokens', 'userId');
  await deleteByUserId('wallets', 'userId');
  await deleteByUserId('wallet_transactions', 'userId');
  await deleteByUserId('trading_accounts', 'userId');
  await deleteByUserId('orders', 'userId');
  await deleteByUserId('positions', 'userId');
  await deleteByUserId('ib_profiles', 'userId');
  await deleteByUserId('ib_commissions', 'userId');
  await deleteByUserId('ib_payouts', 'userId');

  // PAMM data: managers keyed by userId, allocations by followerId
  const pammManagers = db.collection('pamm_managers');
  const pammAllocations = db.collection('pamm_allocations');
  const managerTrades = db.collection('manager_trades');

  const delManagers = await pammManagers.deleteMany({ userId: { $nin: keepIds } });
  console.log(`- pamm_managers: deleted ${delManagers.deletedCount} (non-whitelisted managers)`);

  const delAlloc = await pammAllocations.deleteMany({ followerId: { $nin: keepIds } });
  console.log(`- pamm_allocations: deleted ${delAlloc.deletedCount} (non-whitelisted followers)`);

  // For manager_trades, keep only trades where managerId belongs to a kept manager
  const keptManagers = await pammManagers
    .find({ userId: { $in: keepIds } })
    .project({ _id: 1 })
    .toArray();
  const keptFundIds = keptManagers.map((m) => m._id.toString());
  const delTrades = await managerTrades.deleteMany({ managerId: { $nin: keptFundIds } });
  console.log(`- manager_trades: deleted ${delTrades.deletedCount} (for deleted funds)`);

  console.log('\nDone. Kept users:', keepUsers.map((u) => `${u.email}`).join(', '));
  process.exit(0);
}

main().catch((err) => {
  console.error('Error in delete-extra-users:', err);
  process.exit(1);
});

