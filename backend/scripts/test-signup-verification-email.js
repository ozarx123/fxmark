/**
 * Test signup → verification email (same code path as POST /api/auth/signup).
 * Prints API response flags and checks Mongo for token. Optionally sends nothing if Zoho is unset.
 *
 * Requires: API running (npm run dev in backend/), MongoDB, backend/.env with ZOHO_* + FRONTEND_URL for real sends.
 *
 * Usage (from backend/): node scripts/test-signup-verification-email.js [recipient@example.com]
 * If email omitted, uses verify_signup_<timestamp>@example.com (no inbox delivery; still tests API + DB).
 */
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(backendRoot, '.env') });

const BASE = (process.env.API_URL || 'http://localhost:3000').replace(/\/$/, '');
const argEmail = (process.argv[2] || '').trim();
const email = argEmail || `verify_signup_${Date.now()}@example.com`;
const password = 'SignupTest1!';

async function request(method, pathName, body = null) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}/api${pathName}`, opts);
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: res.status, data };
}

async function main() {
  console.log('=== Signup → verification email ===');
  console.log('API:', BASE);
  console.log('POST /api/auth/signup (alias of register):', email);
  console.log('');

  const signup = await request('POST', '/auth/signup', {
    email,
    password,
    name: 'Signup verify test',
  });

  if (!signup.status || signup.status >= 400) {
    console.error('FAIL', signup.status, signup.data);
    process.exit(1);
  }

  const d = signup.data || {};
  console.log('HTTP', signup.status);
  console.log('  verificationEmailSent:', d.verificationEmailSent);
  console.log('  message:', d.message);
  console.log('  requiresEmailVerification:', d.requiresEmailVerification);
  console.log('  user.emailVerified:', d.user?.emailVerified);
  console.log('');

  if (d.verificationEmailSent === false) {
    console.warn(
      'Verification email was NOT sent. Check ZOHO_MAIL_USER / ZOHO_MAIL_PASSWORD, FRONTEND_URL, and server logs.'
    );
  } else {
    console.log('API reports verification email sent. Check inbox/spam for:', email);
  }

  const { getDb } = await import('../config/mongo.js');
  const db = await getDb();
  const user = await db.collection('users').findOne({ email: email.toLowerCase() });
  const token = user?.emailVerificationToken;
  if (!token) {
    console.error('FAIL: no emailVerificationToken on user document');
    process.exit(1);
  }
  console.log('Mongo: emailVerificationToken present (length', String(token).length, ')');

  const link = `${(process.env.FRONTEND_URL || process.env.WEB_APP_URL || 'http://localhost:5173').replace(/\/$/, '')}/verify-email?token=${encodeURIComponent(token)}`;
  console.log('\nLocal verify URL (for manual test):');
  console.log(' ', link);
  console.log('\nDone.');
}

main().catch((err) => {
  console.error(err.message || err);
  if (String(err.cause || err).includes('fetch')) {
    console.error('\nTip: Start the API: cd backend && npm run dev');
  }
  process.exit(1);
});
