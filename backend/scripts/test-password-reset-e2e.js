/**
 * End-to-end: register → verify email (so login works) → forgot-password → read reset token from DB
 * → POST reset-password → login with new password.
 *
 * Also checks auth HTTP routes: GET /verify-email and GET /reset-password redirects (email links),
 * and GET without token → 400.
 *
 * Requires: API running (npm run dev in backend/), MongoDB, FRONTEND_URL in backend/.env for redirect checks.
 *
 * Usage (from backend/): node scripts/test-password-reset-e2e.js
 * Or: node backend/scripts/test-password-reset-e2e.js
 */
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(backendRoot, '.env') });

const BASE = (process.env.API_URL || 'http://localhost:3000').replace(/\/$/, '');
const email = `pwd_reset_e2e_${Date.now()}@example.com`;
const passwordInitial = 'InitialE2e1!';
const passwordNew = 'NewPassE2e2!';

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

/** No follow — inspect status + Location for email-link routes */
async function requestRaw(method, pathWithQuery) {
  const res = await fetch(`${BASE}/api${pathWithQuery}`, {
    method,
    redirect: 'manual',
  });
  return res;
}

function assertRedirectToSpa(res, label, mustInclude) {
  if (res.status === 503) {
    console.error(`   FAIL ${label}: got 503 — set FRONTEND_URL (or WEB_APP_URL) in backend/.env for email redirects`);
    process.exit(1);
  }
  if (res.status !== 302 && res.status !== 301) {
    console.error(`   FAIL ${label}: expected 302/301, got ${res.status}`);
    process.exit(1);
  }
  const loc = res.headers.get('Location') || '';
  for (const frag of mustInclude) {
    if (!loc.includes(frag)) {
      console.error(`   FAIL ${label}: Location missing "${frag}"\n   Got: ${loc}`);
      process.exit(1);
    }
  }
}

async function main() {
  console.log('=== Password reset E2E ===');
  console.log('API:', BASE);
  console.log('User:', email);
  console.log('');

  console.log('0. Route sanity: GET without token → 400');
  const noVerify = await requestRaw('GET', '/auth/verify-email');
  const noReset = await requestRaw('GET', '/auth/reset-password');
  if (noVerify.status !== 400 || noReset.status !== 400) {
    console.error('   FAIL expected 400 for missing token', noVerify.status, noReset.status);
    process.exit(1);
  }
  console.log('   OK /verify-email & /reset-password without token → 400');

  console.log('\n1. POST /api/auth/register');
  const reg = await request('POST', '/auth/register', {
    email,
    password: passwordInitial,
    name: 'Pwd Reset E2E',
  });
  if (!reg.status || reg.status >= 400) {
    console.error('   FAIL', reg.status, reg.data);
    process.exit(1);
  }
  console.log('   OK', reg.status);

  const { getDb } = await import('../config/mongo.js');
  const db = await getDb();
  const col = db.collection('users');

  console.log('\n2. Read emailVerificationToken → GET (email link) + POST /api/auth/verify-email');
  const row1 = await col.findOne({ email: email.toLowerCase() });
  const verifyTok = row1?.emailVerificationToken;
  if (!verifyTok) {
    console.error('   FAIL: no emailVerificationToken on user');
    process.exit(1);
  }
  const getVerify = await requestRaw('GET', `/auth/verify-email?token=${encodeURIComponent(verifyTok)}`);
  assertRedirectToSpa(getVerify, 'GET /auth/verify-email?token=', ['verify-email', 'token=']);
  console.log('   OK GET → 302 to SPA verify-email');

  const ver = await request('POST', '/auth/verify-email', { token: verifyTok });
  if (ver.status !== 200 || !ver.data?.verified) {
    console.error('   FAIL', ver.status, ver.data);
    process.exit(1);
  }
  console.log('   OK', ver.status, '| emailVerified:', ver.data?.user?.emailVerified);

  console.log('\n3. POST /api/auth/forgot-password');
  const forgot = await request('POST', '/auth/forgot-password', { email });
  if (forgot.status !== 200 || !forgot.data?.ok) {
    console.error('   FAIL', forgot.status, forgot.data);
    process.exit(1);
  }
  console.log('   OK', forgot.status);

  console.log('\n4. Read passwordResetToken from Mongo');
  const row2 = await col.findOne({ email: email.toLowerCase() });
  const resetTok = row2?.passwordResetToken;
  if (!resetTok) {
    console.error('   FAIL: no passwordResetToken after forgot-password');
    process.exit(1);
  }
  console.log('   OK token length:', String(resetTok).length);

  console.log('\n5. GET /api/auth/reset-password?token= (email link → SPA hash URL)');
  const getReset = await requestRaw('GET', `/auth/reset-password?token=${encodeURIComponent(resetTok)}`);
  assertRedirectToSpa(getReset, 'GET /auth/reset-password?token=', ['reset-password', 'token=', '#/']);
  console.log('   OK GET → 302 to FRONTEND_URL/#/reset-password?token=…');

  console.log('\n6. POST /api/auth/reset-password (new password)');
  const rst = await request('POST', '/auth/reset-password', {
    token: resetTok,
    password: passwordNew,
  });
  if (rst.status !== 200 || !rst.data?.success) {
    console.error('   FAIL', rst.status, rst.data);
    process.exit(1);
  }
  console.log('   OK', rst.status, '|', rst.data?.message);

  console.log('\n7. POST /api/auth/login (must use NEW password; old should fail)');
  const badLogin = await request('POST', '/auth/login', { email, password: passwordInitial });
  if (badLogin.status === 200) {
    console.error('   FAIL: old password should not work');
    process.exit(1);
  }
  console.log('   Old password rejected:', badLogin.status, '(expected)');

  const good = await request('POST', '/auth/login', { email, password: passwordNew });
  if (good.status !== 200 || !good.data?.accessToken) {
    console.error('   FAIL login with new password', good.status, good.data);
    process.exit(1);
  }
  console.log('   OK', good.status, '| accessToken present | emailVerified:', good.data?.user?.emailVerified);

  console.log('\n=== Password reset E2E + route checks passed ===');
}

main().catch((err) => {
  console.error(err.message || err);
  if (String(err.cause || err).includes('fetch')) {
    console.error('\nTip: Start the API: cd backend && npm run dev');
  }
  process.exit(1);
});
