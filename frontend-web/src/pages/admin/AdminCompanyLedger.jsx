import React, { useState, useEffect, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import * as adminApi from '../../api/adminApi';

export default function AdminCompanyLedger() {
  const [searchParams] = useSearchParams();
  const from = searchParams.get('from') || '';
  const to = searchParams.get('to') || '';
  const accountCode = searchParams.get('accountCode') || '';
  const referenceType = searchParams.get('referenceType') || '';
  const accountClass = searchParams.get('accountClass') || '';
  const titleParam = searchParams.get('title') || '';

  const title = useMemo(() => {
    if (titleParam) {
      try {
        return decodeURIComponent(titleParam);
      } catch {
        return titleParam;
      }
    }
    if (accountCode) return `Account ${accountCode}`;
    if (referenceType) return `${referenceType} (wallet legs)`;
    if (accountClass === 'revenue') return 'Revenue accounts (4xxx)';
    if (accountClass === 'expense') return 'Expense accounts (5xxx)';
    if (accountClass === 'pl') return 'Revenue & expense (4xxx / 5xxx)';
    return 'Platform ledger';
  }, [titleParam, accountCode, referenceType, accountClass]);

  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!from || !to) {
        setLoading(false);
        setError('Select a date range on Company financials and open a metric from there.');
        return;
      }
      try {
        setLoading(true);
        setError(null);
        const res = await adminApi.getCompanyLedgerEntries({
          from,
          to,
          accountCode: accountCode || undefined,
          referenceType: referenceType || undefined,
          accountClass: accountClass || undefined,
          limit: 500,
        });
        if (!cancelled) setEntries(res.entries || []);
      } catch (e) {
        if (!cancelled) setError(e.message || 'Failed to load entries');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [from, to, accountCode, referenceType, accountClass]);

  const qBack = useMemo(() => {
    const q = new URLSearchParams();
    if (from) q.set('from', from);
    if (to) q.set('to', to);
    const s = q.toString();
    return s ? `?${s}` : '';
  }, [from, to]);

  return (
    <div className="page admin-page admin-financials admin-company-ledger">
      <header className="page-header">
        <Link to={`/admin/financials${qBack}`} className="btn-link back-link">
          ← Company financials
        </Link>
        <h1 style={{ marginTop: '0.75rem' }}>{title}</h1>
        <p className="page-subtitle">
          Platform ledger lines · {from} → {to}
          {accountCode && ` · account ${accountCode}`}
          {referenceType && ` · ref ${referenceType}`}
          {accountClass && ` · class ${accountClass}`}
        </p>
        {referenceType === 'commission' && accountCode === '1300' && (
          <p className="muted" style={{ marginTop: '0.5rem' }}>
            IB commission accruals (receivables). For payout queue see{' '}
            <Link to="/admin/ib-commission">IB &amp; commission</Link>.
          </p>
        )}
      </header>

      {loading && <p className="muted">Loading ledger…</p>}
      {error && <p className="form-error">{error}</p>}

      {!loading && !error && (
        <div className="table-wrap">
          <table className="table financial-table">
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Account</th>
                <th scope="col">Entity</th>
                <th scope="col">Ref type</th>
                <th scope="col">Description</th>
                <th scope="col" className="amount">
                  Debit
                </th>
                <th scope="col" className="amount">
                  Credit
                </th>
              </tr>
            </thead>
            <tbody>
              {!entries.length ? (
                <tr>
                  <td colSpan={7} className="empty-cell">
                    No matching ledger lines in this period.
                  </td>
                </tr>
              ) : (
                entries.map((e) => (
                  <tr key={e.id}>
                    <td>{e.createdAt ? String(e.createdAt).slice(0, 19).replace('T', ' ') : '—'}</td>
                    <td>
                      <code>{e.accountCode}</code> {e.accountName || ''}
                    </td>
                    <td>
                      <code className="admin-profit-code">{String(e.entityId || '—').slice(0, 14)}</code>
                    </td>
                    <td>{e.referenceType || '—'}</td>
                    <td>{e.description || e.referenceId || '—'}</td>
                    <td className="amount">{Number(e.debit || 0).toFixed(2)}</td>
                    <td className="amount">{Number(e.credit || 0).toFixed(2)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {!loading && entries.length > 0 && (
        <p className="muted" style={{ marginTop: '1rem' }}>
          Showing up to 500 most recent lines. Totals on Company financials are aggregated separately.
        </p>
      )}
    </div>
  );
}
