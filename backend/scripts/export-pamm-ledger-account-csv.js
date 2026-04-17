/**
 * Export PAMM-related ledger rows for a user (by operational account number) to CSV.
 *
 *   TARGET_DB=test node scripts/export-pamm-ledger-account-csv.js 10020
 *   TARGET_DB=test node scripts/export-pamm-ledger-account-csv.js --account=10020 --out=./logs/pamm-10020.csv
 *
 * Uses CONNECTION_STRING from .env. TARGET_DB / MONGO_DATABASE selects the database (e.g. main app DB `test`).
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ObjectId } from 'mongodb';
import { getDb, closeMongo } from '../config/mongo.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PAMM_REF_PREFIX = /^pamm/i;

function parseArgs(argv) {
  const out = { account: '', out: '' };
  const pos = [];
  for (const a of argv.slice(2)) {
    const m = /^--([^=]+)=(.*)$/.exec(a);
    if (m) {
      if (m[1] === 'account') out.account = m[2].trim();
      if (m[1] === 'out') out.out = m[2].trim();
    } else if (!a.startsWith('-')) pos.push(a);
  }
  if (!out.account && pos[0]) out.account = String(pos[0]).trim();
  return out;
}

function csvEscape(v) {
  const s = v == null ? '' : String(v);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function entityOrForUserId(uidStr) {
  const idStr = String(uidStr || '').trim();
  const or = [{ entityId: idStr }];
  if (idStr.length === 24 && ObjectId.isValid(idStr)) {
    or.push({ entityId: new ObjectId(idStr) });
  }
  if (/^\d+$/.test(idStr)) or.push({ entityId: Number(idStr) });
  return { $or: or };
}

async function main() {
  const args = parseArgs(process.argv);
  const accountRaw = args.account || process.env.EXPORT_ACCOUNT_NO || '';
  const accountNo = String(accountRaw).trim();
  if (!accountNo) {
    console.error('Usage: node scripts/export-pamm-ledger-account-csv.js <accountNo>');
    console.error('Example: TARGET_DB=test node scripts/export-pamm-ledger-account-csv.js 10020');
    process.exit(1);
  }

  const dbName = (process.env.TARGET_DB || process.env.MONGO_DATABASE || '').trim() || undefined;
  const db = await getDb(dbName);
  if (dbName) console.log('Using database:', db.databaseName);

  const acctNum = /^\d+$/.test(accountNo) ? Number(accountNo) : accountNo;
  const user = await db.collection('users').findOne({
    $or: [{ accountNo: acctNum }, { accountNo: accountNo }, { accountNo: String(accountNo) }],
  });
  if (!user) {
    console.error('No user found for accountNo:', accountNo);
    process.exit(1);
  }

  const uidStr = user._id.toString();
  const email = (user.email || '').toLowerCase();
  console.log('User:', email, '| user_id:', uidStr, '| accountNo:', user.accountNo ?? accountNo);

  const filter = {
    $and: [
      entityOrForUserId(uidStr),
      {
        $or: [{ referenceType: { $regex: PAMM_REF_PREFIX } }, { pammFundId: { $exists: true, $nin: [null, ''] } }],
      },
    ],
  };

  const rows = await db
    .collection('ledger_entries')
    .find(filter)
    .sort({ createdAt: 1 })
    .limit(50000)
    .toArray();

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const defaultOut = path.join(__dirname, '..', 'logs', `pamm-ledger-account-${accountNo}-${stamp}.csv`);
  const outPath = args.out || process.env.EXPORT_OUT || defaultOut;

  const header = [
    '_id',
    'createdAt',
    'accountCode',
    'entityId',
    'debit',
    'credit',
    'currency',
    'referenceType',
    'referenceId',
    'pammFundId',
    'description',
    'reference',
  ];
  const lines = [header.map(csvEscape).join(',')];

  for (const e of rows) {
    const id = e._id != null ? e._id.toString() : '';
    const createdAt = e.createdAt instanceof Date ? e.createdAt.toISOString() : e.createdAt || '';
    lines.push(
      [
        id,
        createdAt,
        e.accountCode,
        e.entityId != null ? String(e.entityId) : '',
        e.debit ?? '',
        e.credit ?? '',
        e.currency ?? '',
        e.referenceType ?? '',
        e.referenceId != null ? String(e.referenceId) : '',
        e.pammFundId != null ? String(e.pammFundId) : '',
        e.description ?? '',
        e.reference ?? '',
      ]
        .map(csvEscape)
        .join(',')
    );
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, lines.join('\n'), 'utf8');
  console.log('Rows:', rows.length);
  console.log('Wrote:', path.resolve(outPath));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => closeMongo().catch(() => {}));
