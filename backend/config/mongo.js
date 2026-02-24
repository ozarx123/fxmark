/**
 * MongoDB connection (shared client).
 * Uses CONNECTION_STRING from .env.
 * Use getDb() in modules that need the database.
 * ESM for use with src/index.js and future ESM modules.
 */
import 'dotenv/config';
import { MongoClient } from 'mongodb';

const rawUri = process.env.CONNECTION_STRING || process.env.MONGODB_URI;
// Trim: .env often has trailing newline/space, which breaks auth
const uri = rawUri ? rawUri.trim() : '';
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
    clientPromise = new MongoClient(connectUri, opts).connect();
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
 * Close the MongoDB client (e.g. on graceful shutdown).
 */
export async function closeMongo() {
  if (clientPromise) {
    const c = await clientPromise;
    await c.close();
    clientPromise = null;
  }
}
