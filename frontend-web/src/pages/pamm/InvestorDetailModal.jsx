import React, { useState, useEffect, useCallback } from 'react';
import * as pammApi from '../../api/pammApi';

const formatCurrency = (n, decimals = 2) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n ?? 0);

const formatDate = (d) => (d ? new Date(d).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—');

function normFollowerId(inv) {
  if (!inv) return '';
  const v = inv.followerId ?? inv.follower_id ?? inv.userId;
  if (v == null) return '';
  if (typeof v === 'object' && v.$oid) return String(v.$oid);
  return String(v);
}

function headerName(inv, followerId) {
  const n = String(inv?.investorFullName || inv?.investorName || inv?.name || '').trim();
  if (n) return n;
  if (inv?.investorEmail) return inv.investorEmail;
  return followerId || 'Investor';
}

/**
 * @param {object} props
 * @param {string} props.fundId
 * @param {object} props.investor
 * @param {function} props.onClose
 */
export default function InvestorDetailModal({ fundId, investor, onClose }) {
  const followerId = normFollowerId(investor);
  const investorEmail = investor?.investorEmail ?? investor?.email ?? null;
  const allocatedBalance = Number(investor?.allocatedBalance) || 0;
  const realizedPnl = Number(investor?.realizedPnl) || 0;

  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!fundId || !followerId) {
      setLoading(false);
      setError(!followerId ? 'Could not resolve investor ID.' : '');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = await pammApi.getInvestorDetail(fundId, followerId);
      setDetail(data);
    } catch (e) {
      setError(e.message || 'Failed to load investor detail');
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [fundId, followerId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const log = detail?.depositWithdrawLog ?? [];
  const totalInvested = detail != null ? Number(detail.totalInvested) : null;
  const totalProfit = detail != null ? Number(detail.totalProfit) : null;
  const roi = detail?.roi != null ? Number(detail.roi) : null;
  const currentValue = detail?.currentActiveCapital ?? detail?.currentValue ?? allocatedBalance;

  const title = headerName(investor, followerId);
  const subEmail = investorEmail || detail?.investorEmail || null;

  const roiDisplay =
    totalInvested != null && totalInvested === 0 ? '0.00%' : `${Number(roi ?? 0).toFixed(2)}%`;

  return (
    <div
      className="modal-overlay bullrun-modal investor-detail-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="investor-modal-title"
    >
      <div className="modal-content investor-detail-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header-row">
          <h3 id="investor-modal-title">{title}</h3>
          <button type="button" className="btn-icon-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        {subEmail && <p className="muted investor-modal-email">{subEmail}</p>}

        {/* SECTION A — Deposit / withdraw log */}
        <section className="investor-modal-section">
          <h4 className="investor-modal-section-title">Deposit / withdraw log</h4>
          <p className="muted investor-modal-hint">Fund-linked activity only (this investor · this fund).</p>
          {loading && <p className="muted">Loading…</p>}
          {!loading && error && (
            <p className="muted">Unable to load deposit and withdraw activity. You can retry from the list.</p>
          )}
          {!loading && !error && log.length === 0 && (
            <p className="muted">No deposit/withdraw history found</p>
          )}
          {!loading && !error && log.length > 0 && (
            <div className="table-wrap investor-modal-table-wrap">
              <table className="table pamm-table">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Amount</th>
                    <th>Date</th>
                    {log.some((r) => r.status != null && r.status !== '') && <th>Status</th>}
                    {log.some((r) => r.referenceId) && <th>Reference ID</th>}
                  </tr>
                </thead>
                <tbody>
                  {log.map((row, i) => (
                    <tr key={i}>
                      <td>{row.type || '—'}</td>
                      <td>{formatCurrency(row.amount, 2)}</td>
                      <td>{formatDate(row.date)}</td>
                      {log.some((r) => r.status != null && r.status !== '') && (
                        <td>{row.status ?? '—'}</td>
                      )}
                      {log.some((r) => r.referenceId) && (
                        <td className="investor-ref-cell">
                          {row.referenceId ? String(row.referenceId) : '—'}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* SECTION B — Profit / ROI */}
        <section className="investor-modal-section">
          <h4 className="investor-modal-section-title">Profit / ROI details</h4>
          {loading && <p className="muted">Loading…</p>}
          {!loading && detail && Number.isFinite(totalInvested) && (
            <div className="investor-roi-grid">
              <div className="investor-roi-item">
                <span className="investor-roi-label">Total invested</span>
                <span className="investor-roi-value">{formatCurrency(totalInvested, 2)}</span>
              </div>
              <div className="investor-roi-item">
                <span className="investor-roi-label">Total profit</span>
                <span className={`investor-roi-value ${(totalProfit ?? 0) >= 0 ? 'positive' : 'negative'}`}>
                  {formatCurrency(totalProfit ?? 0, 2)}
                </span>
              </div>
              <div className="investor-roi-item">
                <span className="investor-roi-label">ROI %</span>
                <span className={`investor-roi-value ${(roi ?? 0) >= 0 ? 'positive' : 'negative'}`}>
                  {roiDisplay}
                </span>
              </div>
              <div className="investor-roi-item">
                <span className="investor-roi-label">Current active capital</span>
                <span className="investor-roi-value">{formatCurrency(currentValue, 2)}</span>
              </div>
              <div className="investor-roi-item">
                <span className="investor-roi-label">Current value</span>
                <span className="investor-roi-value">{formatCurrency(currentValue, 2)}</span>
              </div>
            </div>
          )}
          {!loading && error && (
            <div className="investor-roi-grid investor-roi-grid--fallback">
              <p className="muted" style={{ gridColumn: '1 / -1', marginBottom: '0.5rem' }}>
                Ledger-based ROI unavailable. Allocation figures for this fund:
              </p>
              <div className="investor-roi-item">
                <span className="investor-roi-label">Current active capital</span>
                <span className="investor-roi-value">{formatCurrency(allocatedBalance, 2)}</span>
              </div>
              <div className="investor-roi-item">
                <span className="investor-roi-label">Recorded realized P&amp;L</span>
                <span className={`investor-roi-value ${realizedPnl >= 0 ? 'positive' : 'negative'}`}>
                  {formatCurrency(realizedPnl, 2)}
                </span>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
