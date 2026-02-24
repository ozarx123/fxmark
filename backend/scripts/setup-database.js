/**
 * Set up MongoDB for the app: ensure indexes (collections + indexes), then seed dummy users.
 * Run from backend: node scripts/setup-database.js
 * Or: npm run setup-db
 */
import 'dotenv/config';
import { getDb } from '../config/mongo.js';
import * as models from '../models/index.js';
import bcrypt from 'bcryptjs';

const USERS_COLLECTION = 'users';
const PAMM_MANAGERS_COLLECTION = 'pamm_managers';
const SALT_ROUNDS = 10;
const DUMMY_USERS = [
  { email: 'alice@test.com', password: 'alice1234', role: 'user', kycStatus: 'pending' },
  { email: 'bob@test.com', password: 'bob12345', role: 'user', kycStatus: 'approved' },
  { email: 'admin@test.com', password: 'admin1234', role: 'admin', kycStatus: 'approved' },
];

async function ensureIndexes(db) {
  const specs = [
    [models.user.COLLECTION, models.user.indexes],
    [models.refreshToken.COLLECTION, models.refreshToken.indexes],
    [models.wallet.WALLETS_COLLECTION, models.wallet.walletIndexes],
    [models.wallet.TRANSACTIONS_COLLECTION, models.wallet.transactionIndexes],
    [models.order.COLLECTION, models.order.indexes],
    [models.position.COLLECTION, models.position.indexes],
    [models.pamm.MANAGERS_COLLECTION, models.pamm.managerIndexes],
    [models.pamm.ALLOCATIONS_COLLECTION, models.pamm.allocationIndexes],
    [models.pamm.TRADES_COLLECTION, models.pamm.tradeIndexes],
    [models.ib.PROFILES_COLLECTION, models.ib.profileIndexes],
    [models.ib.COMMISSIONS_COLLECTION, models.ib.commissionIndexes],
    [models.ib.PAYOUTS_COLLECTION, models.ib.payoutIndexes],
    [models.ledger.LEDGER_COLLECTION, models.ledger.ledgerIndexes],
  ];

  console.log('Ensuring indexes...');
  for (const [collName, indexList] of specs) {
    if (!indexList || indexList.length === 0) continue;
    const col = db.collection(collName);
    for (const idx of indexList) {
      try {
        await col.createIndex(idx.keys, idx.options || {});
        console.log('  ', collName, Object.keys(idx.keys).join(','), 'ok');
      } catch (e) {
        if (e.code === 85 || e.codeName === 'IndexOptionsConflict') {
          console.log('  ', collName, 'already exists');
        } else {
          console.error('  ', collName, e.message);
        }
      }
    }
  }
}

async function seedUsers(db) {
  const col = db.collection(USERS_COLLECTION);
  await col.createIndex({ email: 1 }, { unique: true }).catch(() => {});

  console.log('Seeding dummy users...');
  for (const u of DUMMY_USERS) {
    const email = u.email.toLowerCase();
    const existing = await col.findOne({ email });
    if (existing) {
      console.log('  Skip (exists):', u.email);
      continue;
    }
    const passwordHash = await bcrypt.hash(u.password, SALT_ROUNDS);
    const { insertedId } = await col.insertOne({
      email,
      passwordHash,
      role: u.role,
      kycStatus: u.kycStatus,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    console.log('  Created:', u.email, '→', insertedId.toString());
  }
}

async function seedPammManager(db) {
  const usersCol = db.collection(USERS_COLLECTION);
  const pammCol = db.collection(PAMM_MANAGERS_COLLECTION);
  const bob = await usersCol.findOne({ email: 'bob@test.com' });
  if (!bob) return;
  const userId = bob._id.toString();
  const existing = await pammCol.findOne({ userId });
  if (existing) {
    console.log('  Skip PAMM manager (exists for bob@test.com)');
    return;
  }
  await pammCol.insertOne({
    userId,
    name: 'Alpha Growth',
    allocationPercent: 100,
    performanceFeePercent: 20,
    cutoffWithdrawEnabled: false,
    isPublic: true,
    strategy: 'Trend following with disciplined risk management.',
    fundType: 'growth',
    approvalStatus: 'pending',
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  console.log('  Created PAMM manager: Alpha Growth (bob@test.com) — pending approval');
}

async function setup() {
  console.log('=== Database setup ===\n');

  const db = await getDb();
  await db.admin().command({ ping: 1 });
  console.log('MongoDB connection: OK\n');

  await ensureIndexes(db);
  console.log('');

  await seedUsers(db);

  await seedPammManager(db);

  console.log('\n=== Setup complete ===');
}

setup().catch((err) => {
  console.error(err);
  process.exit(1);
});
