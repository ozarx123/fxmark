/**
 * PAMM commission fetch script — fetch and print PAMM IB commission data.
 *
 * Usage (from backend directory):
 *   node scripts/fetch-pamm-commission.js           # today (UTC)
 *   node scripts/fetch-pamm-commission.js 7        # last 7 days
 *   node scripts/fetch-pamm-commission.js 30       # last 30 days
 *   node scripts/fetch-pamm-commission.js --json   # today as JSON
 *   node scripts/fetch-pamm-commission.js 7 --json # last 7 days as JSON
 *
 * Or via npm:
 *   npm run fetch-pamm-commission
 *   npm run fetch-pamm-commission -- 14
 *   npm run fetch-pamm-commission -- --json
 */
import 'dotenv/config';
import { ObjectId } from 'mongodb';
import { getDb } from '../config/mongo.js';
import ibRepo from '../modules/ib/ib.repository.js';

const args = process.argv.slice(2);
const jsonOut = args.includes('--json');
const numArg = args.find((a) => !a.startsWith('--') && /^\d+$/.test(a));
const days = numArg ? Math.min(parseInt(numArg, 10), 90) : null;

let from;
let to;
let label;

if (days != null) {
  to = new Date();
  from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
  label = `Last ${days} days`;
} else {
  const now = new Date();
  from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  to = new Date(from.getTime() + 24 * 60 * 60 * 1000 - 1);
  label = 'Today (UTC)';
}

const logs = days != null
  ? await ibRepo.listPammIbCommissionLogs({ from, to, limit: 500 })
  : await ibRepo.listPammIbCommissionLogs({ from, to, limit: 500 });

if (logs.length === 0) {
  if (jsonOut) {
    console.log(JSON.stringify({ label, from: from.toISOString(), to: to.toISOString(), entries: [], totalCommission: 0 }, null, 2));
  } else {
    console.log('PAMM commission fetch —', label);
    console.log('From:', from.toISOString().slice(0, 10), days != null ? `To: ${to.toISOString().slice(0, 10)}` : '');
    console.log('');
    console.log('No PAMM commission entries in this period.');
  }
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
  investor_id: l.investor_id,
  investor_name: userName(l.investor_id),
  ib_id: l.ib_id,
  ib_name: userName(l.ib_id),
  level_number: l.level_number,
  active_capital_base: l.active_capital_base,
  commission_percent: l.commission_percent,
  commission_amount: Math.round((l.commission_amount ?? 0) * 100) / 100,
  trade_id: l.trade_id,
  created_at: l.created_at,
}));

const totalCommission = rows.reduce((s, r) => s + r.commission_amount, 0);

if (jsonOut) {
  console.log(JSON.stringify({
    label,
    from: from.toISOString(),
    to: to.toISOString(),
    entries: rows,
    totalCommission: Math.round(totalCommission * 100) / 100,
    count: rows.length,
  }, null, 2));
  process.exit(0);
}

console.log('PAMM commission fetch —', label);
console.log(days != null ? `From: ${from.toISOString().slice(0, 10)}  To: ${to.toISOString().slice(0, 10)}` : `Date: ${from.toISOString().slice(0, 10)}`);
console.log('');

const colDate = 20;
const colInvestor = Math.max(14, ...rows.map((r) => String(r.investor_name).length));
const colIb = Math.max(14, ...rows.map((r) => String(r.ib_name).length));
const header = `${'Date'.padEnd(colDate)} | ${'Investor'.padEnd(colInvestor)} | ${'IB'.padEnd(colIb)} | Lvl | Commission (USD)`;
const sep = '-'.repeat(colDate) + '-+-' + '-'.repeat(colInvestor) + '-+-' + '-'.repeat(colIb) + '-+---+------------';
console.log(header);
console.log(sep);
for (const r of rows) {
  console.log(`${r.date.padEnd(colDate)} | ${String(r.investor_name).padEnd(colInvestor)} | ${String(r.ib_name).padEnd(colIb)} | L${r.level_number ?? '?'} | ${r.commission_amount.toFixed(2)}`);
}
console.log(sep);
console.log(`${''.padEnd(colDate)} | ${'Total'.padEnd(colInvestor)} | ${''.padEnd(colIb)} |    | ${totalCommission.toFixed(2)}`);
console.log('');
console.log('Entries:', rows.length);
