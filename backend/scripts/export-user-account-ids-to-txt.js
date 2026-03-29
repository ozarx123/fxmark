/**
 * Writes all users' accountNo (portal / CRM login number) to a plain text file.
 * Uses MONGODB_URI from .env. Run from backend:
 *   node scripts/export-user-account-ids-to-txt.js
 *
 * Output: backend/user-account-ids.txt (tab-separated: accountNo, email, name)
 */
import 'dotenv/config';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getDb } from '../config/mongo.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_FILE = join(__dirname, '..', 'user-account-ids.txt');

async function main() {
  const db = await getDb();
  const rows = await db
    .collection('users')
    .find({}, { projection: { email: 1, name: 1, accountNo: 1 } })
    .sort({ accountNo: 1 })
    .toArray();

  const header = [
    '# FXMARK — users.accountNo (sign-in / CRM reference)',
    `# Generated: ${new Date().toISOString()}`,
    `# Total rows: ${rows.length}`,
    '#',
    'accountNo\temail\tname',
  ];

  const lines = rows.map((u) => {
    const no = u.accountNo != null && String(u.accountNo).trim() !== '' ? String(u.accountNo).trim() : '—';
    const email = (u.email || '').trim() || '—';
    const name = (u.name || '').trim().replace(/\t/g, ' ') || '—';
    return `${no}\t${email}\t${name}`;
  });

  const body = [...header, ...lines].join('\n') + '\n';
  writeFileSync(OUT_FILE, body, 'utf8');
  console.log('Wrote', OUT_FILE);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
