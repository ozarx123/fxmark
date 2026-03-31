/**
 * UI-only filters for investor-facing ledger / PAMM profit rows.
 * Admin panel roles see full data (caller skips filtering).
 */

/** First instant of 2026-03-31 UTC — rows at or after this use normal visibility rules. */
export const PAMM_HISTORICAL_CUTOFF_MS = Date.parse('2026-03-31T00:00:00.000Z');

const MARCH_30_UTC = '2026-03-30';

function utcYmd(isoOrDate) {
  if (isoOrDate == null) return '';
  const d = new Date(isoOrDate);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

/** Local calendar date YYYY-MM-DD (browser timezone) — PAMM AI review uses this for March 30 matching. */
export function localYmd(isoOrDate) {
  if (isoOrDate == null) return '';
  const d = new Date(isoOrDate);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const MARCH_30_REVIEW = '2026-03-30';

/** Wallet account code for client balance (ledger). */
export function isUserWalletAccountCode(code) {
  const c = String(code || '').trim();
  return c === '2110' || c === '1100';
}

/**
 * Internal / rollback rows — never show to investors.
 */
export function isInvestorHiddenInternalLedgerRow(entry) {
  const ref = String(entry?.referenceType || '').toLowerCase();
  const desc = String(entry?.description || '').toLowerCase();
  if (ref === 'pamm_dist_rb') return true;
  if (ref.includes('rollback')) return true;
  if (desc.includes('rollback')) return true;
  if (ref === 'pamm_dist_rollback') return true;
  if (ref.includes('pamm_ib_commission_rb')) return true;
  if (ref.includes('commission_rb')) return true;
  return false;
}

/**
 * Investor-facing PAMM profit credit on wallet (Bull Run distribution credit).
 */
export function isPammWalletProfitCredit(entry) {
  if (!entry || !isUserWalletAccountCode(entry.accountCode)) return false;
  if (String(entry.referenceType || '') !== 'pamm_dist') return false;
  return Number(entry.credit) > 0;
}

/**
 * Wallet leg for PAMM loss distribution (debit to investor) — hide from investor UI cleanup.
 */
export function isPammWalletLossDistribution(entry) {
  if (!entry || !isUserWalletAccountCode(entry.accountCode)) return false;
  if (String(entry.referenceType || '') !== 'pamm_dist') return false;
  return Number(entry.debit) > 0;
}

/**
 * Wallet credit from a normal deposit (PSP / manual confirm), not PAMM profit.
 */
export function isWalletDepositCredit(entry) {
  if (!entry || !isUserWalletAccountCode(entry.accountCode)) return false;
  if (String(entry.referenceType || '') !== 'deposit') return false;
  return Number(entry.credit) > 0;
}

/**
 * Historical cleanup: before 2026-03-31 UTC, only March 30, 2026 profit credits remain visible.
 * On/after that date, all valid profit credits (that pass other rules) show — no permanent cap.
 */
export function passesHistoricalMarch30ProfitWindow(entry) {
  if (!isPammWalletProfitCredit(entry)) return true;
  const t = new Date(entry.createdAt).getTime();
  if (Number.isNaN(t)) return true;
  if (t >= PAMM_HISTORICAL_CUTOFF_MS) return true;
  return utcYmd(entry.createdAt) === MARCH_30_UTC;
}

/**
 * Full investor-safe ledger list for main app (Finance, Dashboard).
 */
export function filterInvestorLedgerEntries(entries) {
  if (!Array.isArray(entries)) return [];
  return entries.filter((e) => {
    if (isInvestorHiddenInternalLedgerRow(e)) return false;
    if (isPammWalletLossDistribution(e)) return false;
    if (!passesHistoricalMarch30ProfitWindow(e)) return false;
    return true;
  });
}

/**
 * Ledger rows for one fund’s investor profit table (Bull Run fund detail).
 */
export function filterInvestorPammFundProfitRows(entries, fundId) {
  const fid = fundId != null ? String(fundId) : '';
  const base = filterInvestorLedgerEntries(entries);
  return base.filter((e) => {
    if (!isPammWalletProfitCredit(e)) return false;
    const pf = e.pammFundId != null ? String(e.pammFundId) : '';
    if (!fid) return true;
    if (!pf) return true;
    return pf === fid;
  });
}

/**
 * Sum of wallet credits for visible PAMM profit rows (March 30 window + internal rules already applied).
 */
export function sumVisiblePammProfitCreditsUsd(entries) {
  if (!Array.isArray(entries)) return 0;
  return entries.reduce((s, e) => {
    if (!isPammWalletProfitCredit(e)) return s;
    return s + (Number(e.credit) || 0);
  }, 0);
}

/**
 * Admin / manager: all wallet-account ledger rows tied to this fund (no investor hiding).
 */
export function rawWalletLedgerRowsForPammFund(entries, fundId) {
  const fid = fundId != null ? String(fundId) : '';
  if (!Array.isArray(entries)) return [];
  return entries.filter((e) => {
    if (!isUserWalletAccountCode(e.accountCode)) return false;
    const pf = e.pammFundId != null ? String(e.pammFundId) : '';
    if (!fid) return true;
    if (!pf) return true;
    return pf === fid;
  });
}

/**
 * PAMM AI investor review only: ledger `deposit` credits + `pamm_dist` wallet credits on local 2026-03-30 for this fund.
 * Excludes future/other dates, rollbacks, loss debits, internal rows. UI-only.
 *
 * @param {Array} entriesRaw - raw ledger from API
 * @param {string} [fundId] - limit March 30 profit to this fund (pammFundId); deposits are account-wide
 */
export function computePammAiInvestorReviewUsd(entriesRaw, fundId) {
  const fid = fundId != null ? String(fundId) : '';
  let deposit = 0;
  let profitMarch30 = 0;
  for (const e of entriesRaw || []) {
    if (isInvestorHiddenInternalLedgerRow(e)) continue;
    if (isPammWalletLossDistribution(e)) continue;
    if (!isUserWalletAccountCode(e.accountCode)) continue;
    if (isWalletDepositCredit(e)) {
      deposit += Number(e.credit) || 0;
    }
    if (isPammWalletProfitCredit(e) && localYmd(e.createdAt) === MARCH_30_REVIEW) {
      const pf = e.pammFundId != null ? String(e.pammFundId) : '';
      if (fid && pf && pf !== fid) continue;
      profitMarch30 += Number(e.credit) || 0;
    }
  }
  return {
    deposit,
    profitMarch30,
    displayBalance: deposit + profitMarch30,
  };
}

/**
 * Table rows: March 30 (local) pamm_dist credits for this fund only — investor PAMM AI ledger section.
 */
export function filterPammAiInvestorReviewFundProfitRows(entriesRaw, fundId) {
  const fid = fundId != null ? String(fundId) : '';
  return (entriesRaw || []).filter((e) => {
    if (isInvestorHiddenInternalLedgerRow(e)) return false;
    if (!isPammWalletProfitCredit(e)) return false;
    if (localYmd(e.createdAt) !== MARCH_30_REVIEW) return false;
    const pf = e.pammFundId != null ? String(e.pammFundId) : '';
    if (fid && pf && pf !== fid) return false;
    return true;
  });
}
