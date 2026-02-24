/**
 * Seed dummy users for testing the auth API.
 * Run from backend: node scripts/seed-dummy-users.js
 */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { getDb } from '../config/mongo.js';

const COLLECTION = 'users';
const DUMMY_USERS = [
  { email: 'alice@test.com', password: 'alice1234', role: 'user', kycStatus: 'pending' },
  { email: 'bob@test.com', password: 'bob12345', role: 'user', kycStatus: 'approved' },
  { email: 'admin@test.com', password: 'admin1234', role: 'admin', kycStatus: 'approved' },
];
const SALT_ROUNDS = 10;

async function seed() {
  const db = await getDb();
  const col = db.collection(COLLECTION);
  await col.createIndex({ email: 1 }, { unique: true });

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
    console.log('  Created:', u.email, '→ id:', insertedId.toString());
  }
  console.log('Done.');
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
