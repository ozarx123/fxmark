/**
 * Writes all user documents from MongoDB to a plain text file (pretty JSON per user).
 * Secrets are not exported literally (replaced with [redacted]).
 *
 * Run from backend folder:
 *   node scripts/export-user-records-full-to-txt.js
 *
 * Output: backend/user-records-full.txt
 */
import 'dotenv/config';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { ObjectId } from 'mongodb';
import { getDb } from '../config/mongo.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_FILE = join(__dirname, '..', 'user-records-full.txt');

const REDACT_KEYS = new Set([
  'passwordHash',
  'investorPasswordHash',
  'emailVerificationToken',
  'emailVerificationExpires',
  'passwordResetToken',
  'passwordResetExpires',
]);

function toPlain(value) {
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return value.toISOString();
  if (value instanceof ObjectId) return value.toString();
  if (Array.isArray(value)) return value.map((v) => toPlain(v));
  if (typeof value === 'object') {
    if (value._bsontype === 'ObjectId' && typeof value.toString === 'function') {
      return value.toString();
    }
    if (value._bsontype === 'Binary' && typeof value.toString === 'function') {
      return `[Binary ${value.length ?? '?'} bytes]`;
    }
    if (Buffer.isBuffer(value)) return `[Buffer ${value.length} bytes]`;
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (REDACT_KEYS.has(k)) {
        out[k] = '[redacted]';
        continue;
      }
      out[k] = toPlain(v);
    }
    return out;
  }
  return value;
}

async function main() {
  const db = await getDb();
  const rows = await db.collection('users').find({}).sort({ createdAt: 1 }).toArray();

  const header = [
    '# FXMARK — full user documents from collection `users`',
    '# Password hashes and reset/verification tokens are listed as [redacted]',
    `# Generated: ${new Date().toISOString()}`,
    `# Total users: ${rows.length}`,
    '#',
    '',
  ].join('\n');

  const blocks = rows.map((doc, i) => {
    const plain = toPlain(doc);
    return `================ user ${i + 1} / ${rows.length} ================\n${JSON.stringify(plain, null, 2)}`;
  });

  writeFileSync(OUT_FILE, header + blocks.join('\n\n') + '\n', 'utf8');
  console.log('Wrote', OUT_FILE);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
