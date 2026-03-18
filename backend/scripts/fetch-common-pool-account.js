/**
 * Fetch common pool account (company commission pool).
 * Shows overflow from PAMM IB daily cap that was credited to the company pool.
 *
 * Usage (from backend directory):
 *   node scripts/fetch-common-pool-account.js           # all entries (latest 500)
 *   node scripts/fetch-common-pool-account.js 7         # last 7 days
 *   node scripts/fetch-common-pool-account.js --json    # output as JSON
 *
 * Or via npm:
 *   npm run fetch-common-pool-account
 *   npm run fetch-common-pool-account -- 30
 *   npm run fetch-common-pool-account -- --json
 */
import 'dotenv/config';
import ibRepo from '../modules/ib/ib.repository.js';

const args = process.argv.slice(2);
const jsonOut = args.includes('--json');
const numArg = args.find((a) => !a.startsWith('--') && /^\d+$/.test(a));
const days = numArg ? Math.min(parseInt(numArg, 10), 365) : null;

let from;
let to;
let label;

if (days != null) {
  to = new Date();
  from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
  label = `Last ${days} days`;
} else {
  from = null;
  to = null;
  label = 'All time (latest 500)';
}

const { entries, totalAmount } = await ibRepo.listCompanyCommissionPoolEntries(
  days != null ? { from, to, limit: 500 } : { limit: 500 }
);

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toISOString().slice(0, 19).replace('T', ' ');
}

if (jsonOut) {
  console.log(JSON.stringify({
    label,
    from: from?.toISOString() ?? null,
    to: to?.toISOString() ?? null,
    entries: entries.map((e) => ({ ...e, amount: Math.round((e.amount ?? 0) * 100) / 100 })),
    totalAmount,
    count: entries.length,
  }, null, 2));
  process.exit(0);
}

console.log('Common pool account (company commission pool)');
console.log(label);
if (days != null) {
  console.log('From:', from.toISOString().slice(0, 10), 'To:', to.toISOString().slice(0, 10));
}
console.log('');

if (entries.length === 0) {
  console.log('No entries in this period.');
  process.exit(0);
}

const rows = entries.map((e) => ({
  date: formatDate(e.created_at),
  source: e.source || '—',
  ib_id: e.ib_id || '—',
  investor_id: e.investor_id || '—',
  trade_id: e.trade_id || '—',
  level: e.level_number ?? '—',
  amount: Math.round((e.amount ?? 0) * 100) / 100,
}));

const colDate = 20;
const colSource = Math.max(18, ...rows.map((r) => String(r.source).length));
const colIb = Math.max(10, ...rows.map((r) => String(r.ib_id).slice(-8).length));
const colAmount = 12;
const header = `${'Date'.padEnd(colDate)} | ${'Source'.padEnd(colSource)} | ${'IB id'.padEnd(colIb)} | Lvl | Amount (USD)`;
const sep = '-'.repeat(colDate) + '-+-' + '-'.repeat(colSource) + '-+-' + '-'.repeat(colIb) + '-+---+------------';
console.log(header);
console.log(sep);
for (const r of rows) {
  const ibShort = String(r.ib_id).length > 10 ? String(r.ib_id).slice(-8) : r.ib_id;
  console.log(`${r.date.padEnd(colDate)} | ${String(r.source).padEnd(colSource)} | ${String(ibShort).padEnd(colIb)} | L${r.level} | ${r.amount.toFixed(2)}`);
}
console.log(sep);
console.log(`${''.padEnd(colDate)} | ${''.padEnd(colSource)} | ${''.padEnd(colIb)} |    | ${totalAmount.toFixed(2)}  (total)`);
console.log('');
console.log('Entries:', entries.length);
