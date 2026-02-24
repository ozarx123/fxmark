/**
 * Create a superadmin user in MongoDB.
 * Run: node scripts/create-superadmin.js [email] [password]
 * Or: npm run create-superadmin
 * Example: node scripts/create-superadmin.js super@example.com MyPass123
 */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { getDb } from '../config/mongo.js';

const USERS_COLLECTION = 'users';
const SALT_ROUNDS = 10;

async function createSuperadmin() {
  const email = (process.argv[2] || process.env.SUPERADMIN_EMAIL || 'superadmin@fxmark.com').trim().toLowerCase();
  const password = process.argv[3] || process.env.SUPERADMIN_PASSWORD || 'SuperAdmin123';

  if (password.length < 8) {
    console.error('Password must be at least 8 characters');
    process.exit(1);
  }

  const db = await getDb();
  const col = db.collection(USERS_COLLECTION);
  await col.createIndex({ email: 1 }, { unique: true }).catch(() => {});

  const existing = await col.findOne({ email });
  if (existing) {
    await col.updateOne(
      { email },
      { $set: { role: 'superadmin', passwordHash: await bcrypt.hash(password, SALT_ROUNDS), updatedAt: new Date() } }
    );
    console.log('Updated existing user to superadmin:', email);
  } else {
    await col.insertOne({
      email,
      passwordHash: await bcrypt.hash(password, SALT_ROUNDS),
      role: 'superadmin',
      kycStatus: 'approved',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    console.log('Created superadmin:', email);
  }
  console.log('Login with:', email, '| password:', password);
}

createSuperadmin().catch((err) => {
  console.error(err);
  process.exit(1);
});
