/**
 * Test IB commission engine — create IB profile, run trades, show balance & payouts
 * Run from backend: node scripts/test-ib-commission.js
 */
import 'dotenv/config';
import { getDb } from '../config/mongo.js';
import ibRepo from '../modules/ib/ib.repository.js';
import commissionEngine from '../modules/ib/commission.engine.js';
import payoutService from '../modules/ib/payout.service.js';
import levelCalculator from '../modules/ib/level.calculator.js';

async function run() {
  console.log('=== IB Commission Engine Test ===\n');

  const db = await getDb();
  const usersCol = db.collection('users');
  const bob = await usersCol.findOne({ email: 'bob@test.com' });
  if (!bob) {
    console.error('Run npm run seed first to create dummy users (bob@test.com)');
    process.exit(1);
  }
  const ibUserId = bob._id.toString();
  console.log('1. Using IB user:', bob.email, '| userId:', ibUserId);

  let profile = await ibRepo.getProfileByUserId(ibUserId);
  if (!profile) {
    const id = await ibRepo.createProfile({
      userId: ibUserId,
      parentId: null,
      ratePerLot: 7,
      currency: 'USD',
    });
    profile = await ibRepo.getProfileById(id);
    console.log('2. Created IB profile:', profile.id, '| ratePerLot:', profile.ratePerLot, '| level 1 (no parent)\n');
  } else {
    console.log('2. Existing IB profile:', profile.id, '| ratePerLot:', profile.ratePerLot);
    const level = await levelCalculator.getLevel(ibUserId);
    console.log('   Level:', level, '\n');
  }

  const trades = [
    { id: 'trade-1', volume: 1, symbol: 'XAUUSD', currency: 'USD' },
    { id: 'trade-2', volume: 2.5, symbol: 'XAUUSD', currency: 'USD' },
    { id: 'trade-3', volume: 0.5, symbol: 'EURUSD', currency: 'USD' },
  ];

  console.log('3. Calculating commission for', trades.length, 'trades:');
  for (const trade of trades) {
    const result = await commissionEngine.calculate(trade, ibUserId, 'client-123');
    console.log('   Trade:', trade.id, '| volume:', trade.volume, 'lots | commission:', result.amount, result.currency, '| commissionId:', result.commissionId || '-');
  }

  const balance = await payoutService.getBalance(ibUserId);
  console.log('\n4. IB Balance:', balance);

  const commissions = await payoutService.listCommissions(ibUserId, { limit: 10 });
  console.log('\n5. Commissions list (' + commissions.length + '):');
  commissions.forEach((c, i) => {
    console.log('   ', i + 1, '|', c.amount, c.currency, '|', c.volume, 'lots |', c.symbol, '| status:', c.status, '|', c.createdAt?.toISOString?.() || c.createdAt);
  });

  if (balance.pending > 0) {
    const payout = await payoutService.requestPayout(ibUserId);
    console.log('\n6. Requested payout:', payout);
    const balanceAfter = await payoutService.getBalance(ibUserId);
    console.log('   Balance after payout request:', balanceAfter);
    const payouts = await payoutService.listPayouts(ibUserId, { limit: 5 });
    console.log('\n7. Payouts list (' + payouts.length + '):');
    payouts.forEach((p, i) => {
      console.log('   ', i + 1, '|', p.amount, p.currency, '| status:', p.status, '|', p.requestedAt?.toISOString?.() || p.requestedAt);
    });
  } else {
    console.log('\n6. No pending commission to payout (already paid or no new trades).');
  }

  console.log('\n=== Test complete ===');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
