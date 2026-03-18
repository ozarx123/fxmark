/**
 * Fetch and print latest PAMM IB commission (last 7 days by default).
 * Table: Date | Investor | IB | Commission (USD)
 * Run from backend: node scripts/fetch-latest-ib-commission.js
 * Option: node scripts/fetch-latest-ib-commission.js 14   (last 14 days)
 */
import 'dotenv/config';
import { ObjectId } from 'mongodb';
import { getDb } from '../config/mongo.js';
import ibRepo from '../modules/ib/ib.repository.js';

const days = Math.min(parseInt(process.argv[2], 10) || 7, 90);
const to = new Date();
const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);

console.log('Latest PAMM IB commission (last', days, 'days)');
console.log('From:', from.toISOString().slice(0, 10), 'To:', to.toISOString().slice(0, 10));
console.log('');

const logs = await ibRepo.listPammIbCommissionLogs({ from, to, limit: 200 });
if (logs.length === 0) {
  console.log('No PAMM commission entries in this period.');
  process.exit(0);
}

const allIds = new Set();
logs.forEach((l) => {
  if (l.investor_id) allIds.add(String(l.investor_id));
  if (l.ib_id) allIds.add(String(l.ib_id));
});
const idList = [...allIds];

const db = await getDb();
const usersCol = db.collection('users');
const userIds = idList.filter((id) => ObjectId.isValid(id) && id.length === 24).map((id) => new ObjectId(id));
const users = userIds.length ? await usersCol.find({ _id: { $in: userIds } }, { projection: { email: 1, name: 1 } }).toArray() : [];
const userMap = Object.fromEntries(users.map((u) => [u._id.toString(), u]));

function userName(id) {
  if (!id) return '—';
  const u = userMap[String(id)];
  return (u?.name && String(u.name).trim()) || u?.email || String(id);
}

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toISOString().slice(0, 19).replace('T', ' ');
}

const rows = logs.map((l) => ({
  date: formatDate(l.created_at),
  investorName: userName(l.investor_id),
  ibName: userName(l.ib_id),
  commission: Math.round((l.commission_amount ?? 0) * 100) / 100,
  level: l.level_number,
}));

const colDate = 20;
const colInvestor = Math.max(14, ...rows.map((r) => String(r.investorName).length));
const colIb = Math.max(14, ...rows.map((r) => String(r.ibName).length));
const header = `${'Date'.padEnd(colDate)} | ${'Investor'.padEnd(colInvestor)} | ${'IB'.padEnd(colIb)} | Lvl | Commission (USD)`;
const sep = '-'.repeat(colDate) + '-+-' + '-'.repeat(colInvestor) + '-+-' + '-'.repeat(colIb) + '-+---+------------';
console.log(header);
console.log(sep);
for (const r of rows) {
  console.log(`${r.date.padEnd(colDate)} | ${String(r.investorName).padEnd(colInvestor)} | ${String(r.ibName).padEnd(colIb)} | L${r.level ?? '?'} | ${r.commission.toFixed(2)}`);
}
console.log(sep);
const total = rows.reduce((s, r) => s + r.commission, 0);
console.log(`${''.padEnd(colDate)} | ${'Total'.padEnd(colInvestor)} | ${''.padEnd(colIb)} |    | ${total.toFixed(2)}`);
console.log('');
console.log('Entries:', logs.length);
