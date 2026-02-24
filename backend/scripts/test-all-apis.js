/**
 * Test all APIs (server must be running).
 * Run: node scripts/test-all-apis.js
 * Or: npm run test:all (add to package.json)
 */
import 'dotenv/config';

const BASE = process.env.API_URL || 'http://localhost:3000';
const API = `${BASE}/api`;

let token = null;
let userId = null;
const results = { pass: 0, fail: 0 };

async function request(method, path, body = null, useToken = true) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (useToken && token) opts.headers['Authorization'] = `Bearer ${token}`;
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${API}${path}`, opts);
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: res.status, data };
}

function ok(name, res, expectStatus = 200) {
  const expected = Array.isArray(expectStatus) ? expectStatus : [expectStatus];
  const pass = expected.includes(res.status) || (expectStatus === '2xx' && res.status >= 200 && res.status < 300);
  if (pass) {
    results.pass++;
    console.log('  ✓', name);
  } else {
    results.fail++;
    console.log('  ✗', name, '→', res.status, res.data?.error || res.data);
  }
  return pass;
}

async function run() {
  console.log('=== Testing all APIs at', API, '===\n');

  // --- Health (fail fast if server unreachable) ---
  console.log('--- Health ---');
  try {
    const health = await request('GET', '/health', null, false);
    ok('GET /health', health);
  } catch (err) {
    console.log('  ✗ Server unreachable:', err.message);
    console.log('\n  Start the server first: cd backend && npm run dev');
    process.exit(1);
  }

  // --- Auth ---
  console.log('\n--- Auth ---');
  const login = await request('POST', '/auth/login', { email: 'bob@test.com', password: 'bob12345' }, false);
  if (!ok('POST /auth/login', login)) {
    console.log('\n  Tip: Run "npm run setup-db" and ensure server is running.');
    process.exit(1);
  }
  token = login.data?.accessToken;
  userId = login.data?.user?.id;

  const me = await request('GET', '/auth/me');
  ok('GET /auth/me', me);

  const signup = await request('POST', '/auth/register', { email: 'apitest@test.com', password: 'apitest1234' }, false);
  ok('POST /auth/register', signup, [201, 409]);

  // --- Wallet ---
  console.log('\n--- Wallet ---');
  const balance = await request('GET', '/wallet/balance');
  ok('GET /wallet/balance', balance);

  const deposits = await request('GET', '/wallet/deposits');
  ok('GET /wallet/deposits', deposits);

  const withdrawals = await request('GET', '/wallet/withdrawals');
  ok('GET /wallet/withdrawals', withdrawals);

  const createDep = await request('POST', '/wallet/deposits', { amount: 100, currency: 'USD' });
  const depId = createDep.data?.id;
  ok('POST /wallet/deposits', createDep, 201);

  if (depId) {
    const confirmDep = await request('POST', `/wallet/deposits/${depId}/confirm`, {}, true);
    ok('POST /wallet/deposits/:id/confirm', confirmDep);
  }

  // --- Trading ---
  console.log('\n--- Trading ---');
  const positions = await request('GET', '/trading/positions');
  ok('GET /trading/positions', positions);

  const orders = await request('GET', '/trading/orders');
  ok('GET /trading/orders', orders);

  const placeOrder = await request('POST', '/trading/orders', {
    symbol: 'EUR/USD',
    side: 'buy',
    volume: 0.01,
    type: 'market',
    executionPrice: 1.08,
  });
  ok('POST /trading/orders (market)', placeOrder, 201);

  const closedPos = await request('GET', '/trading/positions/closed');
  ok('GET /trading/positions/closed', closedPos);

  // --- PAMM ---
  console.log('\n--- PAMM ---');
  const managers = await request('GET', '/pamm/managers', null, false);
  ok('GET /pamm/managers (public)', managers);

  const myAlloc = await request('GET', '/pamm/managers/me/allocations');
  ok('GET /pamm/managers/me/allocations', myAlloc);

  const myManager = await request('GET', '/pamm/managers/me');
  ok('GET /pamm/managers/me', myManager, myManager.status === 404 ? 404 : 200);

  // --- IB ---
  console.log('\n--- IB ---');
  const ibProfile = await request('GET', '/ib/profile');
  ok('GET /ib/profile', ibProfile, ibProfile.status === 404 ? 404 : 200);

  const ibBalance = await request('GET', '/ib/balance');
  ok('GET /ib/balance', ibBalance);

  const ibCommissions = await request('GET', '/ib/commissions');
  ok('GET /ib/commissions', ibCommissions);

  const ibPayouts = await request('GET', '/ib/payouts');
  ok('GET /ib/payouts', ibPayouts);

  const ibReferrals = await request('GET', '/ib/referrals');
  ok('GET /ib/referrals', ibReferrals);

  // --- Finance / Ledger ---
  console.log('\n--- Finance ---');
  const ledgerEntries = await request('GET', '/finance/ledger/entries');
  ok('GET /finance/ledger/entries', ledgerEntries);

  const ledgerBalances = await request('GET', '/finance/ledger/balances');
  ok('GET /finance/ledger/balances', ledgerBalances);

  const ledgerPnl = await request('GET', '/finance/ledger/pnl');
  ok('GET /finance/ledger/pnl', ledgerPnl);

  const dailyReport = await request('GET', '/finance/reports/daily');
  ok('GET /finance/reports/daily', dailyReport);

  // --- Admin (if user has admin role) ---
  console.log('\n--- Admin ---');
  const adminUsers = await request('GET', '/admin/users');
  ok('GET /admin/users', adminUsers, adminUsers.status === 403 ? 403 : 200);

  const adminPamm = await request('GET', '/admin/pamm/managers');
  ok('GET /admin/pamm/managers', adminPamm, adminPamm.status === 403 ? 403 : 200);

  // --- Summary ---
  console.log('\n=== Summary ===');
  console.log('  Passed:', results.pass);
  console.log('  Failed:', results.fail);
  if (results.fail > 0) {
    process.exit(1);
  }
  console.log('\nAll API tests passed.');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
