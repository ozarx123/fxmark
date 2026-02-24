/**
 * Ensure all model indexes exist in MongoDB.
 * Run from backend: node scripts/ensure-indexes.js
 */
import 'dotenv/config';
import { getDb } from '../config/mongo.js';
import * as models from '../models/index.js';

async function ensureIndexes() {
  const db = await getDb();
  const specs = [
    [models.user.COLLECTION, models.user.indexes],
    [models.refreshToken.COLLECTION, models.refreshToken.indexes],
    [models.wallet.WALLETS_COLLECTION, models.wallet.walletIndexes],
    [models.wallet.TRANSACTIONS_COLLECTION, models.wallet.transactionIndexes],
    [models.order.COLLECTION, models.order.indexes],
    [models.position.COLLECTION, models.position.indexes],
    [models.pamm.MANAGERS_COLLECTION, models.pamm.managerIndexes],
    [models.pamm.ALLOCATIONS_COLLECTION, models.pamm.allocationIndexes],
    [models.pamm.TRADES_COLLECTION, models.pamm.tradeIndexes],
    [models.ib.PROFILES_COLLECTION, models.ib.profileIndexes],
    [models.ib.COMMISSIONS_COLLECTION, models.ib.commissionIndexes],
    [models.ib.PAYOUTS_COLLECTION, models.ib.payoutIndexes],
    [models.ledger.LEDGER_COLLECTION, models.ledger.ledgerIndexes],
  ];

  console.log('Ensuring indexes...');
  for (const [collName, indexList] of specs) {
    if (!indexList || indexList.length === 0) continue;
    const col = db.collection(collName);
    for (const idx of indexList) {
      try {
        await col.createIndex(idx.keys, idx.options || {});
        console.log('  ', collName, Object.keys(idx.keys).join(','), 'ok');
      } catch (e) {
        if (e.code === 85 || e.codeName === 'IndexOptionsConflict') {
          console.log('  ', collName, 'already exists');
        } else {
          console.error('  ', collName, e.message);
        }
      }
    }
  }
  console.log('Done.');
}

ensureIndexes().catch((err) => {
  console.error(err);
  process.exit(1);
});
