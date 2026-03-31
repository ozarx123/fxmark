import { MongoClient } from 'mongodb';
import crypto from 'crypto';
import '../config/load-env.js';

const DEFAULT_URI = process.env.MONGO_URI || process.env.CONNECTION_STRING;
const sourceDb = process.argv[2] || process.env.SOURCE_DB || 'test';
const targetDb = process.argv[3] || process.env.TARGET_DB || 'test_staging_20260331104711';
const sampleSize = Number(process.env.SAMPLE_SIZE || 200);

if (!DEFAULT_URI) {
  console.error('Missing MONGO_URI/CONNECTION_STRING');
  process.exit(1);
}

function hashIds(ids) {
  return crypto.createHash('sha256').update(ids.join('|')).digest('hex');
}

async function main() {
  const client = new MongoClient(DEFAULT_URI);
  await client.connect();
  try {
    const src = client.db(sourceDb);
    const dst = client.db(targetDb);

    const [srcCols, dstCols] = await Promise.all([
      src.listCollections({}, { nameOnly: true }).toArray(),
      dst.listCollections({}, { nameOnly: true }).toArray(),
    ]);

    const srcSet = new Set(srcCols.map((c) => c.name));
    const dstSet = new Set(dstCols.map((c) => c.name));
    const onlySource = [...srcSet].filter((name) => !dstSet.has(name)).sort();
    const onlyTarget = [...dstSet].filter((name) => !srcSet.has(name)).sort();
    const common = [...srcSet].filter((name) => dstSet.has(name)).sort();

    const mismatches = [];
    for (const name of common) {
      const [srcCount, dstCount, srcIds, dstIds] = await Promise.all([
        src.collection(name).countDocuments({}),
        dst.collection(name).countDocuments({}),
        src.collection(name).find({}, { projection: { _id: 1 } }).sort({ _id: 1 }).limit(sampleSize).toArray(),
        dst.collection(name).find({}, { projection: { _id: 1 } }).sort({ _id: 1 }).limit(sampleSize).toArray(),
      ]);

      const srcHash = hashIds(srcIds.map((doc) => String(doc._id)));
      const dstHash = hashIds(dstIds.map((doc) => String(doc._id)));
      const match = srcCount === dstCount && srcHash === dstHash && srcIds.length === dstIds.length;
      if (!match) {
        mismatches.push({
          collection: name,
          srcCount,
          dstCount,
          srcSample: srcIds.length,
          dstSample: dstIds.length,
          sampleHashMatch: srcHash === dstHash,
        });
      }
    }

    const summary = {
      sourceDb,
      targetDb,
      sourceCollections: srcCols.length,
      targetCollections: dstCols.length,
      onlySource,
      onlyTarget,
      comparedCollections: common.length,
      mismatchedCollections: mismatches.length,
      mismatches,
    };
    console.log(JSON.stringify(summary, null, 2));

    if (onlySource.length || onlyTarget.length || mismatches.length) {
      process.exitCode = 2;
    }
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
