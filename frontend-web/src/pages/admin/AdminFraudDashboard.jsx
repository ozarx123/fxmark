import React, { useState, useEffect, useCallback } from 'react';
import {
  getFraudDashboardStats,
  getWithdrawals,
  getWithdrawalDetail,
  updateWithdrawalStatus,
} from '../../api/adminApi';

const RISK_OPTIONS = [
  { value: '', label: 'All risk' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
];
const STATUS_OPTIONS = [
  { value: '', label: 'All status' },
  { value: 'pending', label: 'Pending' },
  { value: 'review', label: 'Review' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'completed', label: 'Completed' },
];

function formatDate(d) {
  if (!d) return '—';
  const x = typeof d === 'string' ? new Date(d) : d;
  return x.toLocaleString();
}
function formatCurrency(amount, currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount ?? 0);
}

export default function AdminFraudDashboard() {
  const [stats, setStats] = useState(null);
  const [withdrawals, setWithdrawals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [detailId, setDetailId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [adminNote, setAdminNote] = useState('');
  const [filters, setFilters] = useState({
    risk: '',
    status: '',
    from: '',
    to: '',
    amountMin: '',
    amountMax: '',
    search: '',
  });

  const loadStats = useCallback(async () => {
    try {
      const data = await getFraudDashboardStats();
      setStats(data);
    } catch (e) {
      setError(e.message || 'Failed to load stats');
    }
  }, []);

  const loadWithdrawals = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = { limit: 100 };
      if (filters.risk) params.risk = filters.risk;
      if (filters.status) params.status = filters.status;
      if (filters.from) params.from = filters.from;
      if (filters.to) params.to = filters.to;
      if (filters.amountMin) params.amountMin = filters.amountMin;
      if (filters.amountMax) params.amountMax = filters.amountMax;
      if (filters.search) params.search = filters.search;
      const list = await getWithdrawals(params);
      setWithdrawals(Array.isArray(list) ? list : []);
    } catch (e) {
      setError(e.message || 'Failed to load withdrawals');
      setWithdrawals([]);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);
  useEffect(() => {
    loadWithdrawals();
  }, [loadWithdrawals]);

  useEffect(() => {
    if (!detailId) {
      setDetail(null);
      return;
    }
    getWithdrawalDetail(detailId)
      .then(setDetail)
      .catch(() => setDetail(null));
  }, [detailId]);

  const handleStatusChange = async (id, status) => {
    setActionLoading(true);
    try {
      await updateWithdrawalStatus(id, status, adminNote);
      setAdminNote('');
      setDetail(null);
      setDetailId(null);
      loadWithdrawals();
      loadStats();
    } catch (e) {
      setError(e.message || 'Update failed');
    } finally {
      setActionLoading(false);
    }
  };

  const riskBadgeClass = (score) => {
    if (score == null) return '';
    if (score >= 70) return 'risk-high';
    if (score >= 41) return 'risk-medium';
    return 'risk-low';
  };

  return (
    <div className="page admin-page admin-fraud-dashboard">
      <header className="page-header">
        <h1>Fraud monitoring</h1>
        <p className="page-subtitle">Withdrawals, risk scores, and reconciliation</p>
      </header>

      {error && (
        <div className="admin-error" role="alert">
          {error}
        </div>
      )}

      {/* Summary cards */}
      <section className="fraud-summary-cards">
        <div className="fraud-card">
          <span className="fraud-card-value risk-high">{stats?.highRiskToday ?? '—'}</span>
          <span className="fraud-card-label">High risk (today)</span>
        </div>
        <div className="fraud-card">
          <span className="fraud-card-value risk-medium">{stats?.mediumRiskToday ?? '—'}</span>
          <span className="fraud-card-label">Medium risk (today)</span>
        </div>
        <div className="fraud-card">
          <span className="fraud-card-value">{stats?.blockedToday ?? '—'}</span>
          <span className="fraud-card-label">Blocked (today)</span>
        </div>
        <div className="fraud-card">
          <span className="fraud-card-value">{stats?.reconciliationMismatches ?? '—'}</span>
          <span className="fraud-card-label">Recon mismatches</span>
        </div>
        <div className="fraud-card">
          <span className="fraud-card-value">{stats?.totalWithdrawalsToday ?? '—'}</span>
          <span className="fraud-card-label">Withdrawals today</span>
        </div>
      </section>

      {/* Filters */}
      <section className="fraud-filters">
        <div className="filter-group">
          <label>Risk</label>
          <select
            value={filters.risk}
            onChange={(e) => setFilters((f) => ({ ...f, risk: e.target.value }))}
            className="filter-select"
          >
            {RISK_OPTIONS.map((o) => (
              <option key={o.value || 'all'} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div className="filter-group">
          <label>Status</label>
          <select
            value={filters.status}
            onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
            className="filter-select"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value || 'all'} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div className="filter-group">
          <label>From</label>
          <input
            type="date"
            value={filters.from}
            onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))}
            className="filter-input"
          />
        </div>
        <div className="filter-group">
          <label>To</label>
          <input
            type="date"
            value={filters.to}
            onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))}
            className="filter-input"
          />
        </div>
        <div className="filter-group">
          <label>Amount min</label>
          <input
            type="number"
            placeholder="Min"
            value={filters.amountMin}
            onChange={(e) => setFilters((f) => ({ ...f, amountMin: e.target.value }))}
            className="filter-input"
          />
        </div>
        <div className="filter-group">
          <label>Amount max</label>
          <input
            type="number"
            placeholder="Max"
            value={filters.amountMax}
            onChange={(e) => setFilters((f) => ({ ...f, amountMax: e.target.value }))}
            className="filter-input"
          />
        </div>
        <div className="filter-group">
          <label>Search (user / ID)</label>
          <input
            type="text"
            placeholder="User or withdrawal ID"
            value={filters.search}
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
            className="filter-input"
          />
        </div>
        <button type="button" className="btn btn-secondary" onClick={loadWithdrawals}>
          Apply
        </button>
      </section>

      {/* Table */}
      <section className="fraud-table-section">
        <h2>Withdrawals</h2>
        {loading ? (
          <p className="muted">Loading…</p>
        ) : (
          <div className="table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>User</th>
                  <th>Amount</th>
                  <th>Risk</th>
                  <th>Flags</th>
                  <th>Status</th>
                  <th>Time</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {withdrawals.length === 0 ? (
                  <tr>
                    <td colSpan={8}>No withdrawals match filters</td>
                  </tr>
                ) : (
                  withdrawals.map((w) => (
                    <tr key={w.id} className={riskBadgeClass(w.fraudRiskScore)}>
                      <td><code className="withdrawal-id">{w.id?.slice(-8)}</code></td>
                      <td>{w.userId}</td>
                      <td>{formatCurrency(w.amount, w.currency)}</td>
                      <td>
                        <span className={`risk-badge ${riskBadgeClass(w.fraudRiskScore)}`}>
                          {w.fraudRiskScore != null ? w.fraudRiskScore : '—'}
                        </span>
                      </td>
                      <td>{(w.fraudRiskFlags || []).join(', ') || '—'}</td>
                      <td><span className={`status-badge status-${w.status}`}>{w.status}</span></td>
                      <td>{formatDate(w.createdAt)}</td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-sm"
                          onClick={() => setDetailId(w.id)}
                        >
                          View
                        </button>
                        {w.status === 'pending' && (
                          <>
                            <button
                              type="button"
                              className="btn btn-sm"
                              onClick={() => handleStatusChange(w.id, 'review')}
                              disabled={actionLoading}
                            >
                              To review
                            </button>
                            <button
                              type="button"
                              className="btn btn-sm btn-danger"
                              onClick={() => handleStatusChange(w.id, 'rejected')}
                              disabled={actionLoading}
                            >
                              Reject
                            </button>
                          </>
                        )}
                        {w.status === 'review' && (
                          <>
                            <button
                              type="button"
                              className="btn btn-sm btn-success"
                              onClick={() => handleStatusChange(w.id, 'approved')}
                              disabled={actionLoading}
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              className="btn btn-sm btn-danger"
                              onClick={() => handleStatusChange(w.id, 'rejected')}
                              disabled={actionLoading}
                            >
                              Reject
                            </button>
                          </>
                        )}
                        {w.status === 'approved' && (
                          <button
                            type="button"
                            className="btn btn-sm btn-danger"
                            onClick={() => handleStatusChange(w.id, 'rejected')}
                            disabled={actionLoading}
                          >
                            Reject
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Detail drawer */}
      {detail && (
        <div className="drawer-overlay" onClick={() => setDetailId(null)}>
          <div className="drawer-panel" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header">
              <h3>Withdrawal {detail.id?.slice(-8)}</h3>
              <button type="button" className="btn btn-sm" onClick={() => setDetailId(null)}>Close</button>
            </div>
            <div className="drawer-body">
              <p><strong>User</strong> {detail.userId}</p>
              <p><strong>Amount</strong> {formatCurrency(detail.amount, detail.currency)}</p>
              <p><strong>Status</strong> <span className={`status-badge status-${detail.status}`}>{detail.status}</span></p>
              <p><strong>Risk score</strong> <span className={`risk-badge ${riskBadgeClass(detail.fraudRiskScore)}`}>{detail.fraudRiskScore ?? '—'}</span></p>
              <p><strong>Flags</strong> {(detail.fraudRiskFlags || []).join(', ') || '—'}</p>
              <p><strong>Checked at</strong> {formatDate(detail.fraudCheckedAt)}</p>
              <p><strong>Created</strong> {formatDate(detail.createdAt)}</p>
              <p><strong>Completed</strong> {formatDate(detail.completedAt)}</p>
              {(detail.approvedBy || detail.approvedAt) && (
                <p><strong>Approved by</strong> {detail.approvedBy || '—'} {detail.approvedAt ? `at ${formatDate(detail.approvedAt)}` : ''}</p>
              )}
              {(detail.rejectedBy || detail.rejectedAt) && (
                <p><strong>Rejected by</strong> {detail.rejectedBy || '—'} {detail.rejectedAt ? `at ${formatDate(detail.rejectedAt)}` : ''}</p>
              )}
              {detail.adminNote && (
                <p><strong>Admin note</strong> {detail.adminNote}</p>
              )}
              <hr />
              <label className="filter-group" style={{ display: 'block', marginBottom: 8 }}>
                <span>Admin note (optional)</span>
                <textarea
                  className="filter-input"
                  style={{ width: '100%', minHeight: 64 }}
                  value={adminNote}
                  onChange={(e) => setAdminNote(e.target.value)}
                  placeholder="Reason / reference for approve or reject"
                  maxLength={2000}
                />
              </label>
              <p><strong>Flow</strong> pending → review → approved → completed (via user process)</p>
              {detail.status === 'pending' && (
                <div className="drawer-actions">
                  <button type="button" className="btn btn-secondary" onClick={() => handleStatusChange(detail.id, 'review')} disabled={actionLoading}>Send to review</button>
                  <button type="button" className="btn btn-danger" onClick={() => handleStatusChange(detail.id, 'rejected')} disabled={actionLoading}>Reject</button>
                </div>
              )}
              {detail.status === 'review' && (
                <div className="drawer-actions">
                  <button type="button" className="btn btn-success" onClick={() => handleStatusChange(detail.id, 'approved')} disabled={actionLoading}>Approve</button>
                  <button type="button" className="btn btn-danger" onClick={() => handleStatusChange(detail.id, 'rejected')} disabled={actionLoading}>Reject</button>
                </div>
              )}
              {detail.status === 'approved' && (
                <div className="drawer-actions">
                  <button type="button" className="btn btn-danger" onClick={() => handleStatusChange(detail.id, 'rejected')} disabled={actionLoading}>Reject (before payout)</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
