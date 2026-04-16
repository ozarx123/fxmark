/**
 * Read/write MongoDB tick + OHLC bar history (internal market feed).
 */
import { getDb } from '../../config/mongo.js';
import * as marketHistory from '../../models/marketHistory.model.js';

/** Total storage budget for market_ticks + market_ohlc_bars (bytes). 0 = disabled. Default 100 MiB. */
const MAX_MARKET_HISTORY_BYTES = Math.max(
  0,
  parseInt(process.env.MARKET_HISTORY_MAX_BYTES || '104857600', 10) || 0
);

const CAP_TRIM_BATCH = Math.max(500, parseInt(process.env.MARKET_HISTORY_TRIM_BATCH || '8000', 10) || 8000);
const CAP_CHECK_MIN_MS = Math.max(5000, parseInt(process.env.MARKET_HISTORY_CAP_CHECK_MIN_MS || '45000', 10) || 45000);

let indexesPromise = null;
let lastCapCheckAt = 0;
let capCheckScheduled = false;

async function collectionFootprintBytes(db, collName) {
  try {
    const s = await db.command({ collStats: collName, scale: 1 });
    return (Number(s.storageSize) || 0) + (Number(s.totalIndexSize) || 0);
  } catch (e) {
    if (e.code === 26 || e.codeName === 'NamespaceNotFound') return 0;
    throw e;
  }
}

export async function getMarketHistoryFootprintBytes() {
  const db = await getDb();
  const ticks = await collectionFootprintBytes(db, marketHistory.TICKS_COLLECTION);
  const ohlc = await collectionFootprintBytes(db, marketHistory.OHLC_COLLECTION);
  return { ticks, ohlc, total: ticks + ohlc };
}

/**
 * Deletes oldest ticks / then oldest OHLC until combined footprint is under targetBytes.
 */
export async function enforceMarketHistoryStorageCap() {
  if (MAX_MARKET_HISTORY_BYTES <= 0) return { trimmed: false, total: 0, target: 0 };

  const db = await getDb();
  const ticksCol = db.collection(marketHistory.TICKS_COLLECTION);
  const ohlcCol = db.collection(marketHistory.OHLC_COLLECTION);

  const targetBytes = Math.floor(MAX_MARKET_HISTORY_BYTES * 0.88);
  let total = (await getMarketHistoryFootprintBytes()).total;
  if (total <= targetBytes) return { trimmed: false, total, target: targetBytes };

  let deletedTicks = 0;
  let deletedOhlc = 0;
  let guard = 0;

  while (total > targetBytes && guard < 400) {
    guard += 1;
    const tickIds = await ticksCol
      .find({})
      .project({ _id: 1 })
      .sort({ ts: 1 })
      .limit(CAP_TRIM_BATCH)
      .toArray();
    if (tickIds.length) {
      const r = await ticksCol.deleteMany({ _id: { $in: tickIds.map((d) => d._id) } });
      deletedTicks += r.deletedCount || 0;
    } else {
      const oids = await ohlcCol
        .find({})
        .project({ _id: 1 })
        .sort({ time: 1 })
        .limit(Math.min(CAP_TRIM_BATCH, 2000))
        .toArray();
      if (!oids.length) break;
      const r2 = await ohlcCol.deleteMany({ _id: { $in: oids.map((d) => d._id) } });
      deletedOhlc += r2.deletedCount || 0;
    }
    total = (await getMarketHistoryFootprintBytes()).total;
  }

  if (deletedTicks || deletedOhlc) {
    console.warn(
      `[market-history] storage cap ${MAX_MARKET_HISTORY_BYTES}B: trimmed ticks=${deletedTicks} ohlc=${deletedOhlc} footprint≈${total}B`
    );
  }

  return { trimmed: deletedTicks + deletedOhlc > 0, total, target: targetBytes, deletedTicks, deletedOhlc };
}

function scheduleMarketHistoryCapCheck() {
  if (MAX_MARKET_HISTORY_BYTES <= 0) return;
  const now = Date.now();
  if (now - lastCapCheckAt < CAP_CHECK_MIN_MS) {
    if (!capCheckScheduled) {
      capCheckScheduled = true;
      setTimeout(() => {
        capCheckScheduled = false;
        lastCapCheckAt = Date.now();
        enforceMarketHistoryStorageCap().catch((e) =>
          console.warn('[market-history] cap check:', e.message)
        );
      }, CAP_CHECK_MIN_MS - (now - lastCapCheckAt));
    }
    return;
  }
  lastCapCheckAt = now;
  enforceMarketHistoryStorageCap().catch((e) => console.warn('[market-history] cap check:', e.message));
}

async function ensureIndexes() {
  if (!indexesPromise) {
    const db = await getDb();
    indexesPromise = (async () => {
      const ticksCol = db.collection(marketHistory.TICKS_COLLECTION);
      const ohlcCol = db.collection(marketHistory.OHLC_COLLECTION);
      for (const idx of marketHistory.ticksIndexes) {
        try {
          await ticksCol.createIndex(idx.keys, idx.options || {});
        } catch (e) {
          if (e.code !== 85 && e.codeName !== 'IndexOptionsConflict') throw e;
        }
      }
      for (const idx of marketHistory.ohlcIndexes) {
        try {
          await ohlcCol.createIndex(idx.keys, idx.options || {});
        } catch (e) {
          if (e.code !== 85 && e.codeName !== 'IndexOptionsConflict') throw e;
        }
      }
    })();
  }
  return indexesPromise;
}

/**
 * @param {Array<{
 *   symbol: string,
 *   ts: Date,
 *   price: number,
 *   quote: { open: number, high: number, low: number, close: number, volume: number },
 *   source: string
 * }>} docs
 */
export async function insertTicksMany(docs) {
  if (!docs?.length) return;
  await ensureIndexes();
  const db = await getDb();
  await db.collection(marketHistory.TICKS_COLLECTION).insertMany(docs, { ordered: false });
  scheduleMarketHistoryCapCheck();
}

/**
 * @param {object} doc - { symbol, tf, time, open, high, low, close, volume }
 */
export async function insertOhlcBar(doc) {
  await ensureIndexes();
  const db = await getDb();
  try {
    await db.collection(marketHistory.OHLC_COLLECTION).insertOne(doc);
    scheduleMarketHistoryCapCheck();
  } catch (e) {
    if (e.code === 11000) return;
    throw e;
  }
}

function mapOhlcRow(r) {
  return {
    time: r.time,
    open: r.open,
    high: r.high,
    low: r.low,
    close: r.close,
    volume: r.volume ?? 0,
  };
}

/**
 * @param {string} symbol - e.g. XAUUSD
 * @param {string} tf - 1m, 5m, ...
 * @param {{ fromSec?: number, toSec?: number, limit?: number }} range - if no from/to, use `limit` newest bars (ascending by time).
 * @returns {Promise<Array<{ time: number, open: number, high: number, low: number, close: number, volume: number }>>}
 */
export async function findOhlcBars(symbol, tf, range = {}) {
  await ensureIndexes();
  const { fromSec, toSec, limit } = range;
  const db = await getDb();
  const col = db.collection(marketHistory.OHLC_COLLECTION);
  const q = { symbol, tf };

  if (fromSec != null || toSec != null) {
    q.time = {};
    if (fromSec != null) q.time.$gte = fromSec;
    if (toSec != null) q.time.$lte = toSec;
    let cur = col.find(q).sort({ time: -1 });
    if (limit != null && Number.isFinite(limit)) cur = cur.limit(limit);
    const rows = await cur.toArray();
    rows.reverse();
    return rows.map(mapOhlcRow);
  }

  if (limit != null && Number.isFinite(limit)) {
    const rows = await col.find(q).sort({ time: -1 }).limit(limit).toArray();
    rows.reverse();
    return rows.map(mapOhlcRow);
  }

  const rows = await col.find(q).sort({ time: 1 }).toArray();
  return rows.map(mapOhlcRow);
}
