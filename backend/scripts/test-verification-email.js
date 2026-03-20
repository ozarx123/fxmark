/**
 * End-to-end test: register → read verification token from DB → POST verify → login.
 * Requires: API running (e.g. npm run dev), MongoDB, valid Zoho + FRONTEND_URL in backend/.env.
 *
 * Usage (from backend/): node scripts/test-verification-email.js
 * Or repo root: node backend/scripts/test-verification-email.js
 */
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(backendRoot, '.env') });

const BASE = (process.env.API_URL || 'http://localhost:3000').replace(/\/$/, '');
const email = `verify_e2e_${Date.now()}@example.com`;
const password = 'VerifyE2e1!';

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
  console.log('=== Email verification E2E ===');
  console.log('API:', BASE);
  console.log('Test user:', email);
  console.log('');

  console.log('1. POST /api/auth/register');
  const reg = await request('POST', '/auth/register', {
    email,
    password,
    name: 'E2E Verify',
  });
  if (!reg.status || reg.status >= 400) {
    console.error('   FAIL', reg.status, reg.data);
    process.exit(1);
  }
  console.log('   OK', reg.status, '| user id:', reg.data?.user?.id);

  const { getDb } = await import('../config/mongo.js');
  const db = await getDb();
  const user = await db.collection('users').findOne({ email });
  const token = user?.emailVerificationToken;
  if (!token) {
    console.error('   FAIL: no emailVerificationToken on user (check Mongo + register flow)');
    process.exit(1);
  }
  console.log('   Token present in DB (length', token.length, ')');

  console.log('\n2. POST /api/auth/verify-email');
  const ver = await request('POST', '/auth/verify-email', { token });
  if (ver.status !== 200 || !ver.data?.verified) {
    console.error('   FAIL', ver.status, ver.data);
    process.exit(1);
  }
  console.log('   OK', ver.status, '| emailVerified:', ver.data?.user?.emailVerified);

  console.log('\n3. POST /api/auth/login (should succeed)');
  const login = await request('POST', '/auth/login', { email, password });
  if (login.status !== 200) {
    console.error('   FAIL', login.status, login.data);
    process.exit(1);
  }
  console.log('   OK', login.status, '| emailVerified:', login.data?.user?.emailVerified);

  console.log('\n=== All verification checks passed ===');
}

main().catch((err) => {
  console.error(err.message || err);
  if (String(err.cause || err).includes('fetch')) {
    console.error('\nTip: Start the API first: cd backend && npm run dev');
  }
  process.exit(1);
});
