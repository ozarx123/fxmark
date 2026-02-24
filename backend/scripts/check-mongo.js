/**
 * Check MongoDB connection using CONNECTION_STRING from .env
 * Run from backend: node scripts/check-mongo.js
 */
import 'dotenv/config';
import { MongoClient } from 'mongodb';

const rawUri = process.env.CONNECTION_STRING || process.env.MONGODB_URI;
const envVar = process.env.CONNECTION_STRING ? 'CONNECTION_STRING' : (process.env.MONGODB_URI ? 'MONGODB_URI' : null);

if (!rawUri) {
  console.error('No CONNECTION_STRING or MONGODB_URI in .env');
  process.exit(1);
}

// Trim: .env often has trailing newline or space, which breaks auth
const uri = rawUri.trim();
if (uri !== rawUri) {
  console.log('Note: Connection string had leading/trailing whitespace — trimmed.');
}

console.log('Using', envVar, '| length:', uri.length, '| starts with:', uri.slice(0, 20) + '...');

// Mask password in logs
const safeUri = uri.replace(/:([^@]+)@/, ':****@');

async function check() {
  // Atlas often requires authSource=admin (default is often admin, but some setups need it explicit)
  let connectUri = uri;
  if (uri.includes('mongodb.net') && !uri.includes('authSource=')) {
    const sep = uri.includes('?') ? '&' : '?';
    connectUri = uri + sep + 'authSource=admin';
    console.log('Trying with authSource=admin (Atlas).');
  }

  const client = new MongoClient(connectUri, {
    serverSelectionTimeoutMS: 15000,
    connectTimeoutMS: 15000,
    autoSelectFamily: false,
    family: 4, // Force IPv4 - can fix SSL alert 80 on Windows
  });
  try {
    console.log('Connecting...', safeUri);
    await client.connect();
    await client.db('admin').command({ ping: 1 });
    console.log('MongoDB connection: OK');
    const list = await client.db().admin().listDatabases();
    console.log('Databases:', list.databases?.map((d) => d.name).join(', ') || '—');
  } catch (err) {
    console.error('MongoDB connection: FAILED\n');
    console.error('Error:', err.message);
    if (err.code) console.error('Code:', err.code);
    if (err.cause) console.error('Cause:', err.cause?.message || err.cause);

    if (err.message?.includes('ENOTFOUND') || err.message?.includes('querySrv')) {
      console.error('\n→ DNS/network: Check internet, firewall, or try from another network.');
      console.error('→ If using VPN, try without it (or the opposite).');
    }
    if (err.message?.includes('authentication') || err.message?.includes('bad auth') || err.code === 18 || err.code === 8000) {
      console.error('\n→ Auth failed: Check username/password in Atlas and in .env.');
      console.error('→ If password has special chars (@ # % etc.), URL-encode it in CONNECTION_STRING.');
      console.error('   Run: $env:ENCODE_PASSWORD="yourpassword"; npm run encode-password');
      console.error('   Then put the output in place of PASSWORD in your connection string.');
    }
    if (err.message?.includes('IP') || err.message?.includes('whitelist')) {
      console.error('\n→ Atlas Network Access: Add your IP (or 0.0.0.0/0 for testing) in MongoDB Atlas.');
    }
    if (err.message?.includes('SSL') || err.message?.includes('TLS') || err.message?.includes('alert')) {
      console.error('\n→ SSL/TLS error: Try in MongoDB Atlas: Network Access → Add IP Address (or 0.0.0.0/0 for testing).');
      console.error('→ Or use local MongoDB: CONNECTION_STRING=mongodb://localhost:27017/fxmark');
      console.error('→ Or try without VPN, or from a different network.');
    }

    process.exit(1);
  } finally {
    await client.close();
  }
}

check();
