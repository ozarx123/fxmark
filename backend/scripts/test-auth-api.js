/**
 * Test auth API with dummy users (server must be running).
 * Run from backend: node scripts/test-auth-api.js
 */
import 'dotenv/config';

const BASE = process.env.API_URL || 'http://localhost:3000';

async function request(method, path, body = null, token = null) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (token) opts.headers['Authorization'] = `Bearer ${token}`;
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, opts);
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: res.status, data };
}

async function run() {
  console.log('Testing auth API at', BASE, '\n');

  // 1. Login with seeded dummy user
  console.log('1. POST /api/auth/login (bob@test.com)');
  const login = await request('POST', '/api/auth/login', {
    email: 'bob@test.com',
    password: 'bob12345',
  });
  console.log('   Status:', login.status, login.data);
  if (login.status !== 200) {
    console.log('\n   Tip: Run "node scripts/seed-dummy-users.js" first and ensure server is running.');
    process.exit(1);
  }
  const { accessToken, refreshToken, user } = login.data;
  console.log('   User:', user?.email, '| role:', user?.role);

  // 2. GET /api/auth/me
  console.log('\n2. GET /api/auth/me');
  const me = await request('GET', '/api/auth/me', null, accessToken);
  console.log('   Status:', me.status, me.data);

  // 3. POST /api/auth/refresh
  console.log('\n3. POST /api/auth/refresh');
  const refresh = await request('POST', '/api/auth/refresh', { refreshToken });
  console.log('   Status:', refresh.status, refresh.data?.accessToken ? 'new tokens' : refresh.data);

  const newAccess = refresh.data?.accessToken;

  // 4. POST /api/auth/logout (optional body)
  console.log('\n4. POST /api/auth/logout');
  const logout = await request('POST', '/api/auth/logout', { refreshToken }, newAccess || accessToken);
  console.log('   Status:', logout.status, logout.status === 204 ? '(no body)' : logout.data);

  // 5. Register new user then login
  console.log('\n5. POST /api/auth/register (dummy@test.com)');
  const reg = await request('POST', '/api/auth/register', {
    email: 'dummy@test.com',
    password: 'dummy1234',
  });
  console.log('   Status:', reg.status, reg.data?.user?.email || reg.data);

  console.log('\n6. POST /api/auth/login (dummy@test.com)');
  const login2 = await request('POST', '/api/auth/login', {
    email: 'dummy@test.com',
    password: 'dummy1234',
  });
  console.log('   Status:', login2.status, login2.data?.user?.email || login2.data);

  console.log('\nAll auth API checks completed.');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
