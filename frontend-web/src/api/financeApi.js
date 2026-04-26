import { getApiBase } from '../config/apiBase.js';

/**
 * Finance API — ledger, reports, P&L (requires Bearer token)
 */
const API_BASE = getApiBase();

function getToken() {
  return localStorage.getItem('fxmark_token');
}

async function fetchWithAuth(url, options = {}) {
  const token = getToken();
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${url}`, { ...options, headers });
  return res;
}

/** Get ledger entries (optionally filter by referenceType e.g. 'pamm_dist' for PAMM profit allocations) */
export async function getLedgerEntries(params = {}) {
  const q = new URLSearchParams();
  if (params.accountCode) q.set('accountCode', params.accountCode);
  if (params.referenceType) q.set('referenceType', params.referenceType);
  if (params.from) q.set('from', params.from);
  if (params.to) q.set('to', params.to);
  if (params.limit) q.set('limit', params.limit);
  const url = `/finance/ledger/entries${q.toString() ? `?${q}` : ''}`;
  const res = await fetchWithAuth(url);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to load entries');
  return res.json();
}

/** Get ledger balances by account */
export async function getLedgerBalances(params = {}) {
  const q = new URLSearchParams();
  if (params.asOf) q.set('asOf', params.asOf);
  const url = `/finance/ledger/balances${q.toString() ? `?${q}` : ''}`;
  const res = await fetchWithAuth(url);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to load balances');
  return res.json();
}

/** Get P&L summary */
export async function getPnl(params = {}) {
  const q = new URLSearchParams();
  if (params.from) q.set('from', params.from);
  if (params.to) q.set('to', params.to);
  const url = `/finance/ledger/pnl${q.toString() ? `?${q}` : ''}`;
  const res = await fetchWithAuth(url);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to load P&L');
  return res.json();
}

/** Get reconciliation (wallet vs ledger) */
export async function getReconciliation(currency = 'USD') {
  const res = await fetchWithAuth(`/finance/ledger/reconciliation?currency=${currency}`);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to reconcile');
  return res.json();
}

/** Get daily report */
export async function getDailyReport() {
  const res = await fetchWithAuth('/finance/reports/daily');
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to load report');
  return res.json();
}

/** Get monthly report */
export async function getMonthlyReport(year, month) {
  const q = new URLSearchParams();
  if (year) q.set('year', year);
  if (month) q.set('month', month);
  const url = `/finance/reports/monthly${q.toString() ? `?${q}` : ''}`;
  const res = await fetchWithAuth(url);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to load report');
  return res.json();
}

/** Get statement (custom date range) */
export async function getStatement(params = {}) {
  const q = new URLSearchParams();
  if (params.from) q.set('from', params.from);
  if (params.to) q.set('to', params.to);
  if (params.accountCode) q.set('accountCode', params.accountCode);
  if (params.limit) q.set('limit', params.limit);
  const url = `/finance/statements${q.toString() ? `?${q}` : ''}`;
  const res = await fetchWithAuth(url);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to load statement');
  return res.json();
}

function triggerBlobDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Download statement as CSV or PDF (authenticated GET, same query params as getStatement).
 * @param {'csv'|'pdf'} kind
 */
export async function downloadStatementFile(params, kind, filename) {
  const q = new URLSearchParams();
  if (params.from) q.set('from', params.from);
  if (params.to) q.set('to', params.to);
  if (params.accountCode) q.set('accountCode', params.accountCode);
  if (params.limit) q.set('limit', params.limit);
  const path = kind === 'pdf' ? '/finance/statements.pdf' : '/finance/statements.csv';
  const url = `${API_BASE}${path}${q.toString() ? `?${q}` : ''}`;
  const token = getToken();
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, { headers });
  if (!res.ok) {
    let msg = 'Download failed';
    try {
      const j = await res.json();
      if (j.error) msg = j.error;
    } catch (_) {
      /* ignore */
    }
    throw new Error(msg);
  }
  const blob = await res.blob();
  triggerBlobDownload(blob, filename);
}

