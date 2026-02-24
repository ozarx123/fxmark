/**
 * Test PAMM wallet transfers: follow (deduct), unfollow (return), addFunds, withdraw.
 * Server must be running. Run: node scripts/test-pamm-wallet.js
 * NOTE: Restart the backend (npm run dev) before testing to ensure latest wallet logic is loaded.
 */
import 'dotenv/config';

const BASE = process.env.API_URL || 'http://localhost:3000';
const API = `${BASE}/api`;

let managerToken = null;
let investorToken = null;
let fundId = null;
let allocationId = null;

async function request(method, path, body = null, token = null) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (token) opts.headers['Authorization'] = `Bearer ${token}`;
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

async function getWalletBalance(token) {
  const r = await request('GET', '/wallet/balance?currency=USD', null, token);
  return r.status === 200 ? (r.data?.balance ?? 0) : null;
}

function assert(cond, msg) {
  if (!cond) {
    console.error('  ✗ ASSERT:', msg);
    process.exit(1);
  }
  console.log('  ✓', msg);
}

async function run() {
  console.log('=== PAMM Wallet Transfer Tests ===\n');
  console.log('Server:', API);
  console.log('If wallet does not change: run "npm run fix-wallet-userids" then retry.\n');

  // Health check
  try {
    const h = await request('GET', '/health', null, false);
    if (h.status !== 200) throw new Error('Server not ready');
  } catch (err) {
    console.error('Server unreachable. Start: cd backend && npm run dev');
    process.exit(1);
  }

  // 1. Manager (bob) login and create fund with trading account
  console.log('--- Setup: Manager creates fund ---');
  const loginBob = await request('POST', '/auth/login', { email: 'bob@test.com', password: 'bob12345' }, false);
  assert(loginBob.status === 200, 'Bob login');
  managerToken = loginBob.data?.accessToken;

  const createFund = await request('POST', '/pamm/managers', {
    name: 'Wallet Test Fund',
    fundType: 'growth',
    strategy: 'Test',
    performanceFeePercent: 10,
    fundSize: 10000,
    currentDeposit: 1000,
  }, managerToken);
  assert(createFund.status === 201, 'Create fund');
  fundId = createFund.data?.id;
  assert(fundId, 'Fund has id');
  assert(createFund.data?.tradingAccountId, 'Fund has trading account');

  // Approve fund (admin)
  const loginAdmin = await request('POST', '/auth/login', { email: 'admin@test.com', password: 'admin1234' }, false);
  assert(loginAdmin.status === 200, 'Admin login');
  const approve = await request('PATCH', `/admin/pamm/managers/${fundId}`, { approvalStatus: 'approved' }, loginAdmin.data?.accessToken);
  assert(approve.status === 200, 'Approve fund');

  // 2. Investor (alice) login, deposit, get initial balance
  console.log('\n--- Setup: Investor deposits ---');
  const loginAlice = await request('POST', '/auth/login', { email: 'alice@test.com', password: 'alice1234' }, false);
  assert(loginAlice.status === 200, 'Alice login');
  investorToken = loginAlice.data?.accessToken;

  const createDep = await request('POST', '/wallet/deposits', { amount: 500, currency: 'USD' }, investorToken);
  assert(createDep.status === 201, 'Create deposit');
  const depId = createDep.data?.id;
  await request('POST', `/wallet/deposits/${depId}/confirm`, {}, investorToken);

  const balanceBefore = await getWalletBalance(investorToken);
  assert(balanceBefore >= 500, `Balance before follow: ${balanceBefore}`);

  // 3. Follow — wallet should decrease
  console.log('\n--- Follow: deduct from wallet ---');
  const followRes = await request('POST', '/pamm/follow', {
    managerId: fundId,
    allocatedBalance: 100,
  }, investorToken);
  assert(followRes.status === 201, 'Follow');
  allocationId = followRes.data?.allocationId;

  const balanceAfterFollow = await getWalletBalance(investorToken);
  assert(balanceAfterFollow === balanceBefore - 100, `Wallet decreased: ${balanceBefore} → ${balanceAfterFollow}`);

  // 4. Add funds — wallet should decrease again
  console.log('\n--- Add funds: deduct from wallet ---');
  const addRes = await request('POST', '/pamm/add-funds', {
    allocationId,
    amount: 50,
  }, investorToken);
  assert(addRes.status === 200, 'Add funds');

  const balanceAfterAdd = await getWalletBalance(investorToken);
  assert(balanceAfterAdd === balanceAfterFollow - 50, `Wallet decreased: ${balanceAfterFollow} → ${balanceAfterAdd}`);

  // 5. Withdraw (partial) — wallet should increase
  console.log('\n--- Withdraw: return to wallet ---');
  const withdrawRes = await request('POST', '/pamm/withdraw', {
    allocationId,
    amount: 50,
  }, investorToken);
  assert(withdrawRes.status === 200, 'Withdraw');

  const balanceAfterWithdraw = await getWalletBalance(investorToken);
  assert(balanceAfterWithdraw === balanceAfterAdd + 50, `Wallet increased: ${balanceAfterAdd} → ${balanceAfterWithdraw}`);

  // 6. Unfollow — full amount (150) should return
  console.log('\n--- Unfollow: return full allocation ---');
  const unfollowRes = await request('POST', '/pamm/unfollow', { allocationId }, investorToken);
  assert(unfollowRes.status === 200, 'Unfollow');

  const balanceAfterUnfollow = await getWalletBalance(investorToken);
  assert(balanceAfterUnfollow === balanceAfterWithdraw + 100, `Wallet returned: ${balanceAfterWithdraw} → ${balanceAfterUnfollow}`);
  assert(balanceAfterUnfollow === balanceBefore, `Final balance matches initial: ${balanceAfterUnfollow} === ${balanceBefore}`);

  console.log('\n=== All PAMM wallet tests passed ===');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
