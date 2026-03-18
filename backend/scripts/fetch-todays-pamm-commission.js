/**
 * Fetch and print today's PAMM IB commission data (UTC day).
 * Table: Investor name | IB name | Commission (USD) — one row per (investor, IB) pair.
 * Run from backend: node scripts/fetch-todays-pamm-commission.js
 */
import 'dotenv/config';
import { ObjectId } from 'mongodb';
import { getDb } from '../config/mongo.js';
import ibRepo from '../modules/ib/ib.repository.js';

const now = new Date();
const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
console.log('Today (UTC):', startOfDay.toISOString().slice(0, 10));
console.log('');

const logs = await ibRepo.listPammIbCommissionLogs({});
if (logs.length === 0) {
  console.log('No PAMM commission entries for today.');
  process.exit(0);
}

// Collect all user ids (investors + IBs) from every log line
const allIds = new Set();
logs.forEach((l) => {
  if (l.investor_id) allIds.add(l.investor_id);
  if (l.ib_id) allIds.add(l.ib_id);
});
const idList = [...allIds];

const db = await getDb();
const usersCol = db.collection('users');
const userIds = idList.filter((id) => ObjectId.isValid(id) && id.length === 24).map((id) => new ObjectId(id));
const users = userIds.length ? await usersCol.find({ _id: { $in: userIds } }, { projection: { email: 1, name: 1 } }).toArray() : [];
const userMap = Object.fromEntries(users.map((u) => [u._id.toString(), u]));

function userName(id) {
  if (!id) return '—';
  const u = userMap[id];
  return (u?.name && String(u.name).trim()) || u?.email || id;
}

// One row per log entry: investor name, IB name, commission
const rows = logs.map((l) => ({
  investorName: userName(l.investor_id),
  ibName: userName(l.ib_id),
  commission: Math.round((l.commission_amount ?? 0) * 100) / 100,
}));

const colInvestor = Math.max(20, ...rows.map((r) => String(r.investorName).length));
const colIb = Math.max(20, ...rows.map((r) => String(r.ibName).length));
const header = `${'Investor'.padEnd(colInvestor)} | ${'IB (receives commission)'.padEnd(colIb)} | Commission (USD)`;
const sep = '-'.repeat(colInvestor) + '-+-' + '-'.repeat(colIb) + '-+-' + '-'.repeat(14);
console.log(header);
console.log(sep);
for (const r of rows) {
  console.log(`${String(r.investorName).padEnd(colInvestor)} | ${String(r.ibName).padEnd(colIb)} | ${r.commission.toFixed(2)}`);
}
console.log(sep);
const total = rows.reduce((s, r) => s + r.commission, 0);
console.log(`${'Total'.padEnd(colInvestor)} | ${''.padEnd(colIb)} | ${total.toFixed(2)}`);
console.log('');
console.log('Entries:', logs.length);
