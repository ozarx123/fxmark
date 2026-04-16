/**
 * Verify MongoDB market history (ticks + OHLC) read/write and footprint helpers.
 * Inserts tagged test rows, reads them back, then deletes them.
 *
 * Run from backend: npm run test:market-history
 * Requires CONNECTION_STRING and the same DB policy as the API (see config/mongo.js).
 */
import 'dotenv/config';
import { getDb } from '../config/mongo.js';
import * as marketHistory from '../models/marketHistory.model.js';
import {
  insertTicksMany,
  insertOhlcBar,
  findOhlcBars,
  getMarketHistoryFootprintBytes,
} from '../modules/market/market-history.repository.js';

async function main() {
  const db = await getDb();
  const tag = `fxmark-test-${Date.now()}`;
  const testSource = tag;

  console.log('Database:', db.databaseName);
  console.log('Test tag:', tag);

  const fp0 = await getMarketHistoryFootprintBytes();
  console.log('Footprint before (bytes):', fp0);

  const now = new Date();
  const tickDocs = [
    {
      symbol: 'XAUUSD',
      ts: now,
      price: 2650.12,
      quote: { open: 2650, high: 2651, low: 2649, close: 2650.12, volume: 0 },
      source: testSource,
    },
    {
      symbol: 'XAUUSD',
      ts: new Date(now.getTime() + 1),
      price: 2650.15,
      quote: { open: 2650, high: 2651, low: 2649, close: 2650.15, volume: 0 },
      source: testSource,
    },
  ];

  console.log('Inserting', tickDocs.length, 'test ticks...');
  await insertTicksMany(tickDocs);

  const ticksCol = db.collection(marketHistory.TICKS_COLLECTION);
  const tickCount = await ticksCol.countDocuments({ source: testSource });
  if (tickCount !== 2) {
    throw new Error(`Expected 2 test ticks, found ${tickCount}`);
  }
  console.log('OK: test ticks visible in DB');

  const testBarTime = 1234567890;
  await db.collection(marketHistory.OHLC_COLLECTION).deleteOne({
    symbol: 'XAUUSD',
    tf: '1m',
    time: testBarTime,
  });

  console.log('Inserting test OHLC bar (time=', testBarTime, ')...');
  await insertOhlcBar({
    symbol: 'XAUUSD',
    tf: '1m',
    time: testBarTime,
    open: 2650,
    high: 2652,
    low: 2648,
    close: 2651,
    volume: 42,
  });

  const bars = await findOhlcBars('XAUUSD', '1m', {
    fromSec: testBarTime,
    toSec: testBarTime,
  });
  const found = bars.find((b) => b.time === testBarTime);
  if (!found || found.close !== 2651 || found.volume !== 42) {
    throw new Error(`OHLC readback mismatch: ${JSON.stringify(found)}`);
  }
  console.log('OK: OHLC readback matches');

  const fp1 = await getMarketHistoryFootprintBytes();
  console.log('Footprint after (bytes):', fp1);

  console.log('Cleaning up test data...');
  const delTicks = await ticksCol.deleteMany({ source: testSource });
  const delBar = await db.collection(marketHistory.OHLC_COLLECTION).deleteOne({
    symbol: 'XAUUSD',
    tf: '1m',
    time: testBarTime,
  });
  console.log('Deleted ticks:', delTicks.deletedCount, 'ohlc:', delBar.deletedCount);

  console.log('\nAll checks passed.');
}

main().catch((err) => {
  console.error('FAILED:', err.message);
  process.exit(1);
});
