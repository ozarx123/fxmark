/**
 * Seed a demo PAMM manager (for bob@test.com). Run after setup-db.
 * Usage: node scripts/seed-pamm-manager.js
 */
import 'dotenv/config';
import { getDb } from '../config/mongo.js';

const USERS_COLLECTION = 'users';
const PAMM_MANAGERS_COLLECTION = 'pamm_managers';

async function seed() {
  const db = await getDb();
  const usersCol = db.collection(USERS_COLLECTION);
  const pammCol = db.collection(PAMM_MANAGERS_COLLECTION);

  const bob = await usersCol.findOne({ email: 'bob@test.com' });
  if (!bob) {
    console.error('Run npm run setup-db first to create bob@test.com');
    process.exit(1);
  }

  const userId = bob._id.toString();
  const existing = await pammCol.findOne({ userId });
  if (existing) {
    console.log('PAMM manager already exists for bob@test.com');
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

  console.log('Created PAMM manager: Alpha Growth (bob@test.com) — pending admin approval');
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
