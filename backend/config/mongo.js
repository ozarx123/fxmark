/**
 * MongoDB connection (shared client).
 * Uses CONNECTION_STRING from .env.
 * Use getDb() in modules that need the database.
 * ESM for use with src/index.js and future ESM modules.
 */
import './load-env.js';
import { MongoClient } from 'mongodb';

const rawUri = process.env.CONNECTION_STRING || process.env.MONGODB_URI;
// Trim: .env often has trailing newline/space, which breaks auth
const uri = rawUri ? rawUri.trim() : '';
const nodeEnv = String(process.env.NODE_ENV || 'development').toLowerCase();
const requiredProdDbName = String(process.env.REQUIRED_PROD_DB_NAME || 'test').trim();
const requiredNonProdDbName = String(
  process.env.REQUIRED_NON_PROD_DB_NAME || 'test_staging_20260331104711'
).trim();
const apiUrl = String(process.env.API_URL || '').trim().toLowerCase();
const frontendUrl = String(process.env.FRONTEND_URL || process.env.WEB_APP_URL || '').trim().toLowerCase();

function isLocalUrl(urlValue) {
  return (
    urlValue.startsWith('http://localhost') ||
    urlValue.startsWith('https://localhost') ||
    urlValue.startsWith('http://127.0.0.1') ||
    urlValue.startsWith('https://127.0.0.1')
  );
}

function isLocalRuntime() {
  return isLocalUrl(apiUrl) || isLocalUrl(frontendUrl);
}

function getDbNameFromUri(mongoUri) {
  if (!mongoUri) return '';
  const m = mongoUri.match(/^mongodb(?:\+srv)?:\/\/[^/]+\/([^?]*)/i);
  if (!m) return '';
  const db = decodeURIComponent(m[1] || '').trim();
  // mongodb://host or mongodb+srv://host/?... => Mongo defaults to "test"
  return db || 'test';
}

function assertEnvironmentDbPolicy(mongoUri) {
  const dbName = getDbNameFromUri(mongoUri);
  if (!dbName) return;
  if (dbName === requiredProdDbName && isLocalRuntime()) {
    throw new Error(
      `[mongo-policy] local runtime is not allowed to use production database "${requiredProdDbName}".`
    );
  }
  if (nodeEnv === 'production') {
    if (dbName !== requiredProdDbName) {
      throw new Error(
        `[mongo-policy] production must use database "${requiredProdDbName}", got "${dbName}".`
      );
    }
    return;
  }
  if (nodeEnv === 'development' || nodeEnv === 'staging') {
    if (dbName !== requiredNonProdDbName) {
      throw new Error(
        `[mongo-policy] ${nodeEnv} must use database "${requiredNonProdDbName}", got "${dbName}".`
      );
    }
  }
}

assertEnvironmentDbPolicy(uri);
// Atlas: ensure authSource=admin when not present
const connectUri =
  uri && uri.includes('mongodb.net') && !uri.includes('authSource=')
    ? uri + (uri.includes('?') ? '&' : '?') + 'authSource=admin'
    : uri;

let clientPromise = null;

export function getClient() {
  if (!connectUri) {
    throw new Error('CONNECTION_STRING or MONGODB_URI is not set in .env');
  }
  if (!clientPromise) {
    const opts = {};
    if (connectUri.includes('mongodb.net')) {
      opts.autoSelectFamily = false;
      opts.family = 4; // Force IPv4 - can fix SSL alert 80 on Windows
    }
    // If connect() rejects once, clear the cache so the next request retries (Atlas wake-up, DNS, etc.).
    clientPromise = new MongoClient(connectUri, opts).connect().catch((err) => {
      clientPromise = null;
      return Promise.reject(err);
    });
  }
  return clientPromise;
}

/**
 * Get the default database. Pass dbName to use a specific database.
 * @param {string} [dbName] - Optional database name (default from URI)
 * @returns {Promise<import('mongodb').Db>}
 */
export async function getDb(dbName) {
  const c = await getClient();
  return c.db(dbName || undefined);
}

/**
 * Run a function inside a MongoDB transaction. All operations must use the same session.
 * Use for atomic wallet + ledger + transaction record updates.
 * @param {(session: import('mongodb').ClientSession) => Promise<T>} asyncFn
 * @returns {Promise<T>}
 */
export async function withTransaction(asyncFn) {
  const client = await getClient();
  const session = client.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await asyncFn(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}

/**
 * Close the MongoDB client (e.g. on graceful shutdown).
 */
export async function closeMongo() {
  if (!clientPromise) return;
  try {
    const c = await clientPromise;
    await c.close();
  } catch {
    /* ignore close after failed connect */
  } finally {
    clientPromise = null;
  }
}
