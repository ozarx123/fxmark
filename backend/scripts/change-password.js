/**
 * Change a user's password in MongoDB.
 * Run: node scripts/change-password.js [email] [newPassword]
 * Example: node scripts/change-password.js clarokochi@gmail.com MyNewPass123
 */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { getDb } from '../config/mongo.js';

const USERS_COLLECTION = 'users';
const SALT_ROUNDS = 10;
const PASSWORD_MIN_LEN = 8;

function validatePassword(password) {
  if (!password || typeof password !== 'string') return 'Password is required';
  if (password.length < PASSWORD_MIN_LEN) return `Password must be at least ${PASSWORD_MIN_LEN} characters`;
  if (!/[A-Z]/.test(password)) return 'Password must contain at least one uppercase letter';
  if (!/[a-z]/.test(password)) return 'Password must contain at least one lowercase letter';
  if (!/[0-9]/.test(password)) return 'Password must contain at least one number';
  return null;
}

async function changePassword() {
  const email = (process.argv[2] || process.env.CHANGE_USER_EMAIL || '').trim().toLowerCase();
  const newPassword = process.argv[3] || process.env.CHANGE_USER_PASSWORD || '';

  if (!email) {
    console.error('Usage: node scripts/change-password.js <email> <newPassword>');
    console.error('Example: node scripts/change-password.js clarokochi@gmail.com MyNewPass123');
    process.exit(1);
  }

  const pwdErr = validatePassword(newPassword);
  if (pwdErr) {
    console.error(pwdErr);
    process.exit(1);
  }

  const db = await getDb();
  const col = db.collection(USERS_COLLECTION);
  const user = await col.findOne({ email });

  if (!user) {
    console.error('User not found:', email);
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  await col.updateOne(
    { email },
    { $set: { passwordHash, updatedAt: new Date() } }
  );

  console.log('Password updated for:', email);
}

changePassword().catch((err) => {
  console.error(err);
  process.exit(1);
});
