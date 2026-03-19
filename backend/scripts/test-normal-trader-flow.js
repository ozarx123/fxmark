/**
 * Test normal trader flow: wallet -> trading account -> open/close trade -> balances.
 * Run from backend folder: node scripts/test-normal-trader-flow.js
 *
 * Preconditions:
 * - Backend server running (for auth) is NOT required; this uses repositories directly.
 * - MongoDB must be reachable (same as app).
 */
import 'dotenv/config';
import walletRepo from '../modules/wallet/wallet.repository.js';
import tradingAccountRepo from '../modules/trading/trading-account.repository.js';
import positionsService from '../modules/trading/positions.service.js';
import { getDb } from '../config/mongo.js';

async function getOrCreateTestUser() {
  const db = await getDb();
  const users = db.collection('users');
  const email = 'normal.trader.test@example.com';
  let user = await users.findOne({ email });
  if (!user) {
    const doc = {
      email,
      passwordHash: 'TEST_ONLY',
      role: 'trader',
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const { insertedId } = await users.insertOne(doc);
    user = { _id: insertedId, ...doc };
  }
  return { id: user._id.toString(), email: user.email };
}

async function main() {
  console.log('=== Normal trader flow test ===');
  const user = await getOrCreateTestUser();
  console.log('User:', user);

  // 1) Ensure wallet, deposit 1000 USD
  const walletBefore = await walletRepo.getOrCreateWallet(user.id, 'USD');
  console.log('Wallet before deposit:', walletBefore.balance);
  await walletRepo.updateBalance(user.id, 'USD', 1000, { bypassPairedGuard: true });
  await walletRepo.createTransaction({
    userId: user.id,
    type: 'deposit_test',
    amount: 1000,
    currency: 'USD',
    status: 'completed',
    reference: 'normal-trader-flow',
    completedAt: new Date(),
  });
  const walletAfterDeposit = await walletRepo.getOrCreateWallet(user.id, 'USD');
  console.log('Wallet after deposit +1000:', walletAfterDeposit.balance);

  // 2) Create live trading account and transfer 500 from wallet to trading
  const accountId = await tradingAccountRepo.create({
    userId: user.id,
    type: 'live',
    name: 'Normal Trader Test',
    balance: 0,
    tradingEnabled: true,
  });
  const account = await tradingAccountRepo.findById(accountId, user.id);
  console.log('New trading account:', { id: account.id, balance: account.balance, type: account.type });

  const transferAmount = 500;
  await walletRepo.updateBalance(user.id, 'USD', -transferAmount, { bypassPairedGuard: true });
  await walletRepo.createTransaction({
    userId: user.id,
    type: 'internal_transfer_to_trading',
    amount: -transferAmount,
    currency: 'USD',
    status: 'completed',
    reference: account.id,
    completedAt: new Date(),
  });
  await tradingAccountRepo.updateBalance(account.id, user.id, transferAmount);

  const walletAfterTransfer = await walletRepo.getOrCreateWallet(user.id, 'USD');
  const accountAfterTransfer = await tradingAccountRepo.findById(account.id, user.id);
  console.log('Wallet after transfer -500:', walletAfterTransfer.balance);
  console.log('Trading account after transfer +500:', accountAfterTransfer.balance);

  // 3) Open a position (directly via repo to avoid price feeds)
  const db = await getDb();
  const positionsCol = db.collection('positions');
  const posDoc = {
    userId: user.id,
    accountId: account.id,
    symbol: 'EURUSD',
    side: 'buy',
    volume: 0.01,
    openPrice: 1.1000,
    openedAt: new Date(),
  };
  const { insertedId } = await positionsCol.insertOne(posDoc);
  const positionId = insertedId.toString();
  console.log('Opened test position:', positionId);

  // 4) Close the position with a small profit using positionsService
  const closePrice = 1.1010; // 10 pips profit
  const closed = await positionsService.closePosition(user.id, positionId, {
    closePrice,
    accountId: account.id,
    bypassAdmin: true,
  });
  console.log('Closed position result:', { pnl: closed.pnl, accountId: closed.accountId });

  // 5) Check final balances
  const walletFinal = await walletRepo.getOrCreateWallet(user.id, 'USD');
  const accountFinal = await tradingAccountRepo.findById(account.id, user.id);
  console.log('Final wallet balance:', walletFinal.balance);
  console.log('Final trading account balance:', accountFinal.balance);

  console.log('\nSummary:');
  console.log('- Deposit +1000 to wallet');
  console.log('- Transfer 500 wallet -> trading account');
  console.log('- Open and close one EURUSD trade with profit; P&L should reflect in trading account, not wallet.');
}

main().then(() => {
  console.log('\nDone.');
  process.exit(0);
}).catch((err) => {
  console.error('Error in test-normal-trader-flow:', err);
  process.exit(1);
});

