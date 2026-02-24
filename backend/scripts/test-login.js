/**
 * Quick login test (server must be running).
 * Run: npm run test:login
 * Or with custom user: node scripts/test-login.js [email] [password]
 */
import 'dotenv/config';

const BASE = process.env.API_URL || 'http://localhost:3000';
const email = process.argv[2] || 'bob@test.com';
const password = process.argv[3] || 'bob12345';

async function testLogin() {
  console.log('Login test →', BASE);
  console.log('POST /api/auth/login', { email, password: '***' });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(`${BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const data = await res.json().catch(() => ({}));

    if (res.status === 200) {
      console.log('OK', res.status);
      console.log('User:', data.user?.email, '| role:', data.user?.role);
      console.log('Access token:', data.accessToken ? 'present' : 'missing');
      return;
    }
    console.log('FAIL', res.status, data.message || data);
    process.exit(1);
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') {
      console.error('Timeout: is the server running at', BASE, '?');
    } else {
      console.error('Error:', err.message);
    }
    console.error('\nStart server: npm start');
    console.error('Seed users:  npm run setup-db  or  npm run seed');
    process.exit(1);
  }
}

testLogin();
