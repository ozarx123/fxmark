/**
 * Test updated features: execution mode, hybrid rules, account config (CRM), trading permission.
 * Server must be running. Uses admin@test.com for admin APIs, bob@test.com for trading.
 * Run: node scripts/test-updated-features.js
 */
import 'dotenv/config';

const BASE = process.env.API_URL || 'http://localhost:3000';
const API = `${BASE}/api`;

let adminToken = null;
let bobToken = null;
let bobUserId = null;
const results = { pass: 0, fail: 0 };

async function request(method, path, body = null, authToken = undefined) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  const t = authToken === undefined ? adminToken : authToken;
  if (t) opts.headers['Authorization'] = `Bearer ${t}`;
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
  const pass = expected.includes(res.status);
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
  console.log('=== Testing updated features at', API, '===\n');

  // --- Health ---
  try {
    const health = await request('GET', '/health', null, false);
    if (health.status !== 200) throw new Error('Health check failed');
  } catch (err) {
    console.log('  ✗ Server unreachable:', err.message);
    console.log('\n  Start the server first: cd backend && npm run dev');
    process.exit(1);
  }

  // --- Admin login ---
  console.log('--- Auth (admin) ---');
  const adminLogin = await request('POST', '/auth/login', { email: 'admin@test.com', password: 'admin1234' }, false);
  if (!ok('POST /auth/login (admin)', adminLogin)) {
    console.log('\n  Tip: Run "npm run setup-db" to create admin@test.com');
    process.exit(1);
  }
  adminToken = adminLogin.data?.accessToken;

  // --- Execution mode ---
  console.log('\n--- Execution mode ---');
  const getMode = await request('GET', '/admin/execution-mode');
  ok('GET /admin/execution-mode', getMode);

  const currentMode = getMode.data?.executionMode || 'A_BOOK';
  const putMode = await request('PUT', '/admin/execution-mode', { executionMode: currentMode });
  ok('PUT /admin/execution-mode', putMode);

  const setBbook = await request('PUT', '/admin/execution-mode', { executionMode: 'B_BOOK' });
  ok('PUT /admin/execution-mode (B_BOOK)', setBbook);
  const restoreMode = await request('PUT', '/admin/execution-mode', { executionMode: currentMode });
  ok('PUT /admin/execution-mode (restore)', restoreMode);

  // --- Hybrid rules ---
  console.log('\n--- Hybrid rules ---');
  const getRules = await request('GET', '/admin/hybrid-rules');
  ok('GET /admin/hybrid-rules', getRules);

  const rules = getRules.data?.hybridRules || getRules.data || {};
  const putRules = await request('PUT', '/admin/hybrid-rules', {
    volumeThresholdToABook: rules.volumeThresholdToABook ?? 5,
    maxInternalExposurePerSymbol: rules.maxInternalExposurePerSymbol ?? 100,
  });
  ok('PUT /admin/hybrid-rules', putRules);

  // --- Account config (CRM) ---
  console.log('\n--- Account config (CRM) ---');
  const usersRes = await request('GET', '/admin/users');
  ok('GET /admin/users', usersRes);
  const targetUser = usersRes.data?.[0]?.id || usersRes.data?.[0]?._id;
  if (!targetUser) {
    console.log('  ⊘ Skip account config (no users)');
  } else {
    const accountsRes = await request('GET', `/admin/trading/users/${targetUser}/accounts`);
    ok('GET /admin/trading/users/:userId/accounts', accountsRes);
    const accountId = accountsRes.data?.[0]?.id || accountsRes.data?.[0]?._id;
    if (!accountId) {
      console.log('  ⊘ Skip account config (no accounts for user)');
    } else {
      const getConfig = await request('GET', `/admin/trading/users/${targetUser}/accounts/${accountId}/config`);
      ok('GET /admin/trading/users/:userId/accounts/:accountId/config', getConfig);

      const configBody = {
        leverage: 500,
        executionGroup: 'default',
        tradingEnabled: true,
      };
      const putConfig = await request('PUT', `/admin/trading/users/${targetUser}/accounts/${accountId}/config`, configBody);
      ok('PUT /admin/trading/users/:userId/accounts/:accountId/config', putConfig);
    }
  }

  // --- Trading (bob) — order flow with validator ---
  console.log('\n--- Trading (order + validator) ---');
  const bobLogin = await request('POST', '/auth/login', { email: 'bob@test.com', password: 'bob12345' }, false);
  if (!ok('POST /auth/login (bob)', bobLogin)) {
    console.log('  ⊘ Skip trading tests (bob login failed)');
  } else {
    bobToken = bobLogin.data?.accessToken;
    bobUserId = bobLogin.data?.user?.id;

    const positions = await request('GET', '/trading/positions', null, bobToken);
    ok('GET /trading/positions', positions);

    const placeOrder = await request('POST', '/trading/orders', {
      symbol: 'EUR/USD',
      side: 'buy',
      volume: 0.01,
      type: 'market',
      executionPrice: 1.08,
    }, bobToken);
    ok('POST /trading/orders (market)', placeOrder, 201);
  }

  // --- Summary ---
  console.log('\n=== Summary ===');
  console.log('  Passed:', results.pass);
  console.log('  Failed:', results.fail);
  if (results.fail > 0) {
    process.exit(1);
  }
  console.log('\nAll updated-feature tests passed.');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
